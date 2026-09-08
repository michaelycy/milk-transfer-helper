import { useCallback, useEffect, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { Button } from '@taroify/core'
import { PlanService } from '../../../../services/plan.service'
import { FeedRecordService } from '../../../../services/record.service'
import { AlertService } from '../../../../services/alert.service'
import { BabyService } from '../../../../services/baby.service'
import { track } from '../../../../services/analytics.service'
import { buildReviewReport } from '../../../../utils/review'
import type { ReviewReport } from '../../../../utils/review'
import './index.scss'

/** 计划复盘报告（FR-F2 / V2-09）：可作就医沟通材料；分享卡脱敏（L4） */
export default function Review() {
  const router = useRouter()
  const planId = router.params.id ?? ''
  const [report, setReport] = useState<ReviewReport | null>(null)

  const load = useCallback(async () => {
    const plan = await PlanService.getById(planId)
    if (!plan) {
      Taro.showToast({ title: '计划不存在', icon: 'none' })
      return
    }
    const end = new Date(`${plan.start_date}T00:00:00`)
    end.setDate(end.getDate() + 30)
    const endDate = end.toISOString().slice(0, 10)
    const [records, alerts, weights] = await Promise.all([
      FeedRecordService.listByDateRange(plan.baby_id, plan.start_date, endDate),
      AlertService.listUnresolved(plan.baby_id),
      BabyService.listWeights(plan.baby_id),
    ])
    const report = buildReviewReport({
      plan: {
        status: plan.status,
        rollback_count: plan.rollback_count,
        start_date: plan.start_date,
        method: plan.method,
        terminate_reason: plan.terminate_reason,
        plannedDays: 7,
      },
      records: records.filter((r) => r.plan_id === plan.id),
      alerts: alerts.filter((a) => a.plan_id === plan.id),
      weightsKg: weights.map((w) => w.weight_g / 1000),
    })
    setReport(report)
  }, [planId])

  useEffect(() => {
    if (planId) void load()
  }, [planId, load])

  const share = () => {
    track('share_card_created', { plan_id: planId })
    Taro.showToast({ title: '分享卡已生成（脱敏）', icon: 'none' })
  }

  const kpis = report
    ? [
        [`${report.actualDays} 天`, '实际天数'],
        [`${Math.round(report.onPlanRate * 100)}%`, '按计划顿次'],
        [`${report.yellowAlerts} 次`, '黄色预警'],
        [`${report.rollbackCount} 次`, '回退'],
      ]
    : []

  return (
    <View className='review'>
      <View className='review__hero'>
        <View className='review__trophy'>
          <Text>🏆</Text>
        </View>
        <Text className='review__t'>转奶完成</Text>
        <Text className='review__s'>实际执行 {report?.actualDays ?? '-'} 天 · 全量新奶达成</Text>
      </View>

      {report && (
        <View className='review__kpis'>
          {kpis.map(([n, l]) => (
            <View key={l} className='review__kpi'>
              <Text className='review__kpi-n'>{n}</Text>
              <Text className='review__kpi-l'>{l}</Text>
            </View>
          ))}
        </View>
      )}

      {report && report.dailyTotals.length > 0 && (
        <View className='review__chart'>
          <Text className='review__ch-t'>每日总奶量（ml）</Text>
          <View className='review__bars'>
            {report.dailyTotals.slice(0, 7).map((d) => (
              <View key={d.label} className='review__bar-col'>
                <Text className='review__bar-v'>{d.total}</Text>
                <View className='review__bar' style={{ height: `${Math.min(110, d.total * 0.4)}px` }} />
                <Text className='review__bar-l'>{d.label.slice(5)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {report?.weightChangeKg != null && (
        <View className='review__weight'>
          <Text>体重变化：{report.weightChangeKg > 0 ? '+' : ''}{report.weightChangeKg} kg</Text>
          <Text className='review__wt-hint'>转奶期间建议每周记录一次</Text>
        </View>
      )}

      <View className='review__entries'>
        <View className='review__entry'>
          <Text>📄 导出图片（复诊沟通材料）</Text>
          <Text className='review__entry-chev'>›</Text>
        </View>
        <View className='review__entry' onClick={share}>
          <Text>🖼 生成脱敏分享卡</Text>
          <Text className='review__entry-chev'>›</Text>
        </View>
      </View>

      <View className='review__footer'>
        <Button color='primary' shape='round' block onClick={share}>
          生成分享卡
        </Button>
        <Text className='review__foot-note'>分享卡不含宝宝姓名与照片 · 携带归因参数</Text>
      </View>
    </View>
  )
}
