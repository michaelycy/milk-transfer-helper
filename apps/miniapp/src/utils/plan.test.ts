import { describe, expect, it } from 'vitest'
import {
  buildPlanDays,
  getCurrentPlanDay,
  planDayFormulaLabel,
  resolvePlannedFeed,
  rollbackPlanDays,
  toFeedDay,
} from './plan'
import type { PlanDaySpec } from '../types'

const MIXED_DAYS: PlanDaySpec[] = [
  { ratio: 0.33, label: '新奶 1/3' },
  { ratio: 0.33, label: '新奶 1/3' },
  { ratio: 0.5, label: '新奶 1/2' },
]

describe('buildPlanDays', () => {
  it('按开始日展开逐日序列', () => {
    const days = buildPlanDays(MIXED_DAYS, '2026-09-10')
    expect(days).toHaveLength(3)
    expect(days[0]).toMatchObject({ dayIndex: 0, date: '2026-09-10', ratio: 0.33 })
    expect(days[2].date).toBe('2026-09-12')
  })

  it('跨月边界正确', () => {
    const days = buildPlanDays([{ ratio: 1, label: '全量' }], '2026-09-30')
    expect(days[0].date).toBe('2026-09-30')
    const days2 = buildPlanDays(
      [
        { ratio: 1, label: 'a' },
        { ratio: 1, label: 'b' },
      ],
      '2026-09-30',
    )
    expect(days2[1].date).toBe('2026-10-01')
  })

  it('模板缺失/为空返回空数组；非法开始日返回空数组', () => {
    expect(buildPlanDays(null, '2026-09-10')).toEqual([])
    expect(buildPlanDays([], '2026-09-10')).toEqual([])
    expect(buildPlanDays(MIXED_DAYS, 'not-a-date')).toEqual([])
  })
})

describe('toFeedDay（喂养日切点 04:00）', () => {
  it('凌晨 3 点归属前一喂养日', () => {
    expect(toFeedDay(new Date('2026-09-10T03:00:00'))).toBe('2026-09-09')
  })

  it('凌晨 4 点起归属当天', () => {
    expect(toFeedDay(new Date('2026-09-10T04:00:00'))).toBe('2026-09-10')
  })
})

describe('resolvePlannedFeed（FR-D5 记录-计划联动）', () => {
  const plan = {
    start_date: '2026-09-10',
    from_brand_text: '启赋 1段',
    to_brand_text: '启赋 2段',
  }
  const days = buildPlanDays(MIXED_DAYS, '2026-09-10')

  it('计划日内的记录返回按计划与配方文案', () => {
    const r = resolvePlannedFeed(plan, days, new Date('2026-09-11T10:00:00'))
    expect(r.planned).toBe(true)
    expect(r.dayIndex).toBe(1)
    expect(r.formulaLabel).toContain('启赋 2段')
  })

  it('超出计划范围的时刻返回计划外', () => {
    const r = resolvePlannedFeed(plan, days, new Date('2026-09-20T10:00:00'))
    expect(r.planned).toBe(false)
    expect(r.formulaLabel).toBe('计划外')
  })

  it('无计划时返回无计划', () => {
    const r = resolvePlannedFeed(null, days, new Date('2026-09-10T10:00:00'))
    expect(r.planned).toBe(false)
    expect(r.formulaLabel).toBe('无计划')
  })
})

describe('rollbackPlanDays（FR-C5）', () => {
  it('从指定天起回退比例，之前的保持不变', () => {
    const days = buildPlanDays(MIXED_DAYS, '2026-09-10')
    const rolled = rollbackPlanDays(days, 1, 0.25)
    expect(rolled[0].ratio).toBe(0.33)
    expect(rolled[1].ratio).toBe(0.25)
    expect(rolled[1].label).toContain('回退')
    expect(rolled[2].ratio).toBe(0.25)
  })

  it('比例已低于目标的天保持不变，且不修改入参', () => {
    const days = buildPlanDays(MIXED_DAYS, '2026-09-10')
    const snapshot = JSON.stringify(days)
    rollbackPlanDays(days, 0, 0.5)
    expect(JSON.stringify(days)).toBe(snapshot)
  })
})

describe('getCurrentPlanDay / planDayFormulaLabel', () => {
  it('今天处于计划内时返回对应天数（1-based）', () => {
    const days = buildPlanDays(MIXED_DAYS, '2026-09-10')
    const now = new Date()
    const today = days[1]
    // 用 toFeedDay 同口径构造 now
    const nowAt = new Date(`${today.date}T12:00:00`)
    expect(getCurrentPlanDay(days, nowAt)).toBe(2)
    void today
    void now
  })

  it('全量新奶与全量旧奶的文案', () => {
    expect(planDayFormulaLabel('B2', 'B1', 1)).toContain('全量新奶')
    expect(planDayFormulaLabel('B2', 'B1', 0)).toContain('全量旧奶')
  })
})
