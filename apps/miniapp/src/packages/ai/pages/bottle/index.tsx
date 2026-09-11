import { useState } from 'react'
import { Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Button } from '@taroify/core'
import { AiService } from '../../../../services/ai.service'
import { FeedRecordService } from '../../../../services/record.service'
import { PlanService } from '../../../../services/plan.service'
import { track } from '../../../../services/analytics.service'
import { useBaby } from '../../../../store/baby'
import { resolvePlannedFeed } from '../../../../utils/plan'
import type { TransferPlanRow } from '../../../../types'
import { isLowConfidence, usableVolumeMl, confidencePercent } from '../../../../utils/ai'
import { DEFAULT_RULES, quickDays, readFileBase64 } from '../shared'
import './index.scss'

/** 拍奶瓶快速记奶（FR-K2 / V2-K2）：识别仅预填，确认后才写入 feed_records；失败降级手填 */
export default function AiBottle() {
  const { currentBaby } = useBaby()
  const [volume, setVolume] = useState<number | null>(null)
  const [confidence, setConfidence] = useState<number | null>(null)
  const [plan, setPlan] = useState<TransferPlanRow | null>(null)
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)

  const shoot = () => {
    if (scanning) return
    if (!currentBaby) {
      Taro.showToast({ title: '请先在「我的」创建宝宝档案', icon: 'none' })
      return
    }
    Taro.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      success: (res) => {
        void recognize(res.tempFilePaths[0])
      },
    })
  }

  const recognize = async (filePath: string) => {
    setScanning(true)
    try {
      const base64 = await readFileBase64(filePath)
      const result = await AiService.analyze('bottle', base64, currentBaby!.id)
      track('ai_used', { scene: 'bottle', ok: result.ok })
      if (!result.ok || !result.analysis) {
        Taro.showToast({ title: result.message ?? '没识别清楚，请手动填写奶量', icon: 'none' })
        return
      }
      const ml = usableVolumeMl(result.analysis.volume_ml)
      if (ml < 0) {
        Taro.showToast({ title: '没识别清楚，请手动填写奶量', icon: 'none' })
        return
      }
      setVolume(ml)
      setConfidence(result.confidence ?? null)
      if (isLowConfidence(result.confidence)) {
        Taro.showToast({ title: '识别不太确定，请核对奶量', icon: 'none' })
      }
      PlanService.getActivePlan(currentBaby!.id).then(setPlan).catch(() => setPlan(null))
    } catch {
      Taro.showToast({ title: 'AI 服务不可用，请手动填写奶量', icon: 'none' })
    } finally {
      setScanning(false)
    }
  }

  const save = async () => {
    if (!currentBaby || volume == null || saving) return
    setSaving(true)
    try {
      const feedTime = new Date()
      const resolved = plan
        ? resolvePlannedFeed(plan, quickDays(plan), feedTime)
        : { planned: false as const, dayIndex: null as number | null, formulaLabel: '' }
      await FeedRecordService.add({
        babyId: currentBaby.id,
        brandText: plan?.to_brand_text ?? '未记录品牌',
        amountMl: volume,
        feedTime: feedTime.toISOString(),
        planId: resolved.planned ? plan!.id : null,
        planDay: resolved.dayIndex != null ? resolved.dayIndex + 1 : null,
      })
      track('feed_recorded', { source: 'ai_bottle', dur_ms: 0 })
      Taro.showToast({ title: '已记录', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 600)
    } catch {
      Taro.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  const manual = () => {
    Taro.showToast({ title: '请在快速记奶中手动填写', icon: 'none' })
    setTimeout(() => Taro.navigateBack(), 600)
  }

  return (
    <View className='ai-bottle'>
      <View className='ai-bottle__photo' onClick={shoot}>
        <Text className='ai-bottle__photo-icon'>📷</Text>
        <Text className='ai-bottle__photo-hint'>
          {scanning ? '识别中…' : volume == null ? '对准瓶身刻度，点击拍摄' : '重新拍摄'}
        </Text>
      </View>

      {volume != null && (
        <View className='ai-bottle__card'>
          <View className='ai-bottle__card-h'>
            <Text className='ai-bottle__card-title'>识别结果</Text>
            {confidence != null && (
              <Text className='ai-bottle__conf'>
                {isLowConfidence(confidence) ? '低置信度' : `高置信度 ${confidencePercent(confidence)}%`}
              </Text>
            )}
          </View>
          <View className='ai-bottle__result'>
            <Input
              type='number'
              value={String(volume)}
              onInput={(e) => setVolume(Number(e.detail.value) || 0)}
            />
            <Text className='ai-bottle__unit'>ml</Text>
          </View>
          <Text className='ai-bottle__note'>
            已预填表单，请核对后保存；照片仅即时分析，不做存储
          </Text>
        </View>
      )}

      <View className='ai-bottle__footer'>
        <Button
          color='primary'
          shape='round'
          block
          disabled={volume == null}
          loading={saving}
          onClick={() => void save()}
        >
          确认，记一笔
        </Button>
        <Text className='ai-bottle__manual' onClick={manual}>
          识别不对？手动填写
        </Text>
        <Text className='ai-bottle__rules'>{DEFAULT_RULES}</Text>
      </View>
    </View>
  )
}
