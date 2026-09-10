import { supabase } from '../lib/supabase';
import type { MilkProductInsert, MilkProductRow, MilkStatus } from '../types';

export interface MilkListOptions {
  keyword?: string;
  stage?: number | null;
  proteinType?: string | null;
  status?: MilkStatus | null;
}

/** 奶粉库管理（FR-B1 运营维护；管理员经 RLS is_admin() 获得写权限） */
export const MilkService = {
  /** 管理员全量列表（含下架），品牌/产品名模糊 + 字段筛选 */
  async list(options: MilkListOptions = {}): Promise<MilkProductRow[]> {
    let query = supabase.from('milk_products').select('*').order('brand').order('stage');
    if (options.keyword) {
      query = query.or(`brand.ilike.%${options.keyword}%,name.ilike.%${options.keyword}%`);
    }
    if (options.stage) query = query.eq('stage', options.stage);
    if (options.proteinType) query = query.eq('protein_type', options.proteinType);
    if (options.status) query = query.eq('status', options.status);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async create(row: MilkProductInsert): Promise<MilkProductRow> {
    const { data, error } = await supabase.from('milk_products').insert(row).select().single();
    if (error) throw error;
    return data;
  },

  async update(id: string, patch: Partial<MilkProductInsert>): Promise<MilkProductRow> {
    const { data, error } = await supabase
      .from('milk_products')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('milk_products').delete().eq('id', id);
    if (error) throw error;
  },

  /** CSV 批量导入：按业务键（品牌+产品名+段位+版本）upsert，重复行以后到者为准 */
  async importRows(rows: MilkProductInsert[]): Promise<number> {
    if (rows.length === 0) return 0;
    const { error } = await supabase.from('milk_products').upsert(rows, {
      onConflict: 'brand,name,stage,region',
    });
    if (error) throw error;
    return rows.length;
  },
};
