import type { AlertRow, FeedRecordRow, TransferPlanRow } from '../types'

/**
 * 计划复盘报告（FR-F2，纯函数 + 单测）。
 * 报告数据全部来自落库数据；无体重/无预警时不报错，字段降级为空。
 */

export interface ReviewInput {
  plan: Pick<TransferPlanRow, 'status' | 'rollback_count' | 'start_date' | 'method' | 'terminate_reason'> & {
    /** 计划模板总天数 */
    plannedDays: number
  }
  /** 计划期内的喂养记录（至少含 feed_time / feed_amount / plan_id） */
  records: Array<Pick<FeedRecordRow, 'feed_time' | 'feed_amount' | 'plan_id'>>
  /** 计划相关预警 */
  alerts: Array<Pick<AlertRow, 'level' | 'status'>>
  /** 体重记录（kg，时间升序），可为空 */
  weightsKg: number[]
}

export interface ReviewReport {
  /** 实际执行天数（有记录的喂养日数； terminated 时也可能小于计划天数） */
  actualDays: number
  plannedDays: number
  totalMl: number
  /** 按计划顿次占比 0–1（plan_id 非空的记录占比；无记录时为 0） */
  onPlanRate: number
  yellowAlerts: number
  redAlerts: number
  rollbackCount: number
  dailyTotals: Array<{ label: string; total: number }>
  /** 体重变化 kg；不足两条记录时为 null */
  weightChangeKg: number | null
}

export function buildReviewReport(input: ReviewInput): ReviewReport {
  const totals = new Map<string, number>()
  for (const r of input.records) {
    const day = r.feed_time.slice(0, 10)
    totals.set(day, (totals.get(day) ?? 0) + r.feed_amount)
  }
  const onPlanCount = input.records.filter((r) => r.plan_id != null).length
  const weightChangeKg =
    input.weightsKg.length >= 2
      ? Math.round((input.weightsKg[input.weightsKg.length - 1] - input.weightsKg[0]) * 10) / 10
      : null

  return {
    actualDays: totals.size,
    plannedDays: input.plan.plannedDays,
    totalMl: input.records.reduce((sum, r) => sum + r.feed_amount, 0),
    onPlanRate: input.records.length === 0 ? 0 : onPlanCount / input.records.length,
    yellowAlerts: input.alerts.filter((a) => a.level === 'yellow').length,
    redAlerts: input.alerts.filter((a) => a.level === 'red').length,
    rollbackCount: input.plan.rollback_count,
    dailyTotals: Array.from(totals, ([label, total]) => ({ label, total })),
    weightChangeKg,
  }
}
