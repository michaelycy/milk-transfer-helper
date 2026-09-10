import { describe, expect, it } from 'vitest'
import { buildReviewReport } from './review'

const plan = {
  status: 'completed' as const,
  rollback_count: 1,
  start_date: '2026-09-10',
  method: 'mixed' as const,
  terminate_reason: null,
  plannedDays: 7,
}

const rec = (day: string, amount: number, planId: string | null) => ({
  feed_time: `${day}T10:00:00`,
  feed_amount: amount,
  plan_id: planId,
})

describe('buildReviewReport（FR-F2 复盘报告）', () => {
  it('聚合实际天数/总奶量/按计划率/预警次数/回退次数', () => {
    const r = buildReviewReport({
      plan,
      records: [
        rec('2026-09-10', 200, 'p1'),
        rec('2026-09-10', 180, null),
        rec('2026-09-11', 210, 'p1'),
      ],
      alerts: [{ level: 'yellow', status: 'resolved' }],
      weightsKg: [],
    })
    expect(r.actualDays).toBe(2)
    expect(r.totalMl).toBe(590)
    expect(r.onPlanRate).toBeCloseTo(2 / 3)
    expect(r.yellowAlerts).toBe(1)
    expect(r.redAlerts).toBe(0)
    expect(r.rollbackCount).toBe(1)
    expect(r.dailyTotals).toHaveLength(2)
  })

  it('无体重时 weightChange 为 null（不报错）', () => {
    const r = buildReviewReport({ plan, records: [], alerts: [], weightsKg: [] })
    expect(r.weightChangeKg).toBeNull()
    expect(r.actualDays).toBe(0)
    expect(r.onPlanRate).toBe(0)
  })

  it('体重一条时也不计算变化（需 ≥2 条）', () => {
    const r = buildReviewReport({ plan, records: [], alerts: [], weightsKg: [7.2] })
    expect(r.weightChangeKg).toBeNull()
  })

  it('终止态计划同样可生成复盘', () => {
    const r = buildReviewReport({
      plan: { ...plan, status: 'terminated' as const, terminate_reason: '宝宝不适应当即停转' },
      records: [rec('2026-09-10', 150, 'p1')],
      alerts: [{ level: 'red', status: 'acked' }],
      weightsKg: [7.0, 7.3],
    })
    expect(r.redAlerts).toBe(1)
    expect(r.weightChangeKg).toBeCloseTo(0.3)
  })
})
