-- ============================================================
-- 婴儿转奶助手 · 初始化 Schema（基线，2024-05-23 重写为认证版）
--
-- ⚠️ 前置要求（二选一执行）：
--   1. 全新项目：在 Supabase Dashboard → Authentication → Sign In / Up
--      中启用 "Anonymous sign-ins"，再应用本文件。
--   2. 已应用过旧版 schema：先 `supabase db reset`（或手动 drop 四张表
--      及其 policy/函数）后再应用，避免残留的宽授权与外键冲突。
--
-- 认证模型：客户端使用 Supabase 匿名登录（signInAnonymously），
-- 每台设备获得一个 auth.users 中的身份（role = authenticated），
-- 数据隔离完全由 RLS 基于 auth.uid() 保证，客户端不传 user_id。
-- 后续接入微信登录时，将 openid 关联到同一 auth.users 即可平滑升级。
-- ============================================================

-- ---------- profiles：与 auth.users 一对一 ----------
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  openid varchar(255) unique, -- 预留：接入微信登录后回填
  nickname varchar(100),
  avatar varchar(500),
  created_at timestamptz not null default now()
);

create index if not exists idx_users_openid on public.users (openid);

-- ---------- 转奶记录 ----------
-- user_id 默认取 auth.uid()，客户端禁止传入，杜绝越权伪造
create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  milk_brand varchar(100) not null,
  feed_amount integer not null check (feed_amount > 0),
  feed_time timestamptz not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_records_user_feed on public.records (user_id, feed_time desc);

-- ---------- 知识文章（只读内容，运营侧维护） ----------
create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  title varchar(200) not null,
  content text not null,
  category varchar(50) not null,
  author varchar(100),
  read_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_articles_category on public.articles (category);
create index if not exists idx_articles_created_at on public.articles (created_at desc);

-- ---------- 收藏 ----------
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  article_id uuid not null references public.articles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, article_id)
);

create index if not exists idx_favorites_user_id on public.favorites (user_id);

-- ---------- RLS ----------
alter table public.users enable row level security;
alter table public.records enable row level security;
alter table public.articles enable row level security;
alter table public.favorites enable row level security;

-- 匿名登录用户在 Supabase Auth 中 role = authenticated，因此策略统一面向 authenticated
create policy "profiles_select_own" on public.users
  for select to authenticated using (auth.uid() = id);

create policy "profiles_update_own" on public.users
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "records_select_own" on public.records
  for select to authenticated using (auth.uid() = user_id);

create policy "records_insert_own" on public.records
  for insert to authenticated with check (auth.uid() = user_id);

create policy "records_update_own" on public.records
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "records_delete_own" on public.records
  for delete to authenticated using (auth.uid() = user_id);

create policy "articles_public_read" on public.articles
  for select to anon, authenticated using (true);

create policy "favorites_select_own" on public.favorites
  for select to authenticated using (auth.uid() = user_id);

create policy "favorites_insert_own" on public.favorites
  for insert to authenticated with check (auth.uid() = user_id);

create policy "favorites_delete_own" on public.favorites
  for delete to authenticated using (auth.uid() = user_id);

-- ---------- 最小授权（policy 是真正的门禁，grant 只表意图） ----------
revoke all on public.users from anon, authenticated;
revoke all on public.records from anon, authenticated;
revoke all on public.articles from anon, authenticated;
revoke all on public.favorites from anon, authenticated;

grant select, update on public.users to authenticated;
grant select, insert, update, delete on public.records to authenticated;
grant select on public.articles to anon, authenticated;
grant select, insert, delete on public.favorites to authenticated;

-- ---------- 新用户自动建档（security definer，绕过 RLS 写 profiles） ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 统计 RPC（security invoker：调用方 RLS 生效） ----------
create or replace function public.get_record_stats()
returns json
language sql
stable
as $$
  select json_build_object(
    'total', count(*),
    'days', count(distinct date(feed_time))
  )
  from public.records
  where user_id = auth.uid();
$$;

-- ---------- 阅读计数 RPC（客户端无 articles 写权限，走 definer 原子自增） ----------
create or replace function public.increment_read_count(article_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.articles
  set read_count = read_count + 1
  where id = article_id;
$$;

revoke all on function public.increment_read_count(uuid) from public;
grant execute on function public.increment_read_count(uuid) to anon, authenticated;
grant execute on function public.get_record_stats() to authenticated;
