-- ============================================================
-- AI 供应商密钥界面化存储（FR-K6 扩展 / NFR-2 修订）：加密落库、编辑不回显
--
-- 服务的 FR：K6（供应商注册表——密钥改为界面可设置）、J7（管理端密钥管理）、K1（网关解析链优先取库内密钥）
-- 前置要求：已应用 20260911200000_ai_provider_registry.sql
-- 回滚方式：drop table public.ai_provider_secrets;（删除后网关自动回退环境变量密钥路径）
--
-- 安全模型（NFR-2 修订版）：
--   1. 表内只存 AES-256-GCM 密文（app/core/secret_box.py 加密）+ 末 4 位掩码；
--      主密钥 AI_KEY_MASTER_SECRET 仅存后端环境变量，数据库泄露不等于密钥泄露。
--   2. 本表【不建任何客户端策略、不授任何授权】：密文永不下发浏览器；
--      仅后端 service_role 读写；管理端经后端 /v1/ai/providers/* 接口间接设置/清除，
--      接口响应只含 configured + last4，明文与密文均不回显。
--   3. 网关密钥解析优先级：本表密文（解密）> 环境变量 AI_<PROVIDER>_API_KEY > 报错降级。
--   4. 供应商删除时级联清理本表（触发器），不留孤儿密文。
-- ============================================================

create table if not exists public.ai_provider_secrets (
  id uuid primary key default gen_random_uuid(),
  provider_name varchar(30) not null unique,
  key_ciphertext text not null,
  key_last4 varchar(4) not null default '',
  updated_at timestamptz not null default now()
);

drop trigger if exists ai_provider_secrets_touch_updated_at on public.ai_provider_secrets;
create trigger ai_provider_secrets_touch_updated_at
  before update on public.ai_provider_secrets
  for each row execute function public.touch_updated_at();

-- 供应商删除 → 级联清理密文（不留孤儿密文）
create or replace function public.ai_provider_secrets_purge()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.ai_provider_secrets s where s.provider_name = old.name;
  return old;
end;
$$;

drop trigger if exists ai_providers_purge_secret on public.ai_providers;
create trigger ai_providers_purge_secret
  after delete on public.ai_providers
  for each row execute function public.ai_provider_secrets_purge();

-- ---------- RLS：启用且无任何策略（客户端零访问；service_role 不受 RLS 限制） ----------
alter table public.ai_provider_secrets enable row level security;

-- ---------- 最小授权：不授予 anon/authenticated 任何权限 ----------
revoke all on public.ai_provider_secrets from anon, authenticated;

-- ---------- 回滚（人工参考，见头部） ----------
