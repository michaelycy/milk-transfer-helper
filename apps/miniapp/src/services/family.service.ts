import { supabase, aiRequest } from './supabase'
import { ensureSession } from '../utils/auth'

export interface FamilyMember {
  id: string
  role: 'owner' | 'editor' | 'viewer'
  is_self: boolean
  joined_at: string
  nickname: string | null
  avatar: string | null
}

export interface FamilyInvite {
  id: string
  baby_id: string
  role: 'editor' | 'viewer'
  invite_code: string
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  expires_at: string
}

export interface AcceptResult {
  baby: { id: string; nickname: string | null; gender?: string | null }
  role: string
  already: boolean
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function genCode(): string {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return `MILK-${code}`
}

/** 家庭共享（FR-H3）：成员名册经后端最小披露；邀请/移除走 owner RLS；接受走后端一次性凭证 */
export const FamilyService = {
  /** 成员名册（昵称/头像/角色；需为该宝宝成员） */
  async listMembers(babyId: string): Promise<FamilyMember[]> {
    await ensureSession()
    const res = await aiRequest(`/v1/family/members?baby_id=${babyId}`, undefined, 'GET')
    return unwrap<FamilyMember[]>(res, '获取成员失败')
  },

  /** 生成一次性邀请（owner）：短码 24h 有效；冲突自动重试一次 */
  async createInvite(babyId: string, role: 'editor' | 'viewer'): Promise<FamilyInvite> {
    await ensureSession()
    const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, error } = await supabase
        .from('family_invites')
        .insert({ baby_id: babyId, role, invite_code: genCode(), expires_at: expires })
        .select()
        .single()
      if (!error) return data
      if (!String(error.message).includes('invite_code')) throw error
    }
    throw new Error('邀请码生成失败，请重试')
  },

  async listInvites(babyId: string): Promise<FamilyInvite[]> {
    await ensureSession()
    const { data, error } = await supabase
      .from('family_invites')
      .select('*')
      .eq('baby_id', babyId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async revokeInvite(inviteId: string): Promise<void> {
    await ensureSession()
    const { error } = await supabase
      .from('family_invites')
      .update({ status: 'revoked' })
      .eq('id', inviteId)
    if (error) throw error
  },

  /** 调整角色（owner，RLS update 裁决）：owner 行不可降级（所有权转移本期不做） */
  async updateRole(babyId: string, userId: string, role: 'editor' | 'viewer'): Promise<void> {
    await ensureSession()
    const { error } = await supabase
      .from('baby_members')
      .update({ role })
      .eq('baby_id', babyId)
      .eq('user_id', userId)
    if (error) throw error
  },

  /** 移除成员（owner）或自行退出（本人行），RLS 允许两条路径 */
  async removeMember(babyId: string, userId: string): Promise<void> {
    await ensureSession()
    const { error } = await supabase
      .from('baby_members')
      .delete()
      .eq('baby_id', babyId)
      .eq('user_id', userId)
    if (error) throw error
  },

  /** 被邀请人凭短码加入（游客不可用——匿名账号升级时会被删除） */
  async acceptInvite(inviteCode: string): Promise<AcceptResult> {
    await ensureSession()
    const res = await aiRequest('/v1/family/accept', { invite_code: inviteCode })
    return unwrap<AcceptResult>(res, '接受邀请失败')
  },
}

function unwrap<T>(res: { status: number; body: Record<string, unknown> }, fallback: string): T {
  if (res.status >= 400) {
    const detail = typeof res.body.detail === 'string' ? res.body.detail : fallback
    throw new Error(detail)
  }
  const payload = res.body as unknown as { status: number; data: T; error?: { message?: string } | null }
  if (payload.status >= 400) throw new Error(payload.error?.message || fallback)
  return payload.data
}
