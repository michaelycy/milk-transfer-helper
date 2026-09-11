import type { Database } from '@milk-transfer/shared';

type Tables = Database['public']['Tables'];

/** 管理后台使用的行/插入类型（与 @milk-transfer/shared 保持单一事实源） */
export type MilkProductRow = Tables['milk_products']['Row'];
export type MilkProductInsert = Tables['milk_products']['Insert'];
export type ArticleRow = Tables['articles']['Row'];
export type ArticleInsert = Tables['articles']['Insert'];
export type PlanTemplateRow = Tables['plan_templates']['Row'];
export type PlanTemplateInsert = Tables['plan_templates']['Insert'];

export type ReviewStatus = ArticleRow['review_status'];
export type ProteinType = MilkProductRow['protein_type'];
export type MilkStatus = MilkProductRow['status'];
export type PlanMethod = PlanTemplateRow['method'];

/** 蛋白类型选项（与表 check 约束一致；驱动转奶方法与安全提示的关键字段，FR-B1） */
export const PROTEIN_TYPE_OPTIONS: { value: ProteinType | string; label: string }[] = [
  { value: 'intact', label: '整蛋白' },
  { value: 'partially_hydrolyzed', label: '部分水解' },
  { value: 'extensively_hydrolyzed', label: '深度水解' },
  { value: 'amino_acid', label: '氨基酸' },
];

export const PROTEIN_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  PROTEIN_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

/** 文章分类（对齐小程序文章页 TAB，G1：三大问题分类） */
export const ARTICLE_CATEGORIES = ['转奶指南', '奶粉知识', '常见问题'] as const;

/** AI 配置（FR-K1/J6）：场景行类型与标签 */
export type AiConfigRow = Tables['ai_configs']['Row'];
export type AiConfigPatch = Partial<
  Omit<AiConfigRow, 'id' | 'scene' | 'created_at' | 'updated_at'>
>;
export type AiPromptRow = Tables['ai_prompt_templates']['Row'];
export type AiPromptInsert = Tables['ai_prompt_templates']['Insert'];
export type AiSubmissionRow = Tables['milk_product_submissions']['Row'];
export type AiUsageRow = Tables['ai_usage_logs']['Row'];
export type AiScene = AiConfigRow['scene'];
export type AiReviewStatus = AiPromptRow['review_status'];

export const AI_SCENE_LABEL: Record<AiScene, string> = {
  chat: 'chat · 问答',
  poop: 'poop · 便便',
  bottle: 'bottle · 奶瓶',
  can: 'can · 奶粉罐',
};

export const AI_SCENE_OPTIONS = (Object.keys(AI_SCENE_LABEL) as AiScene[]).map((v) => ({
  value: v,
  label: AI_SCENE_LABEL[v],
}));

export const AI_REVIEW_LABEL: Record<AiReviewStatus, string> = {
  pending: '待审核',
  approved: '已审核',
  rejected: '已驳回',
};

/** 供应商注册表（FR-K6）：事实源为 name/base_url；密钥走环境变量约定，不在任何表单出现 */
export type AiProviderRow = Tables['ai_providers']['Row'];
export type AiProviderInsert = Tables['ai_providers']['Insert'];

/** 连通性自检结果（FR-K8） */
export interface AiProbeResult {
  ok: boolean;
  latency_ms: number;
  error: { message: string } | null;
  resolved_base_url: string | null;
}

/** 密钥状态（编辑界面只看得到这个：是否已配置 + 末 4 位掩码） */
export interface AiKeyStatus {
  configured: boolean;
  last4: string;
  source: 'database' | 'none';
}

/** API 运行日志行（FR-J12，api_logs 表；经后端 /v1/admin/logs 只读查询） */
export interface ApiLogRow {
  request_id: string;
  method: string;
  path: string;
  status: number;
  level: 'info' | 'warn' | 'error';
  duration_ms: number | null;
  user_id: string | null;
  message: string | null;
  created_at: string | null;
}

/** 运行日志查询条件（时间用 ISO 字符串；path 为模糊包含匹配） */
export interface ApiLogQuery {
  level?: ApiLogRow['level'];
  path?: string;
  request_id?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

/** 分页查询结果：rows + 总数（count 用于分页器） */
export interface ApiLogPage {
  rows: ApiLogRow[];
  count: number;
}
