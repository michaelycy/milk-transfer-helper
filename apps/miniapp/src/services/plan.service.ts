import { supabase } from './supabase'
import { ensureSession } from '../utils/auth'
import type { PlanTemplateRow, TransferPlanInsert, TransferPlanRow } from '../types'

/** 转奶计划（FR-C1–C7）。状态机与唯一进行中计划由数据库强制，这里只做读写。 */
export const PlanService = {
  /** 方法模板（C2，公开只读；进行中计划锁定创建时版本） */
  async listTemplates(): Promise<PlanTemplateRow[]> {
    const { data, error } = await supabase
      .from('plan_templates')
      .select('*')
      .eq('enabled', true)
      .order('is_default', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  /** 当前宝宝的进行中计划（active/paused/rollback，最多一条） */
  async getActivePlan(babyId: string): Promise<TransferPlanRow | null> {
    await ensureSession()
    const { data, error } = await supabase
      .from('transfer_plans')
      .select('*')
      .eq('baby_id', babyId)
      .in('status', ['active', 'paused', 'rollback'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async getById(id: string): Promise<TransferPlanRow | null> {
    const { data, error } = await supabase
      .from('transfer_plans')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    return data
  },

  /** 计划时间轴（C7） */
  async listByBaby(babyId: string): Promise<TransferPlanRow[]> {
    await ensureSession()
    const { data, error } = await supabase
      .from('transfer_plans')
      .select('*')
      .eq('baby_id', babyId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async create(
    plan: Omit<TransferPlanInsert, 'user_id'>,
  ): Promise<TransferPlanRow> {
    await ensureSession()
    const { data, error } = await supabase.from('transfer_plans').insert(plan).select().single()
    if (error) throw error
    return data
  },

  /** 状态迁移（C4 状态机由 DB check + 部分唯一索引兜底；变更留痕由 updated_at + 时间轴页展示） */
  async updateStatus(id: string, status: TransferPlanRow['status'], terminateReason?: string): Promise<void> {
    await ensureSession()
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
    if (terminateReason) patch.terminate_reason = terminateReason
    const { error } = await supabase.from('transfer_plans').update(patch).eq('id', id)
    if (error) throw error
  },

  /** 回退次数留痕（C5），与状态 rollback 一起由调用方写入 */
  async incrementRollbackCount(id: string): Promise<void> {
    await ensureSession()
    const { data, error } = await supabase
      .from('transfer_plans')
      .select('rollback_count')
      .eq('id', id)
      .single()
    if (error) throw error
    const { error: updateError } = await supabase
      .from('transfer_plans')
      .update({ rollback_count: (data?.rollback_count ?? 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updateError) throw updateError
  },
}
