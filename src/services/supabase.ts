import { createClient } from '@supabase/supabase-js'
import Taro from '@tarojs/taro'
import type { Database } from '../types/database'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config/env'

// ---------- 网络适配：小程序无 fetch/Response，用 Taro.request 实现最小适配层 ----------
// supabase-js 只依赖 fetch 返回对象的 ok/status/headers.get/json/text，手写同形对象即可。
// H5 端存在原生 fetch，此处仅在缺失时挂载，避免覆盖浏览器实现。

interface FetchInit {
  method?: string
  headers?: Record<string, string>
  body?: string
}

type FetchLike = (url: string, init?: FetchInit) => Promise<Response>

function normalizeHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== 'object') return {}
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (value != null) result[key] = String(value)
  }
  return result
}

type ResponseData = string | Record<string, any>

function toResponse(res: Taro.request.SuccessCallbackResult<ResponseData>): Response {
  const status = res.statusCode
  const data = res.data
  const text = typeof data === 'string' ? data : JSON.stringify(data ?? null)
  const headerMap: Record<string, string> = {}
  for (const [key, value] of Object.entries(res.header ?? {})) {
    headerMap[key.toLowerCase()] = String(value)
  }
  const response = {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: {
      get: (name: string): string | null => headerMap[name.toLowerCase()] ?? null,
    },
    json: async () => (typeof data === 'string' ? JSON.parse(text) : data),
    text: async () => text,
  }
  return response as unknown as Response
}

const taroFetch: FetchLike = (url, init = {}) =>
  new Promise((resolve, reject) => {
    Taro.request({
      url,
      method: (init.method ?? 'GET') as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      data: init.body,
      header: { 'Content-Type': 'application/json', ...normalizeHeaders(init.headers) },
      success: (res) => resolve(toResponse(res)),
      fail: (err) => reject(new Error(err.errMsg || '网络请求失败')),
    })
  })

if (typeof globalThis.fetch !== 'function') {
  Object.defineProperty(globalThis, 'fetch', {
    value: taroFetch,
    writable: true,
    configurable: true,
  })
}

// ---------- 会话存储适配：auth-js 默认用 localStorage，小程序没有 ----------
const taroStorage = {
  getItem: (key: string): string | null => {
    const value = Taro.getStorageSync(key)
    return value ? String(value) : null
  },
  setItem: (key: string, value: string): void => {
    Taro.setStorageSync(key, value)
  },
  removeItem: (key: string): void => {
    Taro.removeStorageSync(key)
  },
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: taroStorage,
    persistSession: true,
    autoRefreshToken: true,
    // 小程序无 URL 查询参数会话，关闭以避免内部访问 window.location
    detectSessionInUrl: false,
  },
})
