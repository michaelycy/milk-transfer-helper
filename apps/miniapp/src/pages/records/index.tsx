import { useCallback, useRef, useState } from 'react'
import { Input, Picker, Text, Textarea, View } from '@tarojs/components'
import Taro, { useDidShow, useReachBottom } from '@tarojs/taro'
import { Button, Cell, Empty, Field, FloatingBubble, Popup, Tabs } from '@taroify/core'
import type { EChartsOption } from 'echarts'
import { Chart } from '../../components/Chart'
import { QuickRecordSheet } from '../../components/QuickRecordSheet'
import { FeedRecordService } from '../../services/record.service'
import { PlanService } from '../../services/plan.service'
import { track } from '../../services/analytics.service'
import { useBaby } from '../../store/baby'
import { useAuth } from '../../store/auth'
import { LoginGate } from '../../components/LoginGate'
import { buildDailyTrend } from '../../utils/chart'
import { buildPlanDays, resolvePlannedFeed } from '../../utils/plan'
import { formatDateTime, nowInputValue, parseLocalDateTime } from '../../utils/date'
import { toast, toastError } from '../../utils/error'
import type { TransferPlanRow, FeedRecordRow } from '../../types'
import './index.scss'

const PAGE_SIZE = 20

const createEmptyForm = () => ({
  milk_brand: '',
  feed_amount: '',
  feed_time: nowInputValue(),
  note: '',
})

/** 转奶记录页（V2 列表/图表 + 快速记奶 + 完整表单） */
export default function Records() {
  const { authed } = useAuth()
  const { currentBaby } = useBaby()
  const [currentView, setCurrentView] = useState(0) // 0: 列表 1: 图表
  const [records, setRecords] = useState<FeedRecordRow[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isAddOpen, setIsAddOpen] = useState(false) // 完整表单（FR-D2 兜底）
  const [isQuickOpen, setIsQuickOpen] = useState(false) // 快速记奶（FR-D1 主路径）
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState(createEmptyForm)
  const [plan, setPlan] = useState<TransferPlanRow | null>(null)

  const loadingRef = useRef(false)
  const pageRef = useRef(0)
  const hasMoreRef = useRef(false)

  const loadRecords = useCallback(
    async (nextPage: number, mode: 'replace' | 'append') => {
      if (!authed || !currentBaby || loadingRef.current) return
      loadingRef.current = true
      setLoading(true)
      try {
        const { data, total } = await FeedRecordService.getFeeds({
          babyId: currentBaby.id,
          page: nextPage,
          pageSize: PAGE_SIZE,
        })
        setRecords((prev) => (mode === 'replace' ? data : [...prev, ...data]))
        pageRef.current = nextPage
        hasMoreRef.current = (nextPage + 1) * PAGE_SIZE < total
        setHasMore(hasMoreRef.current)
      } catch (error) {
        toastError(error, '获取记录失败')
      } finally {
        loadingRef.current = false
        setLoading(false)
      }
    },
    [currentBaby],
  )

  const loadPlan = useCallback(async () => {
    if (!authed || !currentBaby) {
      setPlan(null)
      return
    }
    try {
      setPlan(await PlanService.getActivePlan(currentBaby.id))
    } catch {
      setPlan(null)
    }
  }, [currentBaby])

  // 页面首次显示与每次切回 tab 都刷新，直接取最新会话，避免闭包旧值
  useDidShow(() => {
    void loadRecords(0, 'replace')
    void loadPlan()
  })

  useReachBottom(() => {
    if (hasMoreRef.current && !loadingRef.current) {
      void loadRecords(pageRef.current + 1, 'append')
    }
  })

  const handleRecordPress = async (record: FeedRecordRow) => {
    try {
      const { tapIndex } = await Taro.showActionSheet({ itemList: ['删除该记录'] })
      if (tapIndex !== 0) return
      const { confirm } = await Taro.showModal({
        title: '删除记录',
        content: `确定删除「${record.milk_brand} ${record.feed_amount}ml」这条记录吗？`,
        confirmColor: '#FF6B35',
      })
      if (!confirm) return
      await FeedRecordService.remove(record.id)
      toast('已删除', 'success')
      await loadRecords(0, 'replace')
    } catch (error) {
      // 用户取消 ActionSheet 也会 reject，按取消处理
      const message = (error as { errMsg?: string })?.errMsg ?? ''
      if (message.includes('cancel')) return
      toastError(error, '删除失败')
    }
  }

  const handleAddSubmit = async () => {
    if (!currentBaby) return
    const brand = formData.milk_brand.trim()
    if (!brand || !formData.feed_amount) {
      toast('请填写品牌和喂养量')
      return
    }
    const amount = Number(formData.feed_amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast('喂养量必须为正数')
      return
    }
    const feedDate = parseLocalDateTime(formData.feed_time)
    if (Number.isNaN(feedDate.getTime())) {
      toast('喂养时间格式不正确')
      return
    }

    setSubmitting(true)
    try {
      // FR-D5 计划联动：按喂养时间判定计划内/外
      const days = plan ? buildQuickDays(plan) : []
      const resolved = resolvePlannedFeed(plan, days, feedDate)
      await FeedRecordService.add({
        babyId: currentBaby!.id,
        brandText: brand,
        amountMl: Math.round(amount),
        feedTime: feedDate.toISOString(),
        note: formData.note.trim() || undefined,
        planId: resolved.planned && plan ? plan.id : null,
        planDay: resolved.dayIndex != null ? resolved.dayIndex + 1 : null,
      })
      setIsAddOpen(false)
      setFormData(createEmptyForm())
      toast('添加成功', 'success')
      track('feed_recorded', { source: 'full_form' })
      await loadRecords(0, 'replace')
    } catch (error) {
      toastError(error, '添加失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 图表：按日聚合的喂养量趋势
  const trend = buildDailyTrend(records)
  const chartOption: EChartsOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 20, top: 30, bottom: 30 },
    xAxis: { type: 'category' as const, data: trend.map((point) => point.date.slice(5)) },
    yAxis: { type: 'value' },
    series: [
      {
        name: '每日喂养总量(ml)',
        type: 'line' as const,
        smooth: true,
        data: trend.map((point) => point.total),
      },
    ],
  }

  const datePart = formData.feed_time.split(' ')[0]
  const timePart = formData.feed_time.split(' ')[1]

  return (
    <LoginGate>
    <View className='records-page'>
      <Tabs value={currentView} onChange={(value) => setCurrentView(Number(value))}>
        <Tabs.TabPane title='列表模式'>
          {!currentBaby ? (
            <Empty>
              <Empty.Description>请先创建宝宝档案</Empty.Description>
            </Empty>
          ) : records.length === 0 ? (
            <Empty>
              <Empty.Description>暂无记录，点击右下角添加</Empty.Description>
            </Empty>
          ) : (
            <Cell.Group>
              {records.map((record) => (
                <Cell
                  key={record.id}
                  title={record.milk_brand}
                  brief={formatDateTime(record.feed_time)}
                  extra={`${record.feed_amount} ml`}
                  isLink
                  clickable
                  onClick={() => void handleRecordPress(record)}
                />
              ))}
            </Cell.Group>
          )}
          {records.length > 0 && (
            <View className='load-more'>
              {loading ? '加载中…' : hasMore ? '上拉加载更多' : '没有更多了'}
            </View>
          )}
        </Tabs.TabPane>

        <Tabs.TabPane title='图表模式'>
          <View className='chart-view'>
            {records.length === 0 ? (
              <Empty>
                <Empty.Description>暂无数据</Empty.Description>
              </Empty>
            ) : (
              <Chart option={chartOption} style={{ height: '300px', width: '100%' }} />
            )}
          </View>
        </Tabs.TabPane>
      </Tabs>

      <FloatingBubble axis='lock' icon={<Text className='fab-plus'>+</Text>} onClick={() => setIsQuickOpen(true)} />

      {/* FR-D1 主路径：快速记奶（配方由计划带出） */}
      <QuickRecordSheet
        open={isQuickOpen}
        plan={plan}
        onClose={() => setIsQuickOpen(false)}
        onSaved={() => {
          void loadRecords(0, 'replace')
        }}
        onOpenFullForm={() => {
          setIsQuickOpen(false)
          setIsAddOpen(true)
        }}
      />

      {/* FR-D2 兜底：完整表单 */}
      <Popup open={isAddOpen} placement='bottom' rounded onClose={() => setIsAddOpen(false)} lock>
        <View className='form-container'>
          <View className='form-popup__header'>
            <Text className='form-popup__title'>添加转奶记录</Text>
          </View>
          <Field label='奶粉品牌'>
            <Input
              placeholder='请输入品牌'
              value={formData.milk_brand}
              onInput={(e) => setFormData({ ...formData, milk_brand: e.detail.value })}
            />
          </Field>
          <Field label='喂养量(ml)'>
            <Input
              type='number'
              placeholder='请输入数值'
              value={formData.feed_amount}
              onInput={(e) => setFormData({ ...formData, feed_amount: e.detail.value })}
            />
          </Field>
          <Picker
            mode='date'
            value={datePart}
            onChange={(e) => setFormData({ ...formData, feed_time: `${e.detail.value} ${timePart ?? '00:00'}` })}
          >
            <Field label='喂养日期'>
              <Input value={datePart} disabled />
            </Field>
          </Picker>
          <Picker
            mode='time'
            value={timePart}
            onChange={(e) => setFormData({ ...formData, feed_time: `${datePart} ${e.detail.value}` })}
          >
            <Field label='喂养时间'>
              <Input value={timePart} disabled />
            </Field>
          </Picker>
          <Field label='备注'>
            <Textarea
              placeholder='选填'
              value={formData.note}
              onInput={(e) => setFormData({ ...formData, note: e.detail.value })}
            />
          </Field>
          <View className='submit-btn'>
            <Button
              block
              shape='round'
              color='primary'
              loading={submitting}
              onClick={() => void handleAddSubmit()}
            >
              提交
            </Button>
          </View>
        </View>
      </Popup>
    </View>
    </LoginGate>
  )
}

/** 计划逐日节奏的轻量推导（与快速记奶弹层同口径） */
function buildQuickDays(plan: TransferPlanRow) {
  const specs =
    plan.method === 'mixed'
      ? [
          { ratio: 0.33, label: '新奶 1/3' },
          { ratio: 0.33, label: '新奶 1/3' },
          { ratio: 0.33, label: '新奶 1/3' },
          { ratio: 0.5, label: '新奶 1/2' },
          { ratio: 0.5, label: '新奶 1/2' },
          { ratio: 0.5, label: '新奶 1/2' },
          { ratio: 1, label: '全量新奶' },
        ]
      : Array.from({ length: 14 }, (_, i) => ({
          ratio: Math.min(1, (Math.floor(i / 2) + 1) / 5),
          label: `第 ${Math.floor(i / 2) + 1} 批新奶`,
        }))
  return buildPlanDays(specs, plan.start_date)
}
