import { supabase } from './supabase'
import type { ArticleRow } from '../types'

export interface GetArticlesOptions {
  category?: string
  /** 标题模糊搜索关键词 */
  keyword?: string
  /** 限制条数（首页推荐位取最新 2 篇） */
  limit?: number
}

export const ArticleService = {
  async getArticles(options: GetArticlesOptions = {}): Promise<ArticleRow[]> {
    let query = supabase
      .from('articles')
      .select('*')
      .order('created_at', { ascending: false })

    if (options.category) query = query.eq('category', options.category)
    if (options.keyword) query = query.ilike('title', `%${options.keyword}%`)
    if (options.limit) query = query.limit(options.limit)

    const { data, error } = await query
    if (error) throw error
    return data ?? []
  },

  async getArticleById(id: string): Promise<ArticleRow | null> {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    return data
  },

  /**
   * 阅读计数自增（RPC security definer）。
   * 统计性质的操作，失败不影响阅读，由调用方 fire-and-forget。
   */
  async incrementReadCount(id: string): Promise<void> {
    const { error } = await supabase.rpc('increment_read_count', { article_id: id })
    if (error) throw error
  },
}
