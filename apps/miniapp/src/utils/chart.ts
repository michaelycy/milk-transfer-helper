import { formatDate } from './date'

export interface TrendPoint {
  /** 'YYYY-MM-DD' */
  date: string
  /** 当日喂养总量 ml */
  total: number
}

/**
 * 把记录按日聚合为喂养量趋势（时间升序）。
 * 纯函数，便于单元测试。
 */
export function buildDailyTrend(
  records: Array<{ feed_time: string; feed_amount: number }>
): TrendPoint[] {
  const totals = new Map<string, number>()
  const sorted = [...records].sort((a, b) => a.feed_time.localeCompare(b.feed_time))
  for (const record of sorted) {
    const date = formatDate(record.feed_time)
    if (date === '-') continue
    totals.set(date, (totals.get(date) ?? 0) + record.feed_amount)
  }
  return Array.from(totals, ([date, total]) => ({ date, total }))
}
