import { supabase } from './supabase'
import { ensureSession } from '../utils/auth'
import type { SymptomLogInsert, SymptomLogRow } from '../types'

/** 每日症状打卡（FR-D3）。每宝宝每日一条：重复进入为编辑（upsert）。 */
export const SymptomService = {
  async getByDate(babyId: string, logDate: string): Promise<SymptomLogRow | null> {
    await ensureSession()
    const { data, error } = await supabase
      .from('symptom_logs')
      .select('*')
      .eq('baby_id', babyId)
      .eq('log_date', logDate)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async upsert(log: SymptomLogInsert): Promise<SymptomLogRow> {
    await ensureSession()
    const { data, error } = await supabase
      .from('symptom_logs')
      .upsert(log, { onConflict: 'baby_id,log_date' })
      .select()
      .single()
    if (error) throw error
    return data
  },

  /** 基线（FR-E1）：计划开始前 3 个喂养日的平均大便次数；不足返回 null */
  async getBaselineStoolCount(babyId: string, beforeDate: string): Promise<number | null> {
    await ensureSession()
    const { data, error } = await supabase
      .from('symptom_logs')
      .select('stool_count')
      .eq('baby_id', babyId)
      .lt('log_date', beforeDate)
      .order('log_date', { ascending: false })
      .limit(3)
    if (error) throw error
    const rows = data ?? []
    if (rows.length === 0) return null
    return rows.reduce((sum, r) => sum + r.stool_count, 0) / rows.length
  },
}
