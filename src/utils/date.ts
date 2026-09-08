/**
 * 日期工具。
 * 注意：'YYYY-MM-DD HH:mm' 格式直接 `new Date()` 在 iOS JavaScriptCore 上
 * 会得到 Invalid Date（小程序经典兼容性坑），必须手动解析。
 */

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** 格式化为 'YYYY-MM-DD HH:mm'（本地时区），无效日期返回 '-' */
export function formatDateTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  )
}

/** 格式化为 'YYYY-MM-DD'（本地时区），无效日期返回 '-' */
export function formatDate(value: string | Date): string {
  const formatted = formatDateTime(value)
  return formatted === '-' ? '-' : formatted.slice(0, 10)
}

/** 当前时间的表单值形式 'YYYY-MM-DD HH:mm' */
export function nowInputValue(): string {
  return formatDateTime(new Date())
}

/** 解析表单值 'YYYY-MM-DD HH:mm' 为本地时区 Date */
export function parseLocalDateTime(value: string): Date {
  const m = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})$/)
  if (!m) {
    // 兜底：'/' 分隔格式在 iOS 上可被原生解析
    return new Date(value.replace(/-/g, '/'))
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
}
