import { supabase, aiRequest } from './supabase'
import { ensureSession } from '../utils/auth'

export interface UserProfile {
  id: string
  nickname: string | null
  avatar: string | null
  phone_masked: string | null
  created_at?: string
}

function unwrap<T>(res: { status: number; body: Record<string, unknown> }, fallback: string): T {
  if (res.status >= 400) throw new Error(fallback)
  const payload = res.body as unknown as { status: number; body: T; error?: { message?: string } | null }
  if (payload.status >= 400) throw new Error(payload.error?.message || fallback)
  return payload.body
}

/** 用户资料与隐私留痕（FR-H2/H6/H7） */
export const UsersService = {
  /** 资料读取（含手机号脱敏展示）走后端（解密不出后端）；游客（无 users 行）返回 null 字段 */
  async getProfile(): Promise<UserProfile | null> {
    await ensureSession()
    const res = await aiRequest('/v1/auth/profile', undefined, 'GET')
    return unwrap<UserProfile | null>(res, '获取资料失败')
  },

  /** 昵称更新（≤20 字；经后端校验后以 service_role 落本人行） */
  async updateNickname(nickname: string): Promise<void> {
    await ensureSession()
    const res = await aiRequest('/v1/auth/profile', { nickname }, 'PATCH')
    unwrap<unknown>(res, '资料更新失败')
  },

  /** 头像上传（base64 → 后端写 avatars 桶，返回公开 URL） */
  async uploadAvatar(base64Data: string): Promise<string> {
    const res = await aiRequest('/v1/auth/avatar', { data: `data:image/png;base64,${base64Data}` })
    return unwrap<{ avatar: string }>(res, '头像上传失败').avatar
  },

  /** 隐私同意留痕（login/baby_profile/phone；只追加，own-policy） */
  async recordConsent(consentType: 'login' | 'baby_profile' | 'phone', policyVersion = '2026-09'): Promise<void> {
    await ensureSession()
    const { error } = await supabase
      .from('privacy_consents')
      .insert({ consent_type: consentType, policy_version: policyVersion })
    if (error) throw error
  },
}
