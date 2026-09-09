import { useEffect, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { getAuthMode } from '../../services/auth.service'
import { ensureSession } from '../../utils/auth'
import './index.scss'

/** 开屏页：品牌展示 + 登录态路由（已登录 → 首页；未登录 → 登录页） */
export default function Splash() {
  const [leaving, setLeaving] = useState(false)

  const route = () => {
    setLeaving(true)
    const mode = getAuthMode()
    if (mode === 'none') {
      Taro.redirectTo({ url: '/pages/login/index' })
    } else {
      // 静默重建会话（Supabase 持久化会话，通常瞬时完成）
      ensureSession()
        .then(() => Taro.switchTab({ url: '/pages/index/index' }))
        .catch(() => Taro.redirectTo({ url: '/pages/login/index' }))
    }
  }

  // 品牌展示停留 1.2s 后自动路由；点击可跳过等待
  useEffect(() => {
    const timer = setTimeout(route, 1200)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useDidShow(() => {
    /* 空实现：保证 onShow 生命周期被页面占用，避免首页 useDidShow 提前触发数据加载 */
  })

  return (
    <View className={`splash ${leaving ? 'is-leaving' : ''}`} onClick={route}>
      <View className='splash__brand'>
        <View className='splash__logo'>
          <Text>🍼</Text>
        </View>
        <Text className='splash__name'>婴儿转奶助手</Text>
        <Text className='splash__slogan'>跟着走的转奶助手 · 有依据 可观察 能复盘</Text>
      </View>
      <Text className='splash__copyright'>选奶 → 转奶 → 记录 → 复盘</Text>
    </View>
  )
}
