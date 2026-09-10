import type { PropsWithChildren } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useAuth } from '../../store/auth'
import './index.scss'

/**
 * Tab 页未登录态（登录门）。
 * 已登录（guest/wechat）渲染页面内容；未登录渲染统一的登录引导。
 */
export function LoginGate({ children }: PropsWithChildren) {
  const { status } = useAuth()

  if (status === 'loading') {
    return (
      <View className='login-gate'>
        <Text className='login-gate__loading'>加载中...</Text>
      </View>
    )
  }

  if (status === 'loggedOut') {
    const goLogin = () => Taro.redirectTo({ url: '/pages/login/index' })
    return (
      <View className='login-gate'>
        <View className='login-gate__icon'>
          <Text>🔒</Text>
        </View>
        <Text className='login-gate__title'>登录后开启完整体验</Text>
        <Text className='login-gate__desc'>数据云端同步 · 换机不丢失 · 支持多宝宝管理</Text>
        <View className='login-gate__btn' onClick={goLogin}>
          <Text>微信一键登录</Text>
        </View>
        <Text className='login-gate__link' onClick={goLogin}>
          先逛逛（游客模式，数据不跨设备）
        </Text>
      </View>
    )
  }

  return <>{children}</>
}
