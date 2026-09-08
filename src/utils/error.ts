import Taro from '@tarojs/taro'

export type ToastIcon = 'success' | 'error' | 'none'

/** 统一的用户提示（各页面不再混用 atMessage/showToast/console 两种风格） */
export function toast(message: string, icon: ToastIcon = 'none'): void {
  Taro.showToast({ title: message, icon, duration: 2000 })
}

/** 统一错误处理：开发时保留日志，用户侧展示简短文案 */
export function toastError(error: unknown, fallback = '操作失败，请稍后重试'): void {
  console.error('[app]', error)
  const message = extractErrorMessage(error)
  // 只展示简短、可读的错误；服务端长报错统一回退到友好文案
  toast(message && message.length <= 24 ? message : fallback, 'error')
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message: unknown }).message
    if (typeof message === 'string') return message
  }
  return ''
}
