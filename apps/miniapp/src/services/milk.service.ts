import { supabase } from './supabase'
import type { MilkProductRow } from '../types'

export interface MilkSearchOptions {
  keyword?: string
  stage?: number
  proteinType?: string
}

/** 奶粉库（FR-B1/B2，运营维护、客户端只读、中性呈现：按名称排序，无推荐/排名）。 */
export const MilkService = {
  async search(options: MilkSearchOptions = {}): Promise<MilkProductRow[]> {
    let query = supabase
      .from('milk_products')
      .select('*')
      .eq('status', 'on_shelf')
      .order('brand')
      .limit(20)

    if (options.keyword) query = query.or(`brand.ilike.%${options.keyword}%,name.ilike.%${options.keyword}%`)
    if (options.stage) query = query.eq('stage', options.stage)
    if (options.proteinType) query = query.eq('protein_type', options.proteinType)

    const { data, error } = await query
    if (error) throw error
    return data ?? []
  },

  async getByIds(ids: string[]): Promise<MilkProductRow[]> {
    if (ids.length === 0) return []
    const { data, error } = await supabase.from('milk_products').select('*').in('id', ids)
    if (error) throw error
    return data ?? []
  },
}
