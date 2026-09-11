import { useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Button } from '@taroify/core'
import { supabase } from '../../../../services/supabase'
import '../shared.scss'

interface ExportBundle {
  exported_at: string
  babies: unknown[]
  feed_records: unknown[]
  symptom_logs: unknown[]
  weight_logs: unknown[]
  transfer_plans: unknown[]
}

/** 隐私中心（FR-H2）：政策入口 + 个人信息导出（PIPL 查阅复制权）+ 注销入口见账号与安全 */
export default function Privacy() {
  const [exporting, setExporting] = useState(false)

  const exportData = async () => {
    setExporting(true)
    try {
      const tables = ['babies', 'feed_records', 'symptom_logs', 'weight_logs', 'transfer_plans'] as const
      const bundle: Partial<ExportBundle> = { exported_at: new Date().toISOString() }
      for (const table of tables) {
        const { data, error } = await supabase.from(table).select('*').limit(1000)
        if (error) throw error
        bundle[table] = data ?? []
      }
      await Taro.setClipboardData({ data: JSON.stringify(bundle) })
      Taro.showToast({ title: '已复制到剪贴板', icon: 'success' })
    } catch (e) {
      Taro.showToast({ title: '导出失败，请重试', icon: 'none' })
      void e
    } finally {
      setExporting(false)
    }
  }

  return (
    <View className='user-page'>
      <View className='page-header'>
        <Text className='page-title'>隐私中心</Text>
      </View>
      <View className='card policy-card'>
        <Text className='sec-title'>我们如何处理宝宝的数据</Text>
        <Text className='para'>
          宝宝数据属敏感个人信息（未成年人）。建档前我们单独征求同意并留痕；所有记录仅本人（及
          家庭共享成员，按角色）可见，行级隔离由数据库强制；照片遵循「分析即弃」，不落库。
        </Text>
        <Text className='sec-title'>你的权利</Text>
        <Text className='para'>
          你可以随时导出全部记录（下方按钮）、解绑手机号，或注销账号——注销将级联删除全部数据，
          不可恢复。
        </Text>
      </View>
      <Button className='primary-btn' variant='contained' color='primary' disabled={exporting} onClick={() => void exportData()}>
        {exporting ? '导出中…' : '导出我的数据（JSON）'}
      </Button>
      <Text className='foot-hint'>导出内容将复制到剪贴板，仅包含本人数据</Text>
    </View>
  )
}
