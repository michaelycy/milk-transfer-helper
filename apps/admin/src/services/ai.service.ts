import { supabase } from '../lib/supabase';
import { callBackendApi } from '../lib/backend';
import type {
  AiConfigPatch,
  AiConfigRow,
  AiPromptInsert,
  AiPromptRow,
  AiReviewStatus,
  AiScene,
  AiSubmissionRow,
  AiUsageRow,
  AiKeyStatus,
  AiProbeResult,
  AiProviderInsert,
  AiProviderRow,
} from '../types';

/**
 * AI 配置管理（FR-J6）：场景配置 / 提示词版本审核流 / 补录队列 / 用量概览。
 * 全部经 RLS is_admin() 授权；密钥不在任何表单与接口中出现（存后端环境变量）。
 */
export const AiAdminService = {
  async configs(): Promise<AiConfigRow[]> {
    const { data, error } = await supabase.from('ai_configs').select('*').order('scene');
    if (error) throw error;
    return data ?? [];
  },

  async updateConfig(id: string, patch: AiConfigPatch): Promise<void> {
    const { error } = await supabase.from('ai_configs').update(patch).eq('id', id);
    if (error) throw error;
  },

  async prompts(scene?: AiScene | null): Promise<AiPromptRow[]> {
    let query = supabase
      .from('ai_prompt_templates')
      .select('*')
      .order('scene')
      .order('version', { ascending: false });
    if (scene) query = query.eq('scene', scene);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  /** 新建版本：默认 pending，走顾问审核流（NFR-1） */
  async createPrompt(row: AiPromptInsert): Promise<void> {
    const { error } = await supabase.from('ai_prompt_templates').insert(row);
    if (error) throw error;
  },

  /** 审核流转：pending → approved / rejected，留痕审核时间 */
  async reviewPrompt(
    id: string,
    status: Extract<AiReviewStatus, 'approved' | 'rejected'>,
    reviewNote: string,
  ): Promise<void> {
    const { error } = await supabase
      .from('ai_prompt_templates')
      .update({
        review_status: status,
        review_note: reviewNote,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;
  },

  /** 启用：同场景旧启用版本自动停用（DB 部分唯一索引兜底唯一） */
  async enablePrompt(row: AiPromptRow): Promise<void> {
    const { error: disableError } = await supabase
      .from('ai_prompt_templates')
      .update({ enabled: false })
      .eq('scene', row.scene)
      .eq('enabled', true);
    if (disableError) throw disableError;
    const { error } = await supabase
      .from('ai_prompt_templates')
      .update({ enabled: true })
      .eq('id', row.id);
    if (error) throw error;
  },

  async submissions(status?: AiSubmissionRow['status'] | null): Promise<AiSubmissionRow[]> {
    let query = supabase
      .from('milk_product_submissions')
      .select('*')
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  /** 状态流转：processed / dismissed（处理后留 processed_at） */
  async transitionSubmission(
    id: string,
    status: Extract<AiSubmissionRow['status'], 'processed' | 'dismissed'>,
  ): Promise<void> {
    const { error } = await supabase
      .from('milk_product_submissions')
      .update({ status, processed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async usageRecent(days = 7): Promise<AiUsageRow[]> {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from('ai_usage_logs')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
};

/* ---------- 供应商注册表（FR-K6）与连通性自检（FR-K8） ---------- */

export const AiProviderService = {
  async list(): Promise<AiProviderRow[]> {
    const { data, error } = await supabase.from('ai_providers').select('*').order('name');
    if (error) throw error;
    return data ?? [];
  },

  async create(row: AiProviderInsert): Promise<void> {
    const { error } = await supabase.from('ai_providers').insert(row);
    if (error) throw error;
  },

  async update(id: string, patch: Partial<AiProviderInsert>): Promise<void> {
    const { error } = await supabase.from('ai_providers').update(patch).eq('id', id);
    if (error) throw error;
  },

  /** 删除保护由后端强制（停用且无场景引用），此处仅执行；失败信息直接透出 */
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('ai_providers').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * 连通性探针（FR-K8）：走后端 /v1/admin/ai/providers/probe（GoTrue JWT + admins 白名单双校验）。
   * 后端地址与小程序共用 TARO_APP_API_BASE_URL 对应的 VITE_API_BASE_URL。
   */
  async probe(input: {
    provider: string;
    model: string;
    base_url?: string | null;
  }): Promise<AiProbeResult> {
    return callBackendApi<AiProbeResult>('/v1/admin/ai/providers/probe', input);
  },

  /** 全量密钥状态（表格列展示）：provider + 末 4 位掩码 */
  async keysOverview(): Promise<{ provider: string; last4: string }[]> {
    return callBackendApi<{ provider: string; last4: string }[]>(
      '/v1/admin/ai/providers/keys',
      undefined,
      'GET',
    );
  },

  /** 密钥状态（FR-K6）：仅 configured + 末 4 位掩码；明文/密文均不出后端 */
  async keyStatus(provider: string): Promise<AiKeyStatus> {
    return callBackendApi<AiKeyStatus>(
      `/v1/admin/ai/providers/${encodeURIComponent(provider)}/key-status`,
      undefined,
      'GET',
    );
  },

  /** 设置密钥（AES-256-GCM 加密落库）；编辑界面留空即不调用本方法 */
  async setProviderKey(provider: string, apiKey: string): Promise<AiKeyStatus> {
    return callBackendApi<AiKeyStatus>(
      `/v1/admin/ai/providers/${encodeURIComponent(provider)}/key`,
      { api_key: apiKey },
      'PUT',
    );
  },

  /** 清除已存密钥（清除后回退环境变量密钥路径） */
  async clearProviderKey(provider: string): Promise<AiKeyStatus> {
    return callBackendApi<AiKeyStatus>(
      `/v1/admin/ai/providers/${encodeURIComponent(provider)}/key`,
      { clear: true },
      'PUT',
    );
  },
};
