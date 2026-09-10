import { useEffect, useState } from 'react'
import { Text, View } from '@tarojs/components'

import Taro from '@tarojs/taro'
import { Avatar, Cell } from '@taroify/core'
import { LoginGate } from '../../components/LoginGate'
import { useAuth } from '../../store/auth'
import { RecordService } from '../../services/record.service'
import { toastError } from '../../utils/error'
import type { RecordStats } from '../../types'
import './index.scss'

/** 我的（未登录态由 LoginGate 呈现登录引导） */
export default function Profile() {
  const { authed, isWechat, logout } = useAuth()
  const [stats, setStats] = useState<RecordStats>({ total: 0, days: 0 })

  useEffect(() => {
    if (!authed) return
    let cancelled = false
    const fetchStats = async () => {
      try {
        const data = await RecordService.getStats()
        if (!cancelled) setStats(data)
      } catch (error) {
        if (!cancelled) toastError(error, '获取统计失败')
      }
    }
    void fetchStats()
    return () => {
      cancelled = true
    }
  }, [authed])

  const handleLogout = () => {
    void Taro.showModal({
      title: '退出登录',
      content: '退出后将返回登录页；游客模式的数据仅保存在本设备。',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm) void logout()
      },
    })
  }

  return (
    <LoginGate>
      <View className='profile-page'>
        <View className='user-card'>
          <Avatar shape='circle' size='large'>
            用户
          </Avatar>
          <View className='user-info'>
            <Text className='nickname'>普通用户</Text>
            <Text className='user-mode'>{isWechat ? '微信登录 · 数据云端同步' : '游客模式 · 数据仅本设备'}</Text>
          </View>
        </View>

        <View className='stats-card'>
          <View className='stat-item'>
            <Text className='num'>{stats.total}</Text>
            <Text className='label'>记录总数</Text>
          </View>
          <View className='stat-item'>
            <Text className='num'>{stats.days}</Text>
            <Text className='label'>记录天数</Text>
          </View>
        </View>

        <View className='menu-list'>
          <Cell.Group>
            <Cell
              title='宝宝档案'
              isLink
              clickable
              onClick={() => Taro.navigateTo({ url: '/packages/baby/pages/create/index' })}
            />
            <Cell title='我的收藏' isLink clickable />
            <Cell title='关于我们' isLink clickable />
            <Cell title='设置' isLink clickable />
          </Cell.Group>
        </View>

        <View className='logout-section'>
          <Cell title='退出登录' clickable onClick={() => void handleLogout()} />
        </View>
      </View>
    </LoginGate>
  )
}
