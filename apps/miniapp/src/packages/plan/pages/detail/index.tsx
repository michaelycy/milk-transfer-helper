import { useCallback, useEffect, useMemo, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { FeedRecordService } from '../../../../services/record.service'
import { PlanService } from '../../../../services/plan.service'
import { track } from '../../../../services/analytics.service'
import { buildPlanDays, getCurrentPlanDay, isTerminalStatus } from '../../../../utils/plan'
import { toastError } from '../../../../utils/error'
import type { FeedRecordRow, PlanDaySpec, TransferPlanRow } from '../../../../types'
import './index.scss'

const DEFAULT_MIXED: PlanDaySpec[] = [
  { ratio: 0.33, label: '新奶 1/3' },
  { ratio: 0.33, label: '新奶 1/3' },
  { ratio: 0.33, label: '新奶 1/3' },
  { ratio: 0.5, label: '新奶 1/2' },
  { ratio: 0.5, label: '新奶 1/2' },
  { ratio: 0.5, label: '新奶 1/2' },
  { ratio: 1, label: '全量新奶' },
]

/** 计划详情时间轴（V2-05，FR-C4/C5/C7/I1） */
export default function PlanDetail() {
  const router = useRouter()
  const planId = router.params.id ?? ''
  const [plan, setPlan] = useState<TransferPlanRow | null>(null)
  const [records, setRecords] = useState<FeedRecordRow[]>([])

  const load = useCallback(async () => {
    const plan = await PlanService.getById(planId)
    if (!plan) {
      toastError(new Error('计划不存在'))
      return
    }
    setPlan(plan)
    const end = new Date(`${plan.start_date}T00:00:00`)
    end.setDate(end.getDate() + 30)
    setRecords(await FeedRecordService.listByDateRange(plan.baby_id, plan.start_date, formatDateSafe(end)))
  }, [planId])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId])

  const days = useMemo(
    () =>
      buildPlanDays(
        DEFAULT_MIXED,
        plan?.start_date ?? new Date().toISOString().slice(0, 10),
      ),
    [plan],
  )
  const currentDay = getCurrentPlanDay(days)
  const onPlanCountByDay = useMemo(() => {
    const map = new Map<number, number>()
    for (const r of records) {
      if (r.plan_day != null) map.set(r.plan_day, (map.get(r.plan_day) ?? 0) + 1)
    }
    return map
  }, [records])

  const doAction = async (status: TransferPlanRow['status'], rollback = false) => {
    if (!plan) return
    try {
      await PlanService.updateStatus(plan.id, status)
      if (rollback) await PlanService.incrementRollbackCount(plan.id)
      if (status === 'completed') track('plan_completed', { days: days.length })
      if (status === 'rollback') track('plan_rollback', {})
      if (status === 'paused') track('plan_paused', {})
      Taro.showToast({ title: '已更新', icon: 'success' })
      void load()
    } catch (error) {
      toastError(error, '操作失败')
    }
  }

  const confirmComplete = () => {
    void Taro.showModal({
      title: '标记完成',
      content: '确认本次转奶已完成？完成后可在复盘页查看报告并复制为新计划。',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm) void doAction('completed')
      },
    })
  }

  const copyAsNew = () => {
    if (!plan) return
    Taro.setStorageSync('plan:copy', { ...plan, start_date: null })
    Taro.navigateTo({ url: `/packages/plan/pages/wizard/index?babyId=${plan.baby_id}` })
  }

  return (
    <View className='plan-detail'>
      <View className='plan-detail__status'>
        <View className='plan-detail__status-row'>
          <Text className='plan-detail__badge'>{statusLabel(plan?.status)}</Text>
          <Text className='plan-detail__day'>
            {currentDay > 0 && currentDay <= days.length ? `第 ${currentDay} 天 / ` : ''}
            共 {days.length} 天
          </Text>
        </View>
        <View className='plan-detail__progress'>
          <View
            className='plan-detail__progress-fill'
            style={{ width: `${days.length ? Math.min(100, (Math.max(0, currentDay) / days.length) * 100) : 0}%` }}
          />
        </View>
        <Text className='plan-detail__range'>
          {plan?.start_date} 开始 → {lastDay(plan?.start_date, days.length)} 结束 ·{' '}
          {plan?.method === 'interval' ? '隔顿法' : '混合法'}
        </Text>
      </View>

      {plan && !isTerminalStatus(plan.status) && (
        <View className='plan-detail__actions'>
          <View
            className='plan-detail__action'
            onClick={() => void doAction(plan.status === 'paused' ? 'active' : 'paused')}
          >
            <Text>{plan.status === 'paused' ? '恢复计划' : '暂停计划'}</Text>
          </View>
          <View
            className='plan-detail__action plan-detail__action--warn'
            onClick={() => void doAction('rollback', true)}
          >
            <Text>一键回退</Text>
          </View>
          <View className='plan-detail__action plan-detail__action--done' onClick={confirmComplete}>
            <Text>标记完成</Text>
          </View>
        </View>
      )}

      <View className='plan-detail__timeline'>
        <Text className='plan-detail__tl-title'>转奶时间轴</Text>
        {days.map((day) => {
          const state = dayState(day)
          const count = onPlanCountByDay.get(day.dayIndex + 1) ?? 0
          return (
            <View key={day.dayIndex} className='plan-detail__tl-row'>
              <View className='plan-detail__tl-rail'>
                <View className={`plan-detail__tl-dot is-${state}`} />
                {day.dayIndex < days.length - 1 && <View className='plan-detail__tl-line' />}
              </View>
              <View className='plan-detail__tl-body'>
                <Text className={`plan-detail__tl-day is-${state}`}>
                  D{day.dayIndex + 1} · {day.date.slice(5)} {state === 'today' ? '· 今天' : ''}
                </Text>
                <Text className='plan-detail__tl-label'>
                  {day.label} · 实际打卡 {count} 顿
                </Text>
              </View>
              {state === 'done' && <Text className='plan-detail__tl-check'>✓</Text>}
            </View>
          )
        })}
      </View>

      {plan && isTerminalStatus(plan.status) && (
        <View className='plan-detail__copy' onClick={copyAsNew}>
          <Text>复制为新计划</Text>
        </View>
      )}
    </View>
  )
}

function statusLabel(status: TransferPlanRow['status'] | undefined): string {
  return (
    {
      active: '进行中',
      paused: '已暂停',
      rollback: '回退观察中',
      completed: '已完成',
      terminated: '已终止',
    }[status ?? 'active'] ?? '进行中'
  )
}

function dayState(day: { date: string }): 'done' | 'today' | 'future' {
  const today = formatDateSafe(new Date())
  if (day.date < today) return 'done'
  if (day.date === today) return 'today'
  return 'future'
}

function lastDay(startDate: string | undefined, dayCount: number): string {
  if (!startDate) return '-'
  const d = new Date(`${startDate}T00:00:00`)
  d.setDate(d.getDate() + Math.max(0, dayCount - 1))
  return d.toISOString().slice(0, 10)
}

function formatDateSafe(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
