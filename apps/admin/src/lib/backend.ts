import { supabase } from './supabase';

/**
 * 后端 API（FastAPI）统一调用通道：管理端专用端点全部挂 /v1/admin/**（NFR-7），
 * 鉴权 = 浏览器持有的 GoTrue JWT + 后端 admins 白名单双校验。
 * 响应信封 { status, data, error }，与小程序 aiRequest 同形。
 */
export async function callBackendApi<T>(
  path: string,
  body?: Record<string, unknown>,
  method: 'POST' | 'PUT' | 'GET' = 'POST',
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('会话已过期，请重新登录');
  const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  if (res.status === 401 || res.status === 403) throw new Error('需要管理员权限');
  const payload = (await res.json()) as {
    status: number;
    data: T;
    error?: { message: string } | null;
  };
  if (res.status >= 400 || payload.status >= 400) {
    throw new Error(payload.error?.message || `后端请求失败（HTTP ${res.status}）`);
  }
  return payload.data;
}
