/**
 * 展示格式化纯函数（首页推荐文章等模块共用）。
 */

/** 阅读数口径与设计稿一致：960 → '960'，8600 → '8.6k'，12000 → '1.2w' */
export function formatReadCount(count: number): string {
  if (!Number.isFinite(count) || count < 0) return '0'
  if (count < 1000) return String(count)
  if (count < 10000) return `${trimTrailingZero((count / 1000).toFixed(1))}k`
  return `${trimTrailingZero((count / 10000).toFixed(1))}w`
}

function trimTrailingZero(value: string): string {
  return value.endsWith('.0') ? value.slice(0, -2) : value
}

/**
 * 相对时间：刚刚 / N天前 / N周前 / N个月前，无效日期返回 ''。
 * now 参数供测试注入，业务调用不传。
 */
export function formatRelativeTime(value: string | Date, now: Date = new Date()): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays <= 0) return '刚刚'
  if (diffDays < 7) return `${diffDays}天前`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`
  return `${Math.floor(diffDays / 30)}个月前`
}
