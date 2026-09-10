import { useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useAuth } from '../../store/auth'
import './index.scss'

/** 登录页（FR-H1 / V2-12）：微信一键登录 + 匿名兜底 + 隐私勾选 */
export default function Login() {
  const { loginGuest, loginWechat } = useAuth()
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState<'none' | 'wechat' | 'guest'>('none')

  const guard = (): boolean => {
    if (!agreed) {
      Taro.showToast({ title: '请先阅读并同意隐私政策', icon: 'none' })
      return false
    }
    if (busy !== 'none') return false
    return true
  }

  const handleWechat = async () => {
    if (!guard()) return
    setBusy('wechat')
    try {
      await loginWechat()
      Taro.switchTab({ url: '/pages/index/index' })
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '微信登录暂不可用，可先使用游客模式',
        icon: 'none',
      })
    } finally {
      setBusy('none')
    }
  }

  const handleGuest = async () => {
    if (!guard()) return
    setBusy('guest')
    try {
      await loginGuest()
      Taro.switchTab({ url: '/pages/index/index' })
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '进入失败，请重试', icon: 'none' })
    } finally {
      setBusy('none')
    }
  }

  return (
    <View className='login'>
      <View className='login__brand'>
        <View className='login__logo'>
          <Text>🍼</Text>
        </View>
        <Text className='login__name'>转奶日记</Text>
        <Text className='login__slogan'>记录宝宝转奶的每一天 · 科学又安心</Text>
      </View>

      <View className='login__actions'>
        <View
          className={`login__wechat ${busy === 'wechat' ? 'is-loading' : ''}`}
          onClick={() => void handleWechat()}
        >
          <Text>{busy === 'wechat' ? '登录中...' : '微信一键登录'}</Text>
        </View>
        <View
          className={`login__guest ${busy === 'guest' ? 'is-loading' : ''}`}
          onClick={() => void handleGuest()}
        >
          <Text>暂不登录，先逛逛</Text>
        </View>
      </View>

      <View className='login__agree'>
        <View className={`login__check ${agreed ? 'is-on' : ''}`} onClick={() => setAgreed(!agreed)}>
          {agreed && <Text className='login__check-mark'>✓</Text>}
        </View>
        <Text className='login__agree-t1'>已阅读并同意</Text>
        <Text className='login__agree-link'>《用户协议》</Text>
        <Text className='login__agree-t1'>和</Text>
        <Text className='login__agree-link'>《隐私政策》</Text>
      </View>
      <Text className='login__guest-tip'>游客模式可完整体验，但数据仅保存在本设备</Text>
    </View>
  )
}
