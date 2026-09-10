import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, parseLocalDateTime } from './date'

// 用例均以本地时区组件构造与断言，结果与时区无关

describe('parseLocalDateTime', () => {
  it('正确解析 YYYY-MM-DD HH:mm（iOS 兼容路径）', () => {
    const d = parseLocalDateTime('2024-05-23 09:05')
    expect(d.getFullYear()).toBe(2024)
    expect(d.getMonth()).toBe(4)
    expect(d.getDate()).toBe(23)
    expect(d.getHours()).toBe(9)
    expect(d.getMinutes()).toBe(5)
  })

  it('兼容 ISO 的 T 分隔格式', () => {
    const d = parseLocalDateTime('2024-05-23T09:05')
    expect(d.getFullYear()).toBe(2024)
    expect(d.getHours()).toBe(9)
  })

  it('与 formatDateTime 往返一致', () => {
    const input = '2024-05-23 09:05'
    expect(formatDateTime(parseLocalDateTime(input))).toBe(input)
  })
})

describe('formatDateTime / formatDate', () => {
  it('输出补零的 YYYY-MM-DD HH:mm', () => {
    expect(formatDateTime(new Date(2024, 4, 3, 8, 7))).toBe('2024-05-03 08:07')
  })

  it('formatDate 输出 YYYY-MM-DD', () => {
    expect(formatDate(new Date(2024, 11, 31, 23, 59))).toBe('2024-12-31')
  })

  it('无效输入返回占位符', () => {
    expect(formatDateTime('not-a-date')).toBe('-')
    expect(formatDate('not-a-date')).toBe('-')
  })
})
