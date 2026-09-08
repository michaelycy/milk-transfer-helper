import { supabase } from './supabase'
import { ensureSession } from '../utils/auth'
import type { FeedRecordInsert, FeedRecordRow } from '../types'

export interface GetFeedsOptions {
  babyId: string
  /** 页码，从 0 开始 */
  page?: number
  pageSize?: number
}

export interface GetFeedsResult {
  data: FeedRecordRow[]
  total: number
}

export interface AddFeedRecordInput {
  babyId: string
  /** 品牌文案（奶粉库未收录时的兜底；M2 起优先 product_id） */
  brandText: string
  amountMl: number
  feedTime: string
  note?: string
  finishState?: 'finished' | 'partial' | 'refused'
  /** FR-D5 计划联动：由 resolvePlannedFeed 判定后写入 */
  planId?: string | null
  planDay?: number | null
  productId?: string | null
}

export interface UpdateFeedRecordInput {
  brandText?: string
  amountMl?: number
  feedTime?: string
  note?: string | null
  finishState?: 'finished' | 'partial' | 'refused'
}

/**
 * 喂养记录（FR-D1–D5）。表 feed_records（自 records 重构）。
 * user_id 由数据库默认 auth.uid() 填充，客户端不传，杜绝越权写入。
 */
export const FeedRecordService = {
  async getFeeds(options: GetFeedsOptions): Promise<GetFeedsResult> {
    await ensureSession()
    const page = Math.max(0, options.page ?? 0)
    const pageSize = options.pageSize ?? 20
    const from = page * pageSize

    const { data, error, count } = await supabase
      .from('feed_records')
      .select('*', { count: 'exact' })
      .eq('baby_id', options.babyId)
      .order('feed_time', { ascending: false })
      .range(from, from + pageSize - 1)

    if (error) throw error
    return { data: data ?? [], total: count ?? 0 }
  },

  async getLatest(babyId: string): Promise<FeedRecordRow | null> {
    await ensureSession()
    const { data, error } = await supabase
      .from('feed_records')
      .select('*')
      .eq('baby_id', babyId)
      .order('feed_time', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data
  },

  /** FR-F2/F3：取某喂养日范围内的记录（时间升序），供趋势与规则评估 */
  async listByDateRange(babyId: string, fromDate: string, toDate: string): Promise<FeedRecordRow[]> {
    await ensureSession()
    const { data, error } = await supabase
      .from('feed_records')
      .select('*')
      .eq('baby_id', babyId)
      .gte('feed_time', `${fromDate}T00:00:00`)
      .lte('feed_time', `${toDate}T23:59:59`)
      .order('feed_time', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async add(input: AddFeedRecordInput): Promise<FeedRecordRow> {
    await ensureSession()
    const insert: FeedRecordInsert = {
      baby_id: input.babyId,
      brand_text: input.brandText,
      milk_brand: input.brandText, // 兼容列（迁移期保留），新代码请读写 brand_text
      feed_amount: input.amountMl,
      feed_time: input.feedTime,
      note: input.note ?? null,
      finish_state: input.finishState ?? 'finished',
      plan_id: input.planId ?? null,
      plan_day: input.planDay ?? null,
      product_id: input.productId ?? null,
    }
    const { data, error } = await supabase.from('feed_records').insert(insert).select().single()
    if (error) throw error
    return data
  },

  async update(id: string, patch: UpdateFeedRecordInput): Promise<void> {
    await ensureSession()
    // FR-D4：编辑保留 updated_at 语义（表暂无该列，先以原位更新实现）
    const { error } = await supabase
      .from('feed_records')
      .update({
        ...(patch.brandText != null ? { brand_text: patch.brandText, milk_brand: patch.brandText } : {}),
        ...(patch.amountMl != null ? { feed_amount: patch.amountMl } : {}),
        ...(patch.feedTime != null ? { feed_time: patch.feedTime } : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
        ...(patch.finishState != null ? { finish_state: patch.finishState } : {}),
      })
      .eq('id', id)
    if (error) throw error
  },

  /** FR-D4 删除有二次确认（由调用方 UI 完成），此处仅执行 */
  async remove(id: string): Promise<void> {
    await ensureSession()
    const { error } = await supabase.from('feed_records').delete().eq('id', id)
    if (error) throw error
  },

  /** 记录统计（总数 + 覆盖天数），聚合在数据库端完成 */
  async getStats(): Promise<{ total: number; days: number }> {
    await ensureSession()
    const { data, error } = await supabase.rpc('get_record_stats')
    if (error) throw error
    const raw = (data ?? {}) as { total?: number; days?: number }
    return { total: Number(raw.total ?? 0), days: Number(raw.days ?? 0) }
  },
}

/** 兼容别名：既有页面引用名，逐步迁移到 FeedRecordService */
export const RecordService = FeedRecordService
