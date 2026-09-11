import { aiRequest } from './supabase'
import { ensureSession } from '../utils/auth'

export const PHONE_CONSENT_VERSION = '2026-09'

/** 账号安全（FR-H7）：手机号快捷绑定/解绑、账号注销（FR-H2） */
export const AccountService = {
  async bindPhone(phoneCode: string): Promise<{ phone_masked: string }> {
    await ensureSession()
    const res = await aiRequest('/v1/auth/phone/bind', {
      phone_code: phoneCode,
      consent_version: PHONE_CONSENT_VERSION,
    })
    return unwrap<{ phone_masked: string }>(res, '绑定失败')
  },

  async unbindPhone(): Promise<void> {
    await ensureSession()
    const res = await aiRequest('/v1/auth/phone/unbind', {})
    unwrap<unknown>(res, '解绑失败')
  },

  /** 注销（二次确认在页面层完成）：级联删除全部数据，不可逆 */
  async deactivate(): Promise<void> {
    await ensureSession()
    const res = await aiRequest('/v1/auth/deactivate', { confirm: true })
    unwrap<unknown>(res, '注销失败')
  },
}

function unwrap<T>(res: { status: number; body: Record<string, unknown> }, fallback: string): T {
  if (res.status >= 400) {
    const detail = typeof res.body.detail === 'string' ? res.body.detail : fallback
    throw new Error(detail)
  }
  const payload = res.body as unknown as { status: number; body: T }
  return payload.body
}
