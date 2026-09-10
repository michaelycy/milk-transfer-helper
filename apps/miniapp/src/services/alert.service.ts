import { supabase } from './supabase'
import { ensureSession } from '../utils/auth'
import type { AlertLevel, AlertRow } from '../types'
import type { Json } from '../types/database'

export interface CreateAlertInput {
  babyId: string
  planId: string | null
  level: AlertLevel
  ruleCode: string
  payload: Record<string, unknown>
}

/** 分级预警（FR-E1/E2）。生命周期 new→acked→resolved；预警只可关闭不可删除。 */
export const AlertService = {
  async create(input: CreateAlertInput): Promise<AlertRow> {
    await ensureSession()
    const { data, error } = await supabase.from('alerts').insert({
      baby_id: input.babyId,
      plan_id: input.planId,
      level: input.level,
      rule_code: input.ruleCode,
      payload: input.payload as Json,
    }).select().single()
    if (error) throw error
    return data
  },

  async getById(id: string): Promise<AlertRow | null> {
    const { data, error } = await supabase.from('alerts').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data
  },

  /** 未决预警（new），供首页/计划页展示 */
  async listUnresolved(babyId: string): Promise<AlertRow[]> {
    await ensureSession()
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('baby_id', babyId)
      .in('status', ['new', 'acked'])
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  /** 确认已读（红色预警只能确认，不能忽略；acked_at 必填，响应率口径依赖它） */
  async ack(id: string): Promise<void> {
    await ensureSession()
    const { error } = await supabase
      .from('alerts')
      .update({ status: 'acked', acked_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  /** 解决（同规则连续 3 天未触发时由应用批量调用；或回退恢复后手动关闭） */
  async resolve(id: string): Promise<void> {
    await ensureSession()
    const { error } = await supabase
      .from('alerts')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },
}
