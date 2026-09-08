import { supabase } from './supabase'
import { ensureSession } from '../utils/auth'
import type { BabyInsert, BabyRow, WeightLogRow } from '../types'

/** 宝宝档案（FR-A1/A2/A3）。所有按宝宝隔离的数据都以 babies.id 为归属。 */
export const BabyService = {
  async list(): Promise<BabyRow[]> {
    await ensureSession()
    const { data, error } = await supabase
      .from('babies')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async getById(id: string): Promise<BabyRow | null> {
    const { data, error } = await supabase.from('babies').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data
  },

  async create(baby: BabyInsert): Promise<BabyRow> {
    await ensureSession()
    const { data, error } = await supabase.from('babies').insert(baby).select().single()
    if (error) throw error
    return data
  },

  async update(id: string, patch: Partial<BabyInsert>): Promise<void> {
    await ensureSession()
    const { error } = await supabase
      .from('babies')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  /** 删除宝宝（FR-A2：有二次确认且明示数据将删除；级联删除由外键保证） */
  async remove(id: string): Promise<void> {
    await ensureSession()
    const { error } = await supabase.from('babies').delete().eq('id', id)
    if (error) throw error
  },

  async listWeights(babyId: string): Promise<WeightLogRow[]> {
    await ensureSession()
    const { data, error } = await supabase
      .from('weight_logs')
      .select('*')
      .eq('baby_id', babyId)
      .order('measured_at', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async addWeight(babyId: string, weightG: number, measuredAt: string): Promise<void> {
    await ensureSession()
    const { error } = await supabase
      .from('weight_logs')
      .insert({ baby_id: babyId, weight_g: weightG, measured_at: measuredAt })
    if (error) throw error
  },
}
