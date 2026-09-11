-- ============================================================
-- AI 模型接入管理（模块 K 扩展）：供应商注册表 + 备用模型列 + 故障转移记账
--
-- 服务的 FR：K6（供应商注册表）、K7（备用模型与故障转移）、K8（连通性自检，仅复用本文件对象无新增表）、
--           J7（管理端模型接入管理页）
-- 前置要求：已应用 20260911120000_ai_assistant.sql（复用其 is_admin() 沿用与 touch_updated_at 均来自既有迁移）
-- 回滚方式：alter table public.ai_configs drop column fallback_provider, drop column fallback_model;
--           alter table public.ai_usage_logs drop column fallback_used;
--           drop table public.ai_providers;
--
-- 要点：
--   1. ai_providers 为供应商事实源（name/base_url/状态）；**无密钥字段**——密钥按
--      AI_<NAME大写>_API_KEY 环境变量约定读取（NFR-2，FR-K1/K6）。
--   2. 场景端点解析链（应用层，FR-K6）：ai_configs.base_url 覆盖 > ai_providers.base_url > 内置默认。
--   3. 客户端对 ai_providers 无任何授权（同 ai_configs：后端 service_role 读写，管理端经 RLS is_admin()）。
--   4. fallback 列均可空：未配置备用模型时网关行为与 v1 完全一致（FR-K7）。
-- ============================================================

-- ---------- 供应商注册表（FR-K6） ----------
create table if not exists public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  name varchar(30) not null unique,
  base_url varchar(200) not null,
  note varchar(200),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists ai_providers_touch_updated_at on public.ai_providers;
create trigger ai_providers_touch_updated_at
  before update on public.ai_providers
  for each row execute function public.touch_updated_at();

-- ---------- 备用模型（FR-K7）与故障转移记账 ----------
alter table public.ai_configs
  add column if not exists fallback_provider varchar(30),
  add column if not exists fallback_model varchar(80);

alter table public.ai_usage_logs
  add column if not exists fallback_used boolean not null default false;

-- ---------- RLS：客户端无策略（无授权），管理端全量（同 ai_configs 模式） ----------
alter table public.ai_providers enable row level security;

create policy "ai_providers_admin_all" on public.ai_providers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- 最小授权（policy 是门禁，grant 只表意图） ----------
revoke all on public.ai_providers from anon, authenticated;
grant select, insert, update, delete on public.ai_providers to authenticated;

-- ---------- 删除保护（FR-K6 验收：后端双重校验） ----------
-- 仅允许删除「已停用且无场景引用」（provider / fallback_provider）的供应商。
create or replace function public.ai_providers_guard_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.enabled then
    raise exception '供应商已启用，请先停用再删除';
  end if;
  if exists (
    select 1 from public.ai_configs c
    where c.provider = old.name or c.fallback_provider = old.name
  ) then
    raise exception '供应商仍被场景配置引用，请先调整场景';
  end if;
  return old;
end;
$$;

drop trigger if exists ai_providers_guard_delete on public.ai_providers;
create trigger ai_providers_guard_delete
  before delete on public.ai_providers
  for each row execute function public.ai_providers_guard_delete();

-- ---------- 种子：内置供应商（端点与后端 PROVIDER_BASE_URL 默认值一致） ----------
insert into public.ai_providers (name, base_url, note, enabled)
values
  ('zhipu',    'https://open.bigmodel.cn/api/paas/v4', '内置 · 智谱 GLM', true),
  ('deepseek', 'https://api.deepseek.com/v1',          '内置 · DeepSeek', true),
  ('openai',   'https://api.openai.com/v1',            '内置 · OpenAI 兼容', true)
on conflict (name) do nothing;

-- ---------- 回滚（人工参考，见头部） ----------
