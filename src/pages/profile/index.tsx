import { useEffect, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Avatar, Cell } from '@taroify/core'
import { RecordService } from '../../services/record.service'
import { toastError } from '../../utils/error'
import type { RecordStats } from '../../types'
import './index.scss'

export default function Profile() {
  const [stats, setStats] = useState<RecordStats>({ total: 0, days: 0 })

  useEffect(() => {
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
  }, [])

  return (
    <View className='profile-page'>
      <View className='user-card'>
        <Avatar shape='circle' size='large'>
          用户
        </Avatar>
        <View className='user-info'>
          <Text className='nickname'>普通用户</Text>
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
    </View>
  )
}
