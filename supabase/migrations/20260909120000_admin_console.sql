-- ============================================================
-- 管理后台（admin console）：管理员白名单 + 运营侧写权限 + 文章审核可见性收紧
--
-- 服务的 FR：B1（奶粉库运营维护）、C2（模板运营可配置）、G1（文章审核流程）、H4（看板，数据走 admin-stats Edge Function）
-- 前置要求：已应用 20240523000000_init_schema.sql 与 20250909000000_v2_feeding_plan_schema.sql
-- 回滚方式：drop table public.admins; drop function public.is_admin(); drop function public.touch_updated_at();
--           逐条 drop 本文件的 "admin_*" / "articles_public_read" 策略后，
--           重建 v1 版 articles_public_read（for select to anon, authenticated using (true)）。
--
-- 要点：
--   1. 运营身份 = Supabase Auth 邮箱用户 + admins 表白名单。RLS 经 is_admin() 授予管理员写权限，
--      管理后台浏览器端只持有 anon key；service_role 仅存在于 admin-stats Edge Function 服务端。
--   2. milk_products / plan_templates 保持"公开只读（on_shelf / enabled）"，另加管理员全量读 + 增删改。
--   3. articles_public_read 收紧为 review_status='approved'（G1 验收：仅已审核内容对客户端可见）；
--      存量行 default 'approved'，无行为回归。管理员可全量读（含待审/驳回）并增改删。
--   4. analytics_events 不动：保持 insert-only，看板数据由 admin-stats 在服务端聚合（03 §2）。
-- ============================================================

-- ---------- 管理员白名单 ----------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email varchar(255) not null,
  note varchar(200),
  created_at timestamptz not null default now()
);

create index if not exists idx_admins_email on public.admins (email);

-- is_admin()：供各表 policy 复用；security definer + 锁定 search_path，避免与 admins 表 RLS 递归
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid())
$$;

-- updated_at 自动维护（FR-B1 验收：每条数据有运营侧更新时间）
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 业务键唯一（同 品牌+产品名+段位+版本 只允许一条 SKU；CSV 导入 upsert 依赖此约束）
create unique index if not exists uq_milk_products_sku
  on public.milk_products (brand, name, stage, region);

-- FR-B1 字段补全：使用信息（冲调比例按罐体标注；参考价为区间、非实时）
alter table public.milk_products
  add column if not exists mix_ratio varchar(50),
  add column if not exists price_range varchar(50);

drop trigger if exists milk_products_touch_updated_at on public.milk_products;
create trigger milk_products_touch_updated_at
  before update on public.milk_products
  for each row execute function public.touch_updated_at();

-- ---------- RLS ----------
alter table public.admins enable row level security;

-- admins：仅可查到自己的行（管理后台登录后身份自检；写管理只能走 SQL/服务端）
create policy "admins_select_self" on public.admins
  for select to authenticated using (auth.uid() = user_id);

-- 奶粉库：管理员全量读（含下架）+ 增删改
create policy "milk_products_admin_read" on public.milk_products
  for select to authenticated using (public.is_admin());
create policy "milk_products_admin_insert" on public.milk_products
  for insert to authenticated with check (public.is_admin());
create policy "milk_products_admin_update" on public.milk_products
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "milk_products_admin_delete" on public.milk_products
  for delete to authenticated using (public.is_admin());

-- 模板：管理员全量读（含停用）+ 增删改
create policy "plan_templates_admin_read" on public.plan_templates
  for select to authenticated using (public.is_admin());
create policy "plan_templates_admin_insert" on public.plan_templates
  for insert to authenticated with check (public.is_admin());
create policy "plan_templates_admin_update" on public.plan_templates
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "plan_templates_admin_delete" on public.plan_templates
  for delete to authenticated using (public.is_admin());

-- 文章：公开读收紧为已审核（G1），管理员全量读 + 增改删
drop policy if exists "articles_public_read" on public.articles;
create policy "articles_public_read" on public.articles
  for select to anon, authenticated using (review_status = 'approved');
create policy "articles_admin_read" on public.articles
  for select to authenticated using (public.is_admin());
create policy "articles_admin_insert" on public.articles
  for insert to authenticated with check (public.is_admin());
create policy "articles_admin_update" on public.articles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "articles_admin_delete" on public.articles
  for delete to authenticated using (public.is_admin());

-- ---------- 最小授权（policy 是门禁，grant 只表意图） ----------
revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;

grant insert, update, delete on public.milk_products to authenticated;
grant insert, update, delete on public.plan_templates to authenticated;
grant insert, update, delete on public.articles to authenticated;

-- ---------- 首个管理员引导（人工步骤，不随迁移执行） ----------
-- 1. Supabase Dashboard → Authentication → Users → Add user：创建管理员邮箱账号（按需关闭邮件确认）
-- 2. SQL Editor 执行（替换 <auth-user-uuid> 与邮箱）：
--      insert into public.admins (user_id, email, note)
--      values ('<auth-user-uuid>', 'admin@example.com', '首个管理员');
-- 3. 用该账号登录管理后台（apps/admin），登录后无权限提示即代表未命中白名单。
