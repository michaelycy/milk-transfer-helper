import { createClient } from '@supabase/supabase-js';
import type { Database } from '@milk-transfer/shared';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  throw new Error(
    '缺少环境变量 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，请参考 apps/admin/.env.example 配置',
  );
}

/**
 * 管理后台只持有 anon key：写权限由数据库端 admins 白名单 + RLS（is_admin）控制，
 * service_role 仅存在于 admin-stats Edge Function 服务端，永不下发到浏览器。
 */
export const supabase = createClient<Database>(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
