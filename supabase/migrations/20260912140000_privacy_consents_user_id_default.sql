-- 修复：privacy_consents.user_id 补 auth.uid() 默认值（H2/H5/H6/H7 同意留痕链路）
--
-- 20260912120000 建表时 user_id 为 not null 但未带 default auth.uid()，与仓库约定不符
-- （其余业务表均由数据库端 auth.uid() 默认，客户端不传、不可伪造）。
-- 客户端登录/建档留痕只传 consent_type + policy_version，插入触发 not-null 违规（23502）；
-- 后端手机号绑定（/v1/auth/phone/bind）的同意留痕同样受影响。
-- RLS 仍以 with check (user_id = auth.uid()) 兜底，伪造 user_id 依旧被拒。
alter table public.privacy_consents
  alter column user_id set default auth.uid();

-- 回滚：
-- alter table public.privacy_consents alter column user_id drop default;
