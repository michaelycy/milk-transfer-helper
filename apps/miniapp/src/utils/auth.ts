import { supabase } from '../services/supabase'

/**
 * 确保存在 Supabase 会话（匿名登录），并返回当前用户 id。
 * 并发调用共享同一个进行中的 Promise，避免重复触发 signInAnonymously。
 *
 * 前置要求：Supabase Dashboard → Authentication 中已启用 Anonymous sign-ins。
 */
let sessionPromise: Promise<string> | null = null

export function ensureSession(): Promise<string> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session?.user) return data.session.user.id

      const { data: signInData, error } = await supabase.auth.signInAnonymously()
      if (error) {
        if (error.code === 'anonymous_provider_disabled' || /anonymous/i.test(error.message)) {
          throw new Error('匿名登录未启用：请在 Supabase Dashboard 的 Authentication 设置中开启 Anonymous sign-ins')
        }
        throw error
      }
      if (!signInData.user) throw new Error('匿名登录失败：服务端未返回用户')
      return signInData.user.id
    })().catch((error) => {
      // 失败后清空缓存，允许下次重试
      sessionPromise = null
      throw error
    })
  }
  return sessionPromise
}
