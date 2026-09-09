import Taro from '@tarojs/taro'
import { supabase } from './supabase'
import { ensureSession } from '../utils/auth'

/**
 * 认证服务（FR-H1/H2）。
 *
 * 三种登录态：
 *   loggedOut —— 未登录（Tab 页展示未登录态，数据不可用）
 *   guest     —— 匿名会话（拒绝微信授权仍可使用，数据不跨设备，需明示）
 *   wechat    —— 微信登录（数据跟随微信号；升级时服务端无损迁移匿名数据）
 *
 * 设计要点：
 *   - 匿名会话不再在启动时自动创建（原行为），改由用户在登录页显式选择；
 *   - 微信登录走 Edge Function（code2session），失败时给明确降级提示；
 *   - 退出登录 = supabase.auth.signOut()，本地登录态标记一并清除。
 */

const MODE_KEY = 'auth:mode'
export type AuthMode = 'none' | 'guest' | 'wechat'

export function getAuthMode(): AuthMode {
  const mode = Taro.getStorageSync(MODE_KEY)
  return mode === 'guest' || mode === 'wechat' ? mode : 'none'
}

function setAuthMode(mode: AuthMode): void {
  if (mode === 'none') Taro.removeStorageSync(MODE_KEY)
  else Taro.setStorageSync(MODE_KEY, mode)
}

/** 游客模式：显式创建匿名会话（FR-H1：拒绝授权用户仍可匿名使用） */
export async function loginAnonymous(): Promise<void> {
  await ensureSession()
  setAuthMode('guest')
}

/**
 * 微信一键登录（FR-H1）：
 *   Taro.login() 拿 code → Edge Function 用 code2session 换 openid 并签发 Supabase 会话，
 *   服务端同时完成匿名→微信的数据无损迁移（幂等可重试）。
 * Edge Function 未部署/未配置时会抛错，由页面给出降级提示。
 */
export async function loginWechat(): Promise<void> {
  const { code } = await Taro.login()
  const { data, error } = await supabase.functions.invoke('wechat-login', { body: { code } })
  if (error) throw new Error(error.message || '微信登录暂不可用')

  const payload = data as { session?: { access_token: string; refresh_token: string } }
  if (!payload?.session?.access_token || !payload?.session?.refresh_token) {
    throw new Error('微信登录服务未返回会话')
  }
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: payload.session.access_token,
    refresh_token: payload.session.refresh_token,
  })
  if (sessionError) throw sessionError
  setAuthMode('wechat')
}

/** 退出登录（FR-H2）：清除本地登录态标记并注销会话 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
  setAuthMode('none')
}
