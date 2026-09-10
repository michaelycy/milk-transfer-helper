import type { Database } from './database'

type PublicTables = Database['public']['Tables']

/** 行类型：读取结果 */
export type UserProfile = PublicTables['users']['Row']
export type BabyRow = PublicTables['babies']['Row']
export type BabyInsert = PublicTables['babies']['Insert']
export type WeightLogRow = PublicTables['weight_logs']['Row']
export type MilkProductRow = PublicTables['milk_products']['Row']
export type PlanTemplateRow = PublicTables['plan_templates']['Row']
export type TransferPlanRow = PublicTables['transfer_plans']['Row']
export type TransferPlanInsert = PublicTables['transfer_plans']['Insert']
export type FeedRecordRow = PublicTables['feed_records']['Row']
export type FeedRecordInsert = PublicTables['feed_records']['Insert']
export type SymptomLogRow = PublicTables['symptom_logs']['Row']
export type SymptomLogInsert = PublicTables['symptom_logs']['Insert']
export type AlertRow = PublicTables['alerts']['Row']
export type ArticleRow = PublicTables['articles']['Row']
export type FavoriteRow = PublicTables['favorites']['Row']

export type { PlanStatus, PlanMethod, PlanReason, ProteinType, AlertLevel, AlertStatus, Gender } from './database'

export interface RecordStats {
  total: number
  days: number
}

/** 方法模板的逐日定义（plan_templates.days jsonb） */
export interface PlanDaySpec {
  /** 当日新奶占比 0–1 */
  ratio: number
  /** 展示用文案，如「新奶 1/3」 */
  label: string
}

/** 从模板展开后的逐日计划 */
export interface PlannedDay {
  /** 0-based 计划日序号 */
  dayIndex: number
  /** 喂养日 'YYYY-MM-DD' */
  date: string
  ratio: number
  label: string
}

/** 症状打卡草稿（页面表单 ↔ 存储字段解耦） */
export interface SymptomDraft {
  stoolCount: number
  stoolTexture: string | null
  stoolColor: string | null
  hasRash: boolean
  hasVomit: boolean
  hasBloating: boolean
  hasFever: boolean
  cryingLevel: 'normal' | 'fussy' | 'crying_a_lot'
  sleepQuality: 'normal' | 'poor'
  note: string
}
