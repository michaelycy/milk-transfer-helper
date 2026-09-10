import { supabase } from '../lib/supabase';
import type { ArticleInsert, ArticleRow, ReviewStatus } from '../types';

export interface ArticleListOptions {
  keyword?: string;
  status?: ReviewStatus | null;
}

/** 文章管理（G1 审核：撰写 → 顾问/法务检查 → approved → 对客户端可见） */
export const ArticleService = {
  /** 管理员全量列表（含待审/驳回） */
  async list(options: ArticleListOptions = {}): Promise<ArticleRow[]> {
    let query = supabase.from('articles').select('*').order('created_at', { ascending: false });
    if (options.keyword) query = query.ilike('title', `%${options.keyword}%`);
    if (options.status) query = query.eq('review_status', options.status);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async create(row: ArticleInsert): Promise<ArticleRow> {
    const { data, error } = await supabase.from('articles').insert(row).select().single();
    if (error) throw error;
    return data;
  },

  async update(id: string, patch: Partial<ArticleInsert>): Promise<ArticleRow> {
    const { data, error } = await supabase
      .from('articles')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** 审核流转；通过后立即可见于小程序（articles_public_read 已收紧为 approved） */
  async setReviewStatus(id: string, status: ReviewStatus): Promise<ArticleRow> {
    return ArticleService.update(id, { review_status: status });
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('articles').delete().eq('id', id);
    if (error) throw error;
  },
};
