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
