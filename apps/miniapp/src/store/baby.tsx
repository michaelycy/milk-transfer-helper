import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import Taro from '@tarojs/taro'
import { BabyService } from '../services/baby.service'
import { useAuth } from './auth'
import type { BabyRow } from '../types'

/**
 * 全局宝宝状态（FR-A2 多宝宝切换）。
 * 所有按宝宝隔离的数据（记录/计划/预警/统计）都应从 useBaby() 取 currentBaby.id。
 */

const CURRENT_BABY_KEY = 'baby:current-id'

interface BabyContextValue {
  babies: BabyRow[]
  /** 当前宝宝；档案为空时为 null（页面应引导建档 FR-A1） */
  currentBaby: BabyRow | null
  loading: boolean
  reload: () => Promise<void>
  switchBaby: (id: string) => void
  /** 建档后调用：刷新列表并把当前宝宝切到新档案 */
  setCurrentBaby: (baby: BabyRow) => void
}

const BabyContext = createContext<BabyContextValue | null>(null)

export function BabyProvider({ children }: PropsWithChildren) {
  const { status } = useAuth()
  const [babies, setBabies] = useState<BabyRow[]>([])
  const [currentBaby, setCurrentBabyState] = useState<BabyRow | null>(null)
  const [loading, setLoading] = useState(status === 'loading')

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const list = await BabyService.list()
      setBabies(list)
      const savedId = Taro.getStorageSync(CURRENT_BABY_KEY) as string
      const saved = list.find((b) => b.id === savedId)
      setCurrentBabyState(saved ?? list[0] ?? null)
    } finally {
      setLoading(false)
    }
  }, [])

  // 仅在已登录（guest/wechat）时加载宝宝数据；未登录清空状态
  useEffect(() => {
    if (status === 'guest' || status === 'wechat') {
      void reload()
    } else if (status === 'loggedOut') {
      setBabies([])
      setCurrentBabyState(null)
      setLoading(false)
    }
  }, [status, reload])

  const switchBaby = useCallback(
    (id: string) => {
      const baby = babies.find((b) => b.id === id)
      if (!baby) return
      Taro.setStorageSync(CURRENT_BABY_KEY, id)
      setCurrentBabyState(baby)
    },
    [babies],
  )

  const setCurrentBaby = useCallback((baby: BabyRow) => {
    Taro.setStorageSync(CURRENT_BABY_KEY, baby.id)
    setCurrentBabyState(baby)
    setBabies((prev) => (prev.some((b) => b.id === baby.id) ? prev : [...prev, baby]))
  }, [])

  const value = useMemo(
    () => ({ babies, currentBaby, loading, reload, switchBaby, setCurrentBaby }),
    [babies, currentBaby, loading, reload, switchBaby, setCurrentBaby],
  )

  return <BabyContext.Provider value={value}>{children}</BabyContext.Provider>
}

export function useBaby(): BabyContextValue {
  const ctx = useContext(BabyContext)
  if (!ctx) throw new Error('useBaby 必须在 <BabyProvider> 内使用')
  return ctx
}
