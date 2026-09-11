-- ============================================================
-- 修复 privacy_consents.user_id 缺省值（FR-H2/H7 验收修复）
--
-- 问题：建表时 user_id 未设 default auth.uid()，客户端按 own-policy 插入
--       （不传 user_id）触发 privacy_consents_insert_own 的 with check 失败 → 403。
-- 修复：补 default auth.uid()（与仓库「所有用户表 user_id default auth.uid()」约定一致）。
-- 回滚：alter table public.privacy_consents alter column user_id drop default;
-- ============================================================

alter table public.privacy_consents
  alter column user_id set default auth.uid();
