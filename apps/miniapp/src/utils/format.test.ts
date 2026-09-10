import { describe, expect, it } from 'vitest'
import { formatReadCount, formatRelativeTime } from './format'

describe('formatReadCount', () => {
  it('千以内原样输出', () => {
    expect(formatReadCount(0)).toBe('0')
    expect(formatReadCount(960)).toBe('960')
  })

  it('千级输出 k 并去掉末尾 .0', () => {
    expect(formatReadCount(8600)).toBe('8.6k')
    expect(formatReadCount(6000)).toBe('6k')
    expect(formatReadCount(9999)).toBe('10k')
  })

  it('万级输出 w', () => {
    expect(formatReadCount(12000)).toBe('1.2w')
    expect(formatReadCount(100000)).toBe('10w')
  })

  it('非法输入兜底为 0', () => {
    expect(formatReadCount(-5)).toBe('0')
    expect(formatReadCount(Number.NaN)).toBe('0')
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-09-10T12:00:00')

  it('当天与未来时间显示刚刚', () => {
    expect(formatRelativeTime('2026-09-10T08:00:00', now)).toBe('刚刚')
    expect(formatRelativeTime('2026-09-11T08:00:00', now)).toBe('刚刚')
  })

  it('一周内显示 N天前', () => {
    expect(formatRelativeTime('2026-09-08T12:00:00', now)).toBe('2天前')
    expect(formatRelativeTime('2026-09-05T12:00:00', now)).toBe('5天前')
  })

  it('三十天内显示 N周前', () => {
    expect(formatRelativeTime('2026-09-03T12:00:00', now)).toBe('1周前')
    expect(formatRelativeTime('2026-08-20T12:00:00', now)).toBe('3周前')
  })

  it('更早显示 N个月前', () => {
    expect(formatRelativeTime('2026-06-10T12:00:00', now)).toBe('3个月前')
  })

  it('无效日期返回空串', () => {
    expect(formatRelativeTime('not-a-date', now)).toBe('')
  })
})
