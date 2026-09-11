-- ============================================================
-- 管理审计触发器（FR-J11 双通道的 DB 侧）：敏感表变更自动写入 admin_audit_logs
--
-- 服务的 FR：J11（操作审计：admins 变更、供应商密钥设置/清除、提示词审核流转）
-- 前置要求：20260912120000_user_rbac_family_sharing.sql（admin_audit_logs 表）
-- 回滚方式：drop 三个触发器 + audit_admin_change() 函数
--
-- 要点：service definer 写入（无客户端授权路径）；密钥动作仅记录 last4，绝不落明文/密文。
-- ============================================================

create or replace function public.audit_admin_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  act text;
  detail jsonb;
begin
  if tg_op = 'INSERT' then
    act := 'insert';
    detail := to_jsonb(new) - 'user_id';
  elsif tg_op = 'UPDATE' then
    act := 'update';
    detail := jsonb_build_object('old', to_jsonb(old) - 'user_id', 'new', to_jsonb(new) - 'user_id');
  else
    act := 'delete';
    detail := to_jsonb(old) - 'user_id';
  end if;
  insert into public.admin_audit_logs (actor_user_id, action, target_type, target_id, detail)
  values (coalesce(actor, '00000000-0000-0000-0000-000000000000'::uuid),
          tg_table_name || '.' || act, tg_table_name,
          coalesce(new.user_id::text, old.user_id::text, new.provider_name, old.provider_name), detail);
  return coalesce(new, old);
end;
$$;

create or replace function public.audit_prompt_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if tg_op = 'UPDATE' and (
    new.review_status is distinct from old.review_status
    or new.enabled is distinct from old.enabled
  ) then
    insert into public.admin_audit_logs (actor_user_id, action, target_type, target_id, detail)
    values (coalesce(actor, '00000000-0000-0000-0000-000000000000'::uuid),
            'ai_prompt_templates.review', 'ai_prompt_templates', new.id::text,
            jsonb_build_object('scene', new.scene, 'version', new.version,
                               'old_status', old.review_status, 'new_status', new.review_status,
                               'enabled', new.enabled));
  end if;
  return new;
end;
$$;

drop trigger if exists audit_admins on public.admins;
create trigger audit_admins
  after insert or update or delete on public.admins
  for each row execute function public.audit_admin_change();

drop trigger if exists audit_provider_secrets on public.ai_provider_secrets;
create trigger audit_provider_secrets
  after insert or update or delete on public.ai_provider_secrets
  for each row execute function public.audit_admin_change();

drop trigger if exists audit_prompt_templates on public.ai_prompt_templates;
create trigger audit_prompt_templates
  after update on public.ai_prompt_templates
  for each row execute function public.audit_prompt_review();

-- 回滚：drop trigger audit_admins/admin_provider_secrets/audit_prompt_templates + 两个函数
