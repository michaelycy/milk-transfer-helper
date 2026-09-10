import type { PlannedDay, PlanDaySpec, TransferPlanRow } from '../types'

/**
 * 计划纯函数（FR-C3/C4/C5/C7，NFR-5 要求纯函数 + 单测）。
 * 所有"日"均为喂养日本历日（日切点默认 04:00，见 00-glossary §2）。
 */

/** 喂养日切点：当日 04:00 前算前一个喂养日 */
export const FEED_DAY_CUTOFF_HOUR = 4

/** 取某时刻所属的喂养日本历日 'YYYY-MM-DD'（凌晨 0-4 点归属前一天） */
export function toFeedDay(date: Date, cutoffHour = FEED_DAY_CUTOFF_HOUR): string {
  const d = new Date(date)
  if (d.getHours() < cutoffHour) d.setDate(d.getDate() - 1)
  return formatDateStr(d)
}

function formatDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * 由方法模板展开逐日计划（FR-C1：start_date 为第一个喂养日）。
 * 纯函数；模板缺失/为空时返回空数组（边界：模板缺失）。
 */
export function buildPlanDays(
  templateDays: PlanDaySpec[] | null | undefined,
  startDate: string,
): PlannedDay[] {
  if (!templateDays || templateDays.length === 0) return []
  const start = new Date(`${startDate}T00:00:00`)
  if (Number.isNaN(start.getTime())) return []
  return templateDays.map((spec, dayIndex) => {
    const d = new Date(start)
    d.setDate(d.getDate() + dayIndex)
    return {
      dayIndex,
      date: formatDateStr(d),
      ratio: Math.min(1, Math.max(0, spec.ratio)),
      label: spec.label,
    }
  })
}

/** 计划某一天的计划表单文案，如「启赋蕴淳 3段 · 新奶 1/3」 */
export function planDayFormulaLabel(
  toBrand: string,
  fromBrand: string,
  ratio: number,
): string {
  if (ratio >= 1) return `${toBrand}（全量新奶）`
  if (ratio <= 0) return `${fromBrand}（全量旧奶）`
  const newPart = `${toBrand} ${Math.round(ratio * 100)}%`
  const oldPart = `${fromBrand} ${Math.round((1 - ratio) * 100)}%`
  return `混合：${newPart} + ${oldPart}`
}

/**
 * 某时刻应使用的计划配方（FR-D5 记录-计划联动）。
 * 返回是否按计划，以及该顿计划配方文案；无进行中计划时 planned=false。
 */
export function resolvePlannedFeed(
  plan: Pick<TransferPlanRow, 'start_date' | 'from_brand_text' | 'to_brand_text'> | null,
  days: PlannedDay[],
  feedTime: Date,
): { planned: boolean; dayIndex: number | null; formulaLabel: string } {
  if (!plan || days.length === 0) {
    return { planned: false, dayIndex: null, formulaLabel: '无计划' }
  }
  const feedDay = toFeedDay(feedTime)
  const index = days.findIndex((day) => day.date === feedDay)
  if (index < 0) return { planned: false, dayIndex: null, formulaLabel: '计划外' }
  const day = days[index]
  return {
    planned: true,
    dayIndex: index,
    formulaLabel: planDayFormulaLabel(plan.to_brand_text, plan.from_brand_text, day.ratio),
  }
}

/**
 * 回退（FR-C5）：从第 rollbackFromIndex 天起，比例回退到 targetRatio 并保持到计划结束。
 * 返回新的逐日序列（不修改入参）。
 */
export function rollbackPlanDays(
  days: PlannedDay[],
  rollbackFromIndex: number,
  targetRatio: number,
): PlannedDay[] {
  return days.map((day) => {
    if (day.dayIndex < rollbackFromIndex || day.ratio <= targetRatio) return day
    return { ...day, ratio: targetRatio, label: `回退至新奶 ${Math.round(targetRatio * 100)}%` }
  })
}

/** 计划当前所处天数（1-based）；早于开始日返回 0，晚于结束返回天数+1 */
export function getCurrentPlanDay(days: PlannedDay[], now = new Date()): number {
  const today = toFeedDay(now)
  const index = days.findIndex((day) => day.date === today)
  if (index >= 0) return index + 1
  if (days.length === 0) return 0
  return today < days[0].date ? 0 : days.length + 1
}

/** 计划是否处于终态（completed/terminated） */
export function isTerminalStatus(status: TransferPlanRow['status']): boolean {
  return status === 'completed' || status === 'terminated'
}
