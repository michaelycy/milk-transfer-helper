import { useCallback, useMemo, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { selectTabbar } from '../../utils/tabbar'
import { FeedRecordService } from '../../services/record.service'
import { PlanService } from '../../services/plan.service'
import { AlertService } from '../../services/alert.service'
import { useBaby } from '../../store/baby'
import { buildPlanDays, getCurrentPlanDay } from '../../utils/plan'
import { getStageTip } from '../../utils/baby'
import { QuickRecordSheet } from '../../components/QuickRecordSheet'
import { LoginGate } from '../../components/LoginGate'
import { RecommendedArticles } from '../../components/recommended-articles'
import { useAuth } from '../../store/auth'
import type { AlertRow, FeedRecordRow, TransferPlanRow } from '../../types'
import './index.scss'

/** 首页（V2-01 计划进行中 / V2-02 无计划空状态 / V2-16 游客未建档：引导 + 推荐文章） */
export default function Index() {
  const { authed } = useAuth()
  const { currentBaby, babies, loading: babyLoading } = useBaby()
  const [plan, setPlan] = useState<TransferPlanRow | null>(null)
  const [planDays, setPlanDays] = useState<ReturnType<typeof buildPlanDays>>([])
  const [latestRecord, setLatestRecord] = useState<FeedRecordRow | null>(null)
  const [unresolvedAlerts, setUnresolvedAlerts] = useState<AlertRow[]>([])
  const [quickOpen, setQuickOpen] = useState(false)

  const load = useCallback(async () => {
    if (!authed) return
    if (!currentBaby) {
      setPlan(null)
      setLatestRecord(null)
      setUnresolvedAlerts([])
      return
    }
    try {
      const activePlan = await PlanService.getActivePlan(currentBaby.id)
      setPlan(activePlan)
      setPlanDays(
        activePlan
          ? buildPlanDays(
              await getTemplateDays(activePlan.template_id, activePlan.method),
              activePlan.start_date,
            )
          : [],
      )
      const [latest, alerts] = await Promise.all([
        FeedRecordService.getLatest(currentBaby.id),
        AlertService.listUnresolved(currentBaby.id),
      ])
      setLatestRecord(latest)
      setUnresolvedAlerts(alerts)
    } catch (error) {
      Taro.showToast({ title: '数据加载失败，下拉重试', icon: 'none' })
    }
  }, [currentBaby, authed])

  useDidShow(() => {
    selectTabbar(0)
    void load()
  })

  const stageTip = useMemo(
    () => (currentBaby && !plan ? getStageTip(currentBaby.birth_date) : null),
    [currentBaby, plan],
  )

  const dayIndex = useMemo(() => getCurrentPlanDay(planDays), [planDays])
  const todaySpec = dayIndex > 0 ? planDays[dayIndex - 1] : null
  const worstAlert = pickWorstAlert(unresolvedAlerts)

  const openWizard = () => {
    Taro.navigateTo({ url: `/packages/plan/pages/wizard/index?babyId=${currentBaby?.id ?? ''}` })
  }

  const handleQuickSaved = () => {
    void load()
  }

  const goSymptom = () => {
    if (!currentBaby) return
    Taro.navigateTo({ url: `/packages/record/pages/symptom/index?babyId=${currentBaby.id}` })
  }

  const goAlert = (alert: AlertRow) => {
    Taro.navigateTo({ url: `/packages/alert/pages/detail/index?id=${alert.id}` })
  }

  // 建档引导（FR-A1 验收：未创建档案时引导至建档页）；V2-16 游客态保留推荐文章模块
  if (!babyLoading && !currentBaby) {
    return (
      <LoginGate>
      <View className='home home--empty'>
        <View className='home__guide'>
          <View className='home__guide-icon'>
            <Text>🍼</Text>
          </View>
          <Text className='home__guide-title'>先给宝宝建个档案</Text>
          <Text className='home__guide-desc'>建档后即可记录喂养、打卡并创建转奶计划</Text>
          <View
            className='home__guide-btn'
            onClick={() => Taro.navigateTo({ url: '/packages/baby/pages/create/index' })}
          >
            <Text>创建宝宝档案</Text>
          </View>
        </View>
        <RecommendedArticles />
      </View>
      </LoginGate>
    )
  }

  return (
    <LoginGate>
    <View className='home'>
      {/* 宝宝栏（FR-A2 多宝宝切换） */}
      <View className='home__babybar'>
        <View
          className='home__baby'
          onClick={() => {
            if (babies.length > 1) {
              const idx = babies.findIndex((b) => b.id === currentBaby?.id)
              const next = babies[(idx + 1) % babies.length]
              Taro.setStorageSync('baby:current-id', next.id)
              void load()
            } else {
              Taro.navigateTo({ url: '/packages/baby/pages/create/index' })
            }
          }}
        >
          <Text className='home__baby-name'>{currentBaby?.nickname ?? '宝宝'}</Text>
          <Text className='home__baby-chev'>▾</Text>
        </View>
        <View onClick={goSymptom}>
          <Text className='home__symptom-link'>症状打卡</Text>
        </View>
      </View>

      <View className='home__content'>
        {stageTip && (
          <View className='home__tip' onClick={openWizard}>
            <Text className='home__tip-text'>{stageTip.text}</Text>
            <Text className='home__tip-more'>去规划 ›</Text>
          </View>
        )}

        {plan ? (
          <>
            {/* 今日任务卡（FR-C3） */}
            <View className='home__task'>
              <View className='home__task-tag'>
                <Text>转奶计划 · 第 {Math.max(1, dayIndex)} 天 / 共 {planDays.length || '-'} 天</Text>
              </View>
              <Text className='home__task-title'>
                {plan.status === 'paused' ? '计划已暂停' : `今日新奶占比 ${Math.round((todaySpec?.ratio ?? 0) * 100)}%`}
              </Text>
              <Text className='home__task-sub'>
                {plan.status === 'paused'
                  ? '暂停期间维持当前配方，可随时恢复'
                  : `今日配方：${todaySpec?.label ?? '按计划执行'} · 距离结束还有 ${Math.max(0, planDays.length - Math.max(1, dayIndex))} 天`}
              </Text>
              <View className='home__task-progress'>
                <View
                  className='home__task-progress-fill'
                  style={{ width: `${planDays.length ? Math.min(100, (Math.max(1, dayIndex) / planDays.length) * 100) : 0}%` }}
                />
              </View>
              <View className='home__task-row'>
                <Text className='home__task-count'>
                  {plan.status === 'rollback' ? '回退观察中 · 按当前比例执行' : '完成今日打卡后任务卡自动标记'}
                </Text>
                <View
                  className='home__task-remind'
                  onClick={() => Taro.showToast({ title: '已设置当日提醒', icon: 'none' })}
                >
                  <Text>🔔 提醒我</Text>
                </View>
              </View>
            </View>

            {/* 适应度小结（FR-E3） */}
            <View className='home__fitness'>
              <View
                className={`home__fitness-dot ${worstAlert ? `is-${worstAlert.level}` : 'is-green'}`}
              />
              <Text className='home__fitness-label'>
                {worstAlert ? (worstAlert.level === 'red' ? '红色预警' : '黄色预警') : '适应度 良好'}
              </Text>
              <Text className='home__fitness-desc'>
                {worstAlert ? '点击查看触发依据与建议动作' : '继续记录，保持观察'}
              </Text>
            </View>

            {worstAlert && (
              <View className='home__alert' onClick={() => goAlert(worstAlert)}>
                <Text className='home__alert-text'>
                  [{worstAlert.level === 'red' ? '红色' : '黄色'}预警] 点击查看建议动作
                </Text>
              </View>
            )}

            {/* 快速记奶大按钮（FR-D1） */}
            <View className='home__quick' onClick={() => setQuickOpen(true)}>
              <Text className='home__quick-plus'>＋</Text>
              <Text>记一笔 · 3 秒完成</Text>
            </View>
          </>
        ) : (
          /* 无计划空状态（V2-02） */
          <View className='home__empty'>
            <View className='home__empty-icon'>
              <Text>🍼</Text>
            </View>
            <Text className='home__empty-title'>还没有进行中的转奶计划</Text>
            <Text className='home__empty-desc'>制定逐日计划，跟着走、不慌张</Text>
            <View className='home__empty-btn' onClick={openWizard}>
              <Text>发起新计划</Text>
            </View>
            <Text
              className='home__empty-link'
              onClick={() => Taro.switchTab({ url: '/pages/articles/index' })}
            >
              先看看转奶指南
            </Text>
          </View>
        )}

        {latestRecord && (
          <View className='home__recent'>
            <Text className='home__recent-label'>最近一条记录</Text>
            <View className='home__recent-cell'>
              <Text className='home__recent-brand'>{latestRecord.brand_text ?? latestRecord.milk_brand}</Text>
              <Text className='home__recent-amount'>{latestRecord.feed_amount} ml</Text>
            </View>
          </View>
        )}
      </View>

      <QuickRecordSheet
        open={quickOpen}
        plan={plan}
        onClose={() => setQuickOpen(false)}
        onSaved={handleQuickSaved}
      />
    </View>
    </LoginGate>
  )
}

function pickWorstAlert(alerts: AlertRow[]): AlertRow | null {
  return alerts.find((a) => a.level === 'red') ?? alerts.find((a) => a.level === 'yellow') ?? null
}

/** 由计划推导逐日模板（与快速记奶弹层共用逻辑） */
async function getTemplateDays(
  templateId: string | null,
  method: TransferPlanRow['method'],
): Promise<PlanDaySpecAlias[]> {
  try {
    const templates = await PlanService.listTemplates()
    const matched = templates.find((t) => t.id === templateId)
    if (matched) return matched.days as unknown as PlanDaySpecAlias[]
  } catch {
    // 模板拉取失败时回退到方法默认节奏（C2 版本锁定的兜底）
  }
  return defaultDays(method)
}

type PlanDaySpecAlias = { ratio: number; label: string }

function defaultDays(method: TransferPlanRow['method']): PlanDaySpecAlias[] {
  if (method === 'mixed') {
    return [
      { ratio: 0.33, label: '新奶 1/3' },
      { ratio: 0.33, label: '新奶 1/3' },
      { ratio: 0.33, label: '新奶 1/3' },
      { ratio: 0.5, label: '新奶 1/2' },
      { ratio: 0.5, label: '新奶 1/2' },
      { ratio: 0.5, label: '新奶 1/2' },
      { ratio: 1, label: '全量新奶' },
    ]
  }
  return Array.from({ length: 14 }, (_, i) => ({
    ratio: Math.min(1, (Math.floor(i / 2) + 1) / 5),
    label: `第 ${Math.floor(i / 2) + 1} 批新奶`,
  }))
}
