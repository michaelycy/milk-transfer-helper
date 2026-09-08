-- ============================================================
-- V2 喂养闭环 + 计划闭环 Schema
--
-- 服务的 FR：A1–A3、B1、C1–C7、D1–D5、E1–E2、H4、G1(review_status)
-- 前置要求：已应用 20240523000000_init_schema.sql（认证基线）
-- 回滚方式：不可回滚（含 records → feed_records 改名与数据回填），
--           回滚将丢失 baby 关联回填与品牌迁移，如需回退请从备份恢复。
--
-- 要点（docs/spec/03-data-model.md）：
--   1. 全部用户表沿用 user_id default auth.uid() + own-policy RLS + 最小 grant
--   2. records → feed_records 改名重构；历史数据回填默认宝宝「宝宝」，品牌文本迁入 brand_text
--   3. 同宝宝仅一个非终态计划：部分唯一索引在库层强制
--   4. 模板版本锁定：transfer_plans 记录 template_id + template_version
--   5. analytics_events 客户端仅可插入本人事件，无 select（看板走服务端角色）
-- ============================================================

-- ---------- 宝宝档案（A1–A3） ----------
create table if not exists public.babies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  nickname varchar(50) not null default '宝宝',
  birth_date date not null,
  gender varchar(10) not null default 'unknown' check (gender in ('male', 'female', 'unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_babies_user on public.babies (user_id, created_at);

-- ---------- 体重记录（A3 / F3） ----------
create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  baby_id uuid not null references public.babies (id) on delete cascade,
  weight_g integer not null check (weight_g > 0),
  measured_at date not null,
  created_at timestamptz not null default now(),
  unique (baby_id, measured_at)
);

create index if not exists idx_weight_logs_baby on public.weight_logs (baby_id, measured_at desc);

-- ---------- 奶粉库（B1，运营维护、客户端只读） ----------
create table if not exists public.milk_products (
  id uuid primary key default gen_random_uuid(),
  brand varchar(100) not null,
  name varchar(200) not null,
  stage integer not null check (stage between 1 and 4),
  protein_type varchar(20) not null check (protein_type in ('intact', 'partially_hydrolyzed', 'extensively_hydrolyzed', 'amino_acid')),
  region varchar(20) not null default 'domestic' check (region in ('domestic', 'overseas')),
  reg_no varchar(50),
  ingredients jsonb not null default '{}'::jsonb,
  status varchar(20) not null default 'on_shelf' check (status in ('on_shelf', 'off_shelf')),
  updated_at timestamptz not null default now()
);

create index if not exists idx_milk_products_brand_stage on public.milk_products (brand, stage);

-- ---------- 转奶方法模板（C2，运营可配置、客户端只读） ----------
create table if not exists public.plan_templates (
  id uuid primary key default gen_random_uuid(),
  method varchar(20) not null check (method in ('mixed', 'interval')),
  name varchar(100) not null,
  days jsonb not null, -- [{ "ratio": 0.33, "label": "新奶 1/3" }, ...]
  version integer not null default 1,
  is_default boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- 默认模板种子（上线前须经专业顾问审核，NFR-1；模板带版本号，进行中计划锁定版本）
insert into public.plan_templates (method, name, days, version, is_default)
values
  ('mixed', '混合法（7 天）',
   '[{"ratio":0.33,"label":"新奶 1/3"},{"ratio":0.33,"label":"新奶 1/3"},{"ratio":0.33,"label":"新奶 1/3"},{"ratio":0.5,"label":"新奶 1/2"},{"ratio":0.5,"label":"新奶 1/2"},{"ratio":0.5,"label":"新奶 1/2"},{"ratio":1,"label":"全量新奶"}]'::jsonb,
   1, true),
  ('interval', '隔顿法（14 天）',
   '[{"ratio":0.17,"label":"每天 1 顿新奶"},{"ratio":0.17,"label":"每天 1 顿新奶"},{"ratio":0.33,"label":"每天 2 顿新奶"},{"ratio":0.33,"label":"每天 2 顿新奶"},{"ratio":0.5,"label":"每天 2-3 顿新奶"},{"ratio":0.5,"label":"每天 2-3 顿新奶"},{"ratio":0.67,"label":"每天 3-4 顿新奶"},{"ratio":0.67,"label":"每天 3-4 顿新奶"},{"ratio":0.83,"label":"仅剩 1 顿旧奶"},{"ratio":0.83,"label":"仅剩 1 顿旧奶"},{"ratio":1,"label":"全量新奶"},{"ratio":1,"label":"全量新奶"},{"ratio":1,"label":"全量新奶"},{"ratio":1,"label":"全量新奶"}]'::jsonb,
   1, false);

-- ---------- 转奶计划（C1–C7） ----------
create table if not exists public.transfer_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  baby_id uuid not null references public.babies (id) on delete cascade,
  from_product_id uuid references public.milk_products (id),
  to_product_id uuid references public.milk_products (id),
  from_brand_text varchar(100) not null,
  to_brand_text varchar(100) not null,
  reason varchar(20) not null check (reason in ('stage', 'brand', 'medical', 'other')),
  method varchar(20) not null check (method in ('mixed', 'interval')),
  template_id uuid references public.plan_templates (id),
  template_version integer not null default 1,
  start_date date not null,
  status varchar(20) not null default 'active'
    check (status in ('active', 'paused', 'rollback', 'completed', 'terminated')),
  terminate_reason varchar(200),
  rollback_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 同宝宝同时仅允许一个非终态计划（C4，数据库层强制；应用层校验只是兜底）
create unique index if not exists uq_babies_active_plan
  on public.transfer_plans (baby_id)
  where status in ('active', 'paused', 'rollback');

create index if not exists idx_plans_baby_status on public.transfer_plans (baby_id, status);

-- ---------- 记录重构：records → feed_records（D1–D5） ----------
-- 历史数据回填：自动创建默认宝宝「宝宝」承接存量记录；品牌文本迁入 brand_text
insert into public.babies (user_id, nickname)
select distinct r.user_id, '宝宝'
from public.records r
where not exists (
  select 1 from public.babies b where b.user_id = r.user_id
);

do $$
declare
  row_count_before integer;
  row_count_after integer;
begin
  select count(*) into row_count_before from public.records;

  alter table public.records rename to feed_records;
  -- 迁移前后行数一致性校验：不一致即失败回滚（03 §3）
  select count(*) into row_count_after from public.feed_records;
  if row_count_before <> row_count_after then
    raise exception 'feed_records migration row count mismatch: % -> %', row_count_before, row_count_after;
  end if;
end;
$$;

alter table public.feed_records
  add column if not exists baby_id uuid references public.babies (id) on delete cascade,
  add column if not exists plan_id uuid references public.transfer_plans (id) on delete set null,
  add column if not exists plan_day integer,
  add column if not exists product_id uuid references public.milk_products (id),
  add column if not exists brand_text varchar(100),
  add column if not exists finish_state varchar(20) default 'finished'
    check (finish_state in ('finished', 'partial', 'refused'));

-- 存量记录：品牌自由文本迁入 brand_text 兜底（不做奶粉库强行匹配，03 §3）
update public.feed_records set brand_text = milk_brand where brand_text is null;

-- baby_id 非空化（在回填之后执行）
alter table public.feed_records
  alter column baby_id set not null;

-- 历史索引按新表名重建，旧索引同步更名
alter index if exists idx_records_user_feed rename to idx_feed_records_user_feed;
create index if not exists idx_feed_records_baby_time
  on public.feed_records (user_id, baby_id, feed_time desc);

-- ---------- 每日症状打卡（D3 / E1） ----------
create table if not exists public.symptom_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  baby_id uuid not null references public.babies (id) on delete cascade,
  log_date date not null,
  stool_count integer not null default 0,
  stool_texture varchar(20),
  stool_color varchar(20),
  has_rash boolean not null default false,
  has_vomit boolean not null default false,
  has_bloating boolean not null default false,
  has_fever boolean not null default false,
  crying_level varchar(20) not null default 'normal' check (crying_level in ('normal', 'fussy', 'crying_a_lot')),
  sleep_quality varchar(20) not null default 'normal' check (sleep_quality in ('normal', 'poor')),
  note text,
  created_at timestamptz not null default now(),
  unique (baby_id, log_date)
);

create index if not exists idx_symptom_logs_baby_date on public.symptom_logs (baby_id, log_date desc);

-- ---------- 预警留痕（E1/E2） ----------
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  baby_id uuid not null references public.babies (id) on delete cascade,
  plan_id uuid references public.transfer_plans (id) on delete set null,
  level varchar(10) not null check (level in ('red', 'yellow', 'green')),
  rule_code varchar(50) not null,
  payload jsonb not null default '{}'::jsonb,
  status varchar(20) not null default 'new' check (status in ('new', 'acked', 'resolved')),
  acked_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_alerts_baby_status on public.alerts (baby_id, status, created_at desc);

-- ---------- 埋点事件（H4：客户端仅可插入本人事件，无 select） ----------
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  name varchar(50) not null,
  props jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_analytics_name_time on public.analytics_events (name, occurred_at desc);

-- ---------- 文章审核状态（G1：仅已审核内容对客户端可见） ----------
alter table public.articles
  add column if not exists review_status varchar(20) not null default 'approved';

-- ---------- RLS（复用基线 own-policy 模式） ----------
alter table public.babies enable row level security;
alter table public.weight_logs enable row level security;
alter table public.milk_products enable row level security;
alter table public.plan_templates enable row level security;
alter table public.transfer_plans enable row level security;
alter table public.feed_records enable row level security;
alter table public.symptom_logs enable row level security;
alter table public.alerts enable row level security;
alter table public.analytics_events enable row level security;

create policy "babies_select_own" on public.babies
  for select to authenticated using (auth.uid() = user_id);
create policy "babies_insert_own" on public.babies
  for insert to authenticated with check (auth.uid() = user_id);
create policy "babies_update_own" on public.babies
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "babies_delete_own" on public.babies
  for delete to authenticated using (auth.uid() = user_id);

create policy "weight_logs_select_own" on public.weight_logs
  for select to authenticated using (auth.uid() = user_id);
create policy "weight_logs_insert_own" on public.weight_logs
  for insert to authenticated with check (auth.uid() = user_id);
create policy "weight_logs_delete_own" on public.weight_logs
  for delete to authenticated using (auth.uid() = user_id);

create policy "milk_products_public_read" on public.milk_products
  for select to anon, authenticated using (status = 'on_shelf');

create policy "plan_templates_public_read" on public.plan_templates
  for select to anon, authenticated using (enabled = true);

create policy "transfer_plans_select_own" on public.transfer_plans
  for select to authenticated using (auth.uid() = user_id);
create policy "transfer_plans_insert_own" on public.transfer_plans
  for insert to authenticated with check (auth.uid() = user_id);
create policy "transfer_plans_update_own" on public.transfer_plans
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "feed_records_select_own" on public.feed_records
  for select to authenticated using (auth.uid() = user_id);
create policy "feed_records_insert_own" on public.feed_records
  for insert to authenticated with check (auth.uid() = user_id);
create policy "feed_records_update_own" on public.feed_records
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "feed_records_delete_own" on public.feed_records
  for delete to authenticated using (auth.uid() = user_id);

create policy "symptom_logs_select_own" on public.symptom_logs
  for select to authenticated using (auth.uid() = user_id);
create policy "symptom_logs_insert_own" on public.symptom_logs
  for insert to authenticated with check (auth.uid() = user_id);
create policy "symptom_logs_update_own" on public.symptom_logs
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "alerts_select_own" on public.alerts
  for select to authenticated using (auth.uid() = user_id);
create policy "alerts_insert_own" on public.alerts
  for insert to authenticated with check (auth.uid() = user_id);
create policy "alerts_update_own" on public.alerts
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- analytics_events：仅插入本人数据，无 select 权限（看板走服务端角色，03 §2）
create policy "analytics_events_insert_own" on public.analytics_events
  for insert to authenticated with check (auth.uid() = user_id);

-- ---------- 最小授权 ----------
revoke all on public.babies from anon, authenticated;
revoke all on public.weight_logs from anon, authenticated;
revoke all on public.milk_products from anon, authenticated;
revoke all on public.plan_templates from anon, authenticated;
revoke all on public.transfer_plans from anon, authenticated;
revoke all on public.feed_records from anon, authenticated;
revoke all on public.symptom_logs from anon, authenticated;
revoke all on public.alerts from anon, authenticated;
revoke all on public.analytics_events from anon, authenticated;

grant select, insert, update, delete on public.babies to authenticated;
grant select, insert, delete on public.weight_logs to authenticated;
grant select on public.milk_products to anon, authenticated;
grant select on public.plan_templates to anon, authenticated;
grant select, insert, update on public.transfer_plans to authenticated;
grant select, insert, update, delete on public.feed_records to authenticated;
grant select, insert, update on public.symptom_logs to authenticated;
grant select, insert, update on public.alerts to authenticated;
grant insert on public.analytics_events to authenticated;

-- 旧统计 RPC 重建到新表（口径不变）
create or replace function public.get_record_stats()
returns json
language sql
stable
as $$
  select json_build_object(
    'total', count(*),
    'days', count(distinct feed_time::date)
  )
  from public.feed_records
  where user_id = auth.uid();
$$;

grant execute on function public.get_record_stats() to authenticated;
