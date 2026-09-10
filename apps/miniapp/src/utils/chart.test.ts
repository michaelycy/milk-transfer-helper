import { describe, expect, it } from 'vitest'
import { buildDailyTrend } from './chart'

describe('buildDailyTrend', () => {
  it('按日聚合并求和，输出时间升序', () => {
    const trend = buildDailyTrend([
      { feed_time: '2024-05-23T10:00:00Z', feed_amount: 100 },
      { feed_time: '2024-05-22T02:00:00Z', feed_amount: 150 },
      { feed_time: '2024-05-23T14:00:00Z', feed_amount: 120 },
    ])

    expect(trend).toEqual([
      { date: expect.any(String), total: 150 },
      { date: expect.any(String), total: 220 },
    ])
    expect(trend[0].date < trend[1].date).toBe(true)
  })

  // 以固定时区组件构造输入，聚合键与时区无关（同一天的两条记录）
  it('同一天多条记录合并为一条', () => {
    const trend = buildDailyTrend([
      { feed_time: new Date(2024, 4, 23, 8, 0).toISOString(), feed_amount: 60 },
      { feed_time: new Date(2024, 4, 23, 20, 0).toISOString(), feed_amount: 90 },
    ])
    expect(trend).toHaveLength(1)
    expect(trend[0].total).toBe(150)
  })

  it('空输入返回空数组', () => {
    expect(buildDailyTrend([])).toEqual([])
  })
})
