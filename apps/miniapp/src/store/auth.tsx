import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { getAuthMode, loginAnonymous, loginWechat as wechatLogin, signOut } from '../services/auth.service'
import { ensureSession } from '../utils/auth'

export type AuthStatus = 'loading' | 'loggedOut' | 'guest' | 'wechat'

interface AuthContextValue {
  status: AuthStatus
  /** guest 或 wechat 视为已登录（数据可用） */
  authed: boolean
  isWechat: boolean
  loginGuest: () => Promise<void>
  loginWechat: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading')

  // 启动恢复：有登录态标记则静默重建会话；失败降级为未登录
  useEffect(() => {
    const mode = getAuthMode()
    if (mode === 'none') {
      setStatus('loggedOut')
      return
    }
    ensureSession()
      .then(() => setStatus(mode))
      .catch(() => setStatus('loggedOut'))
  }, [])

  const loginGuest = useCallback(async () => {
    await loginAnonymous()
    setStatus('guest')
  }, [])

  const loginWechat = useCallback(async () => {
    await wechatLogin()
    setStatus('wechat')
  }, [])

  const logout = useCallback(async () => {
    await signOut()
    setStatus('loggedOut')
  }, [])

  const value = useMemo(
    () => ({
      status,
      authed: status === 'guest' || status === 'wechat',
      isWechat: status === 'wechat',
      loginGuest,
      loginWechat,
      logout,
    }),
    [status, loginGuest, loginWechat, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 <AuthProvider> 内使用')
  return ctx
}
