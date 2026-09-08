import type { BabyRow } from '../types'
import { formatDate } from './date'

/**
 * 宝宝档案纯函数（FR-A1/A4、FR-F3 奶量参考，纯函数 + 单测）。
 */

export interface AgeText {
  months: number
  days: number
  /** 展示文案，如「8 个月 1 天」；出生当日为「0 个月 0 天」 */
  text: string
}

/** 由出生日期计算月龄与天数（跨月/跨年正确；FR-A1 验收要求纯函数） */
export function calcAge(birthDate: string, now = new Date()): AgeText | null {
  const birth = new Date(`${birthDate}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return null
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth())
  let anchor = new Date(birth)
  anchor.setMonth(anchor.getMonth() + months)
  if (anchor > now) {
    months -= 1
    anchor = new Date(birth)
    anchor.setMonth(anchor.getMonth() + months)
  }
  const days = Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / 86400000))
  const text = `${months} 个月 ${days} 天`
  return { months, days, text }
}

/** 段位建议阈值：6/12/36 月龄换段，提前 leadDays 天提示（FR-A4） */
export interface StageTip {
  stage: number
  text: string
}

export function getStageTip(
  birthDate: string,
  now = new Date(),
  options = { leadDays: 14 },
): StageTip | null {
  const age = calcAge(birthDate, now)
  if (!age) return null
  const totalDays = Math.floor((now.getTime() - new Date(`${birthDate}T00:00:00`).getTime()) / 86400000)
  const stages: Array<{ atMonth: number; stage: number; target: string }> = [
    { atMonth: 6, stage: 2, target: '2 段' },
    { atMonth: 12, stage: 3, target: '3 段' },
    { atMonth: 36, stage: 4, target: '4 段' },
  ]
  for (const s of stages) {
    const daysAtMonth = Math.round(s.atMonth * 30.44)
    if (totalDays >= daysAtMonth - options.leadDays && totalDays < daysAtMonth) {
      return { stage: s.stage, text: `宝宝快 ${s.atMonth} 个月了，可以开始规划换 ${s.target}` }
    }
  }
  return null
}

/**
 * 每日总奶量参考区间（FR-F3，数值为配置草案，上线前经顾问审核 NFR-1）。
 * 纯奶期（0–6 月）按体重 150ml/kg/天（上限 1000ml）；辅食期按月龄档位区间。
 * 无体重且纯奶期时，按月龄中位体重降级估算；不报错、不隐藏。
 */
export interface MilkReference {
  minMl: number
  maxMl: number
  /** 是否为降级估算（无体重） */
  degraded: boolean
}

const MEDIAN_WEIGHT_KG_BY_MONTH: Array<{ maxMonth: number; kg: number }> = [
  { maxMonth: 1, kg: 4.5 },
  { maxMonth: 3, kg: 6.5 },
  { maxMonth: 6, kg: 8 },
]

export function getMilkReference(
  ageMonths: number,
  weightKg: number | null,
): MilkReference {
  if (ageMonths < 6) {
    const kg = weightKg ?? MEDIAN_WEIGHT_KG_BY_MONTH.find((m) => ageMonths <= m.maxMonth)?.kg ?? 8
    const base = Math.round(kg * 150)
    return {
      minMl: Math.round(base * 0.85),
      maxMl: Math.min(1000, Math.round(base * 1.15)),
      degraded: weightKg == null,
    }
  }
  if (ageMonths < 12) return { minMl: 600, maxMl: 800, degraded: false }
  return { minMl: 400, maxMl: 600, degraded: false }
}

/** 是否已建档（FR-A1：未建档时记录/计划功能应引导建档） */
export function hasBabyProfile(baby: BabyRow | null | undefined): boolean {
  return !!baby
}

/** 展示用出生日期 */
export function formatBirthDate(baby: Pick<BabyRow, 'birth_date'>): string {
  return formatDate(baby.birth_date)
}
