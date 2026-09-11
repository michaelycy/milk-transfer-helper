import { supabase } from './supabase'
import { ensureSession } from '../utils/auth'
import type { ArticleRow } from '../types'

export interface GetArticlesOptions {
  category?: string
  /** 标题模糊搜索关键词 */
  keyword?: string
  /** 限制条数（首页推荐位取最新 2 篇） */
  limit?: number
}

/** 收藏列表行（FR-H6）：收藏行内嵌已审核文章；文章被删/下线时 article 为 null */
export interface FavoriteItem {
  id: string
  created_at: string
  article: ArticleRow | null
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

  /** 我的收藏（FR-H6）：走 favorites own-policy，user_id 由数据库端默认 */
  async getFavorites(): Promise<FavoriteItem[]> {
    await ensureSession()
    const { data, error } = await supabase
      .from('favorites')
      .select('id, created_at, article:articles(*)')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as FavoriteItem[]
  },

  async addFavorite(articleId: string): Promise<void> {
    await ensureSession()
    const { error } = await supabase.from('favorites').insert({ article_id: articleId })
    // 重复收藏（唯一约束）视为已收藏，不报错
    if (error && !String(error.message).includes('duplicate')) throw error
  },

  async removeFavorite(articleId: string): Promise<void> {
    await ensureSession()
    const { error } = await supabase.from('favorites').delete().eq('article_id', articleId)
    if (error) throw error
  },
}
