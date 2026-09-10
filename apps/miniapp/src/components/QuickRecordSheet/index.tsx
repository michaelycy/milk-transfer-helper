import { useEffect, useMemo, useState } from 'react'
import { Input, Text, View } from '@tarojs/components'
import { Popup } from '@taroify/core'
import Taro from '@tarojs/taro'
import { FeedRecordService } from '../../services/record.service'
import { track } from '../../services/analytics.service'
import { resolvePlannedFeed } from '../../utils/plan'
import { nowInputValue, parseLocalDateTime } from '../../utils/date'
import { useBaby } from '../../store/baby'
import { buildPlanDays } from '../../utils/plan'
import type { FeedRecordRow, TransferPlanRow } from '../../types'
import './index.scss'

interface QuickRecordSheetProps {
  open: boolean
  /** 当前进行中的计划；null = 无计划（记录为计划外） */
  plan: TransferPlanRow | null
  onClose: () => void
  onSaved?: (record: FeedRecordRow) => void
  /** 跳转完整表单（FR-D2 兜底路径） */
  onOpenFullForm?: () => void
}

const DEFAULT_ML = 210
const STEP_ML = 10

/**
 * 三秒快速记奶（FR-D1/V2-06）。
 * 配方由计划自动带出并标记计划内（FR-D5）；奶量默认上次记录，±10ml 大按钮微调；
 * 喝完三态（喝完/剩部分/拒奶）；大保存按钮，夜奶单手可操作。
 */
export function QuickRecordSheet({ open, plan, onClose, onSaved, onOpenFullForm }: QuickRecordSheetProps) {
  const { currentBaby } = useBaby()
  const [amount, setAmount] = useState(DEFAULT_ML)
  const [finishState, setFinishState] = useState<'finished' | 'partial' | 'refused'>('finished')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || !currentBaby) return
    // FR-D1：奶量默认上次同顿奶量；这里简化为最近一条记录的奶量
    FeedRecordService.getLatest(currentBaby.id)
      .then((latest) => {
        if (latest) setAmount(latest.feed_amount)
      })
      .catch(() => {})
  }, [open, currentBaby])

  const planned = useMemo(() => {
    if (!open || !currentBaby) return null
    if (!plan) return { planned: false, dayIndex: null, formulaLabel: '计划外 · 手动记录' }
    return resolvePlannedFeed(plan, quickDays(plan), parseLocalDateTime(nowInputValue()))
  }, [open, currentBaby, plan])
  const formulaVisible = !!plan

  if (!open) return null

  const adjust = (delta: number) => {
    setAmount((v) => Math.max(STEP_ML, v + delta))
  }

  const handleSave = async () => {
    if (!currentBaby || submitting) return
    if (amount <= 0) {
      Taro.showToast({ title: '奶量必须大于 0', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      const feedTime = new Date().toISOString()
      const resolved = plan
        ? resolvePlannedFeed(plan, quickDays(plan), parseLocalDateTime(nowInputValue()))
        : { planned: false as const, dayIndex: null as number | null, formulaLabel: '' }
      const record = await FeedRecordService.add({
        babyId: currentBaby.id,
        brandText: plan?.to_brand_text ?? '未记录品牌',
        amountMl: amount,
        feedTime,
        note: note || undefined,
        finishState,
        planId: resolved.planned ? plan!.id : null,
        planDay: resolved.dayIndex != null ? resolved.dayIndex + 1 : null,
      })
      track('feed_recorded', { source: 'quick', dur_ms: 0 })
      Taro.showToast({ title: '已记录', icon: 'success' })
      onSaved?.(record)
      onClose()
      setNote('')
      setFinishState('finished')
    } catch (error) {
      Taro.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Popup open={open} placement='bottom' rounded onClose={onClose} lock>
      <View className='qrs'>
        <View className='qrs__header'>
          <Text className='qrs__spacer' />
          <Text className='qrs__title'>快速记奶</Text>
          <Text className='qrs__close' onClick={onClose}>✕</Text>
        </View>

        {formulaVisible && (
          <View className='qrs__formula'>
            <Text className='qrs__formula-tag'>
              {planned!.planned ? '计划内' : '计划外'} · 第{' '}
              {(planned!.dayIndex ?? 0) + 1} 顿 · {nowInputValue().slice(11)}
            </Text>
            <Text className='qrs__formula-name'>{plan!.to_brand_text}（新奶）</Text>
          </View>
        )}

        <View className='qrs__stepper'>
          <View className='qrs__step-btn' onClick={() => adjust(-STEP_ML)}>
            <Text>−</Text>
          </View>
          <View className='qrs__ml'>
            <Input
              type='number'
              value={String(amount)}
              onInput={(e) => setAmount(Number(e.detail.value) || 0)}
            />
            <Text className='qrs__ml-unit'>ml</Text>
          </View>
          <View className='qrs__step-btn' onClick={() => adjust(STEP_ML)}>
            <Text>＋</Text>
          </View>
        </View>

        <Text className='qrs__label'>喝完情况（可留空）</Text>
        <View className='qrs__states'>
          {(
            [
              ['finished', '喝完'],
              ['partial', '剩部分'],
              ['refused', '拒奶'],
            ] as const
          ).map(([value, label]) => (
            <View
              key={value}
              className={`qrs__state ${finishState === value ? 'is-on' : ''}`}
              onClick={() => setFinishState(value)}
            >
              <Text>{label}</Text>
            </View>
          ))}
        </View>

        <Input
          className='qrs__note'
          placeholder='备注（选填）'
          value={note}
          onInput={(e) => setNote(e.detail.value)}
        />

        <View
          className={`qrs__save ${submitting ? 'is-loading' : ''}`}
          onClick={() => void handleSave()}
        >
          <Text>{submitting ? '保存中...' : '保存这笔记录'}</Text>
        </View>
        {onOpenFullForm && (
          <Text className='qrs__full-link' onClick={onOpenFullForm}>
            需要更多信息？填写完整表单
          </Text>
        )}
      </View>
    </Popup>
  )
}

/** 由计划推导逐日模板（弹层轻量使用；无模板时按方法给默认节奏） */
function quickDays(plan: TransferPlanRow) {
  if (plan.method === 'mixed') {
    return buildPlanDays([
      { ratio: 0.33, label: '新奶 1/3' },
      { ratio: 0.33, label: '新奶 1/3' },
      { ratio: 0.33, label: '新奶 1/3' },
      { ratio: 0.5, label: '新奶 1/2' },
      { ratio: 0.5, label: '新奶 1/2' },
      { ratio: 0.5, label: '新奶 1/2' },
      { ratio: 1, label: '全量新奶' },
    ], plan.start_date)
  }
  return buildPlanDays(
    Array.from({ length: 14 }, (_, i) => ({
      ratio: Math.min(1, (Math.floor(i / 2) + 1) / 5),
      label: `第 ${Math.floor(i / 2) + 1} 批新奶`,
    })),
    plan.start_date,
  )
}
