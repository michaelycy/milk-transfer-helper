import { describe, expect, it } from 'vitest'
import { calcAge, getMilkReference, getStageTip } from './baby'
import { formatDate } from './date'

describe('calcAge（FR-A1 月龄计算，跨月/跨年）', () => {
  it('同月内计算天数', () => {
    const age = calcAge('2026-01-08', new Date('2026-01-20T12:00:00'))
    expect(age).toEqual({ months: 0, days: 12, text: '0 个月 12 天' })
  })

  it('跨月正确', () => {
    const age = calcAge('2026-01-08', new Date('2026-09-09T12:00:00'))
    expect(age!.months).toBe(8)
    expect(age!.text).toBe('8 个月 1 天')
  })

  it('跨年正确', () => {
    const age = calcAge('2025-06-15', new Date('2026-06-15T12:00:00'))
    expect(age!.months).toBe(12)
    expect(age!.text).toBe('12 个月 0 天')
  })

  it('非法日期返回 null', () => {
    expect(calcAge('bad-date')).toBeNull()
  })
})

describe('getStageTip（FR-A4 段位转换时机，提前 14 天）', () => {
  it('满 6 月龄前 14 天内触发 2 段提示', () => {
    const birth = '2026-03-10'
    const now = new Date('2026-09-01T12:00:00') // 距 9-10 满 6 月龄还有 9 天
    expect(getStageTip(birth, now)).toMatchObject({ stage: 2 })
  })

  it('月龄尚早时不提示', () => {
    expect(getStageTip('2026-06-01', new Date('2026-07-01T12:00:00'))).toBeNull()
  })

  it('已满 6 月龄（提示窗口已过）不再提示', () => {
    expect(getStageTip('2026-03-01', new Date('2026-09-20T12:00:00'))).toBeNull()
  })
})

describe('getMilkReference（FR-F3 奶量参考）', () => {
  it('纯奶期有体重：按 150ml/kg 并设上限', () => {
    const r = getMilkReference(3, 7)
    expect(r.degraded).toBe(false)
    expect(r.minMl).toBe(893)
    expect(r.maxMl).toBe(1000)
  })

  it('纯奶期无体重：按月龄中位体重降级估算', () => {
    const r = getMilkReference(2, null)
    expect(r.degraded).toBe(true)
    expect(r.minMl).toBeGreaterThan(0)
  })

  it('辅食期（6–12 月）按档位区间', () => {
    const r = getMilkReference(8, 9)
    expect(r).toMatchObject({ minMl: 600, maxMl: 800, degraded: false })
  })

  it('12 月以上档位', () => {
    expect(getMilkReference(15, 10)).toMatchObject({ minMl: 400, maxMl: 600 })
  })

  it('formatDate 供展示使用（防止 date.ts 回归）', () => {
    expect(formatDate(new Date('2026-09-09T10:00:00'))).toBe('2026-09-09')
  })
})
