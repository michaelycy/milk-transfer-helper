import { useCallback, useEffect, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { Button } from '@taroify/core'
import { AlertService } from '../../../../services/alert.service'
import { PlanService } from '../../../../services/plan.service'
import { track } from '../../../../services/analytics.service'
import type { AlertRow } from '../../../../types'
import './index.scss'

interface AlertEvidence {
  evidence?: string[]
  skipped?: string[]
  totalMl?: number
  logDate?: string
}

/** 预警详情（FR-E2 / V2-08）：三重传达、一键回退、免责声明；红色预警只能确认 */
export default function AlertDetail() {
  const router = useRouter()
  const alertId = router.params.id ?? ''
  const [alert, setAlert] = useState<AlertRow | null>(null)

  const load = useCallback(async () => {
    setAlert(await AlertService.getById(alertId))
    const alert = await AlertService.getById(alertId)
    if (alert) track('alert_shown', { level: alert.level })
  }, [alertId])

  useEffect(() => {
    if (alertId) void load()
  }, [alertId, load])

  const ack = async () => {
    if (!alert) return
    await AlertService.ack(alert.id)
    track('alert_acked', { level: alert.level })
    Taro.showToast({ title: '已确认', icon: 'success' })
    setTimeout(() => Taro.navigateBack(), 500)
  }

  const rollback = async () => {
    if (!alert?.plan_id) {
      Taro.showToast({ title: '该预警未关联计划，请手动调整', icon: 'none' })
      return
    }
    await PlanService.updateStatus(alert.plan_id, 'rollback')
    await PlanService.incrementRollbackCount(alert.plan_id)
    await AlertService.resolve(alert.id)
    track('plan_rollback', { source: 'alert' })
    Taro.showToast({ title: '已回退，观察 3 天', icon: 'success' })
    setTimeout(() => Taro.navigateBack(), 600)
  }

  const evidence = (alert?.payload as AlertEvidence | undefined)?.evidence ?? []

  return (
    <View className='alert-detail'>
      <View className={`alert-detail__head is-${alert?.level ?? 'yellow'}`}>
        <View className='alert-detail__badge'>{alert?.level === 'red' ? '红色预警' : '黄色预警'}</View>
        <Text className='alert-detail__t'>
          {alert?.rule_code === 'blood_stool' && '大便颜色异常（带血丝/血便）'}
          {alert?.rule_code?.startsWith('watery') && '大便次数明显增多'}
          {alert?.rule_code === 'rash' && '出现皮疹/湿疹加重'}
          {alert?.rule_code === 'low_milk_volume' && '奶量低于参考区间'}
          {!alert?.rule_code || alert.rule_code === 'none' ? '观察提示' : ''}
        </Text>
        <Text className='alert-detail__time'>{alert?.created_at?.slice(0, 16).replace('T', ' ')}</Text>
      </View>

      {evidence.length > 0 && (
        <View className='alert-detail__card'>
          <Text className='alert-detail__card-t'>触发依据</Text>
          {evidence.map((e, i) => (
            <Text key={i} className='alert-detail__ev'>· {e}</Text>
          ))}
        </View>
      )}

      <View className='alert-detail__card'>
        <Text className='alert-detail__card-t'>建议动作</Text>
        <Text className='alert-detail__ac-d'>
          {alert?.level === 'red'
            ? '请暂停添加新奶，尽快带宝宝就医，并向医生说明近期喂养与症状记录。'
            : '建议回退到上一稳定比例，观察 3 天后再继续。回退后计划与提醒将同步调整。'}
        </Text>
        {alert?.level === 'yellow' && (
          <Button color='primary' shape='round' block onClick={() => void rollback()}>
            一键回退
          </Button>
        )}
        <View className='alert-detail__med'>
          <Text>如伴发热、血便或精神差，请及时就医</Text>
        </View>
      </View>

      <View className='alert-detail__disclaimer'>
        <Text>本提示基于打卡数据生成，不构成医疗建议；是否调整请结合宝宝状态判断。</Text>
      </View>

      <View className='alert-detail__footer'>
        <Button color='primary' shape='round' block variant={alert?.level === 'red' ? 'contained' : 'outlined'} onClick={() => void ack()}>
          {alert?.level === 'red' ? '我已知晓，去就医' : '我知道了'}
        </Button>
      </View>
    </View>
  )
}
