-- ============================================================
-- 用户与权限体系（v2.0-draft10）：admins 角色化（RBAC）+ 家庭共享 + 隐私留痕 + 管理审计
--
-- 服务的 FR：J8/J9/J10/J11（管理员角色与权限/管理员管理/用户查询留痕/操作审计）、
--            H3（家庭共享·成员与角色）、H2/H5/H6/H7（隐私同意留痕、手机号绑定）
-- 前置要求：init_schema、v2_feeding_plan_schema、admin_console、ai_* 迁移已应用
-- 回滚方式：本文件成套回滚（drop 本文件创建的表/函数/策略/触发器/索引，并重建
--           被 drop 的既有策略），见文件尾部注释；不可部分回滚。
--
-- 设计约束（03-data-model §2 / NFR-7）：
--   1. 新表一律普通 DDL：不引用 auth.*，用户外键指向 public.users（用户主数据）；
--      admin_audit_logs.actor_user_id 为裸 uuid（管理员可能无 public.users 行，审计只追加）。
--   2. 权限判定函数化：has_permission(action) 为唯一裁决点（角色×权限点固定矩阵，
--      默认拒绝）；is_admin() 重定义为「任一 active 角色」并保留为兼容包装，
--      既有 admin_* 策略行为不变（存量行迁移默认 super_admin，无感升级）。
--   3. 成员可见性（H3 双裁决的 DB 侧纵深防御层）：业务表在既有 own-policy 之上
--      追加成员策略——读 = owner/editor/viewer，写 = owner/editor；宝宝档案改删 = owner。
--      统一经 is_baby_member(baby_id, min_role) 判定；存量 babies 回填 owner 成员行。
--   4. 触发器强制：每宝宝 owner 唯一（部分唯一索引）、active 成员 ≤ 5、
--      任意时刻 ≥ 1 个 active super_admin（最后一个超管不可停用/降级/删除）。
--   5. 只追加：admin_audit_logs / privacy_consents 无 update/delete 授权；
--      手机号以「哈希指纹 + 密文」双字段存储，指纹承担唯一约束（完整值不出后端）。
-- ============================================================

-- ---------- 1. admins 角色化（J8/J9） ----------
alter table public.admins
  add column if not exists role varchar(20) not null default 'operator',
  add column if not exists status varchar(10) not null default 'active';

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'admins_role_check'
  ) then
    alter table public.admins
      add constraint admins_role_check check (role in ('super_admin', 'operator', 'analyst'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'admins_status_check'
  ) then
    alter table public.admins
      add constraint admins_status_check check (status in ('active', 'disabled'));
  end if;
end $$;

-- 存量白名单行 = 事实上的全权管理员，无感升级为 super_admin（保持默认 operator 供新行使用）
update public.admins set role = 'super_admin' where role = 'operator';

-- has_permission(action)：角色×权限点固定矩阵（默认拒绝），管理端 RLS 与后端接口的统一裁决点
create or replace function public.has_permission(action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a
    where a.user_id = auth.uid()
      and a.status = 'active'
      and (
        a.role = 'super_admin'
        or (a.role = 'operator' and action in (
          'dashboard:read', 'milk:write', 'article:write', 'template:write', 'ai:config'))
        or (a.role = 'analyst' and action in ('dashboard:read', 'audit:read'))
      )
  )
$$;

-- is_admin() 兼容包装：任一 active 角色即为管理员（disabled 即刻失效）
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a
    where a.user_id = auth.uid() and a.status = 'active'
  )
$$;

-- 最后一个 active super_admin 保护（J8/J9 验收：DB 触发器双保险之一）
create or replace function public.protect_last_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  was_super boolean;
  still_super boolean;
  remaining int;
begin
  was_super := (tg_op = 'DELETE')
    or (old.role = 'super_admin' and old.status = 'active');
  still_super := (tg_op = 'DELETE')
    or (new.role = 'super_admin' and new.status = 'active');
  if was_super and not still_super then
    select count(*) into remaining
    from public.admins a
    where a.role = 'super_admin' and a.status = 'active'
      and a.user_id <> old.user_id;
    if remaining < 1 then
      raise exception '必须保留至少一个启用中的超级管理员';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists admins_protect_last_super on public.admins;
create trigger admins_protect_last_super
  before update of role, status or delete on public.admins
  for each row execute function public.protect_last_super_admin();

-- ---------- 2. 手机号字段（H7，How：密文 + 指纹，指纹唯一） ----------
alter table public.users
  add column if not exists phone_hash varchar(64),
  add column if not exists phone_cipher text;

create unique index if not exists uq_users_phone_hash
  on public.users (phone_hash)
  where phone_hash is not null;

-- ---------- 3. 隐私同意留痕（H2/H5/H6/H7，只追加） ----------
create table if not exists public.privacy_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  consent_type varchar(20) not null check (consent_type in ('login', 'baby_profile', 'phone')),
  policy_version varchar(20) not null,
  consented_at timestamptz not null default now()
);

create index if not exists idx_privacy_consents_user
  on public.privacy_consents (user_id, consent_type);

alter table public.privacy_consents enable row level security;

create policy "privacy_consents_insert_own" on public.privacy_consents
  for insert to authenticated with check (user_id = auth.uid());
create policy "privacy_consents_select_own" on public.privacy_consents
  for select to authenticated using (user_id = auth.uid());

revoke all on public.privacy_consents from anon, authenticated;
grant select, insert on public.privacy_consents to authenticated;

-- ---------- 4. 家庭共享（H3）：成员关系 + 邀请凭证 ----------
create table if not exists public.baby_members (
  id bigint generated always as identity primary key,
  baby_id uuid not null references public.babies (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role varchar(10) not null default 'viewer' check (role in ('owner', 'editor', 'viewer')),
  status varchar(10) not null default 'active' check (status in ('active', 'removed')),
  invited_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_baby_members_baby_user
  on public.baby_members (baby_id, user_id);
-- 每宝宝唯一 active owner（部分唯一索引）
create unique index if not exists uq_baby_members_owner
  on public.baby_members (baby_id)
  where role = 'owner' and status = 'active';
create index if not exists idx_baby_members_user
  on public.baby_members (user_id, status);

create table if not exists public.family_invites (
  id bigint generated always as identity primary key,
  baby_id uuid not null references public.babies (id) on delete cascade,
  role varchar(10) not null default 'viewer' check (role in ('editor', 'viewer')),
  invite_code varchar(32) not null unique,
  invited_by uuid not null references public.users (id) on delete cascade,
  accepted_by uuid references public.users (id) on delete set null,
  status varchar(10) not null default 'pending'
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_family_invites_baby
  on public.family_invites (baby_id, status);

alter table public.baby_members enable row level security;
alter table public.family_invites enable row level security;

-- 成员判定函数（H3 RLS 的统一收敛点；min_role ∈ viewer < editor < owner）
create or replace function public.is_baby_member(target_baby uuid, min_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.baby_members m
    where m.baby_id = target_baby
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (
        min_role = 'viewer'
        or (min_role = 'editor' and m.role in ('owner', 'editor'))
        or (min_role = 'owner' and m.role = 'owner')
      )
  )
$$;

-- baby_members：成员可见全量名册（管理页需要）；写入收敛到 owner 路径 + 自行退出
create policy "baby_members_select_member" on public.baby_members
  for select to authenticated using (
    user_id = auth.uid()
    or public.is_baby_member(baby_id, 'viewer')
  );
create policy "baby_members_insert_owner" on public.baby_members
  for insert to authenticated with check (public.is_baby_member(baby_id, 'owner'));
create policy "baby_members_update_owner" on public.baby_members
  for update to authenticated
  using (public.is_baby_member(baby_id, 'owner'))
  with check (public.is_baby_member(baby_id, 'owner'));
create policy "baby_members_delete_owner_or_self" on public.baby_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_baby_member(baby_id, 'owner'));

create policy "family_invites_select_owner" on public.family_invites
  for select to authenticated using (public.is_baby_member(baby_id, 'owner'));
create policy "family_invites_insert_owner" on public.family_invites
  for insert to authenticated with check (public.is_baby_member(baby_id, 'owner'));
create policy "family_invites_update_owner" on public.family_invites
  for update to authenticated
  using (public.is_baby_member(baby_id, 'owner'))
  with check (public.is_baby_member(baby_id, 'owner'));
create policy "family_invites_delete_owner" on public.family_invites
  for delete to authenticated using (public.is_baby_member(baby_id, 'owner'));

revoke all on public.baby_members, public.family_invites from anon, authenticated;
grant select, insert, update, delete on public.baby_members, public.family_invites to authenticated;

-- 成员上限 ≤ 5（active；触发器兜底，应用层同样校验）
create or replace function public.enforce_member_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_count int;
begin
  select count(*) into active_count
  from public.baby_members m
  where m.baby_id = new.baby_id and m.status = 'active' and m.user_id <> new.user_id;
  if new.status = 'active' and active_count >= 5 then
    raise exception '每个宝宝最多 5 位成员';
  end if;
  return new;
end;
$$;

drop trigger if exists baby_members_cap on public.baby_members;
create trigger baby_members_cap
  before insert or update of status on public.baby_members
  for each row execute function public.enforce_member_cap();

-- 新建宝宝自动建 owner 成员行（存量由下方回填）
create or replace function public.bootstrap_baby_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.baby_members (baby_id, user_id, role, status)
  values (new.id, new.user_id, 'owner', 'active')
  on conflict (baby_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists babies_bootstrap_owner on public.babies;
create trigger babies_bootstrap_owner
  after insert on public.babies
  for each row execute function public.bootstrap_baby_owner();

-- ---------- 5. 业务表成员可见性策略（H3；追加，不改既有 own-policy） ----------
create policy "babies_member_read" on public.babies
  for select to authenticated using (public.is_baby_member(id, 'viewer'));
create policy "babies_member_write" on public.babies
  for update to authenticated
  using (public.is_baby_member(id, 'owner')) with check (public.is_baby_member(id, 'owner'));
create policy "babies_member_delete" on public.babies
  for delete to authenticated using (public.is_baby_member(id, 'owner'));

create policy "feed_records_member_read" on public.feed_records
  for select to authenticated using (public.is_baby_member(baby_id, 'viewer'));
create policy "feed_records_member_write" on public.feed_records
  for insert to authenticated with check (public.is_baby_member(baby_id, 'editor'));
create policy "feed_records_member_update" on public.feed_records
  for update to authenticated
  using (public.is_baby_member(baby_id, 'editor')) with check (public.is_baby_member(baby_id, 'editor'));
create policy "feed_records_member_delete" on public.feed_records
  for delete to authenticated using (public.is_baby_member(baby_id, 'editor'));

create policy "symptom_logs_member_read" on public.symptom_logs
  for select to authenticated using (public.is_baby_member(baby_id, 'viewer'));
create policy "symptom_logs_member_write" on public.symptom_logs
  for insert to authenticated with check (public.is_baby_member(baby_id, 'editor'));
create policy "symptom_logs_member_update" on public.symptom_logs
  for update to authenticated
  using (public.is_baby_member(baby_id, 'editor')) with check (public.is_baby_member(baby_id, 'editor'));
create policy "symptom_logs_member_delete" on public.symptom_logs
  for delete to authenticated using (public.is_baby_member(baby_id, 'editor'));

create policy "weight_logs_member_read" on public.weight_logs
  for select to authenticated using (public.is_baby_member(baby_id, 'viewer'));
create policy "weight_logs_member_write" on public.weight_logs
  for insert to authenticated with check (public.is_baby_member(baby_id, 'editor'));
create policy "weight_logs_member_update" on public.weight_logs
  for update to authenticated
  using (public.is_baby_member(baby_id, 'editor')) with check (public.is_baby_member(baby_id, 'editor'));
create policy "weight_logs_member_delete" on public.weight_logs
  for delete to authenticated using (public.is_baby_member(baby_id, 'editor'));

create policy "transfer_plans_member_read" on public.transfer_plans
  for select to authenticated using (public.is_baby_member(baby_id, 'viewer'));
create policy "transfer_plans_member_write" on public.transfer_plans
  for insert to authenticated with check (public.is_baby_member(baby_id, 'editor'));
create policy "transfer_plans_member_update" on public.transfer_plans
  for update to authenticated
  using (public.is_baby_member(baby_id, 'editor')) with check (public.is_baby_member(baby_id, 'editor'));
create policy "transfer_plans_member_delete" on public.transfer_plans
  for delete to authenticated using (public.is_baby_member(baby_id, 'editor'));

create policy "alerts_member_read" on public.alerts
  for select to authenticated using (public.is_baby_member(baby_id, 'viewer'));
create policy "alerts_member_update" on public.alerts
  for update to authenticated
  using (public.is_baby_member(baby_id, 'editor')) with check (public.is_baby_member(baby_id, 'editor'));

-- ---------- 6. 管理审计日志（J11，只追加） ----------
create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null,
  action varchar(50) not null,
  target_type varchar(30),
  target_id varchar(100),
  detail jsonb,
  ip varchar(45),
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_created
  on public.admin_audit_logs (created_at desc);
create index if not exists idx_admin_audit_actor
  on public.admin_audit_logs (actor_user_id, created_at desc);

alter table public.admin_audit_logs enable row level security;

create policy "admin_audit_read" on public.admin_audit_logs
  for select to authenticated using (public.has_permission('audit:read'));

revoke all on public.admin_audit_logs from anon, authenticated;
grant select on public.admin_audit_logs to authenticated;
-- 写入仅 DB 触发器与后端 service_role；无 update/delete 授权（任何角色含 super_admin）

-- ---------- 7. 头像存储桶（H6；路径含 user_id，公开读、本人写） ----------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_insert_own" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_update_own" on storage.objects
  for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- 8. 存量回填：既有 babies 补 owner 成员行 ----------
insert into public.baby_members (baby_id, user_id, role, status)
select b.id, b.user_id, 'owner', 'active'
from public.babies b
on conflict (baby_id, user_id) do nothing;

-- ---------- 回滚清单（人工执行） ----------
-- drop trigger admins_protect_last_super on public.admins;
-- drop function public.protect_last_super_admin();
-- drop table public.admin_audit_logs;
-- drop table public.family_invites;
-- drop table public.baby_members;
-- drop table public.privacy_consents;
-- drop trigger babies_bootstrap_owner on public.babies;
-- drop function public.bootstrap_baby_owner();
-- drop trigger baby_members_cap on public.baby_members;
-- drop function public.enforce_member_cap();
-- drop function public.is_baby_member(uuid, text);
-- drop function public.has_permission(text);
-- 逐条 drop 本文件创建的 *_member_* / privacy_consents_* / admin_audit_read /
-- avatars_* 策略；revoke 对应 grant；drop index uq_users_phone_hash / uq_baby_members_* /
-- idx_*；alter table admins/users drop 新增列；update admins set role 无需回退（角色即升级）。
