import { useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Button } from '@taroify/core'
import { AiService } from '../../../../services/ai.service'
import { track } from '../../../../services/analytics.service'
import { useBaby } from '../../../../store/baby'
import {
  confidencePercent,
  isLowConfidence,
  mapPoopToDraft,
} from '../../../../utils/ai'
import { readFileBase64 } from '../shared'
import './index.scss'

const COLOR_LABELS: Record<string, string> = { golden: '金黄', green: '绿色', black: '黑色', bloody: '带血丝' }
const TEXTURE_LABELS: Record<string, string> = { normal: '正常', soft: '稀软', watery: '稀水样', constipated: '便秘' }

/**
 * 便便拍照评估（FR-K4 / V2-K3）：AI 只输出结构化观察；
 * 「同步到今日打卡」回传打卡页预填，预警级别由 FR-E1 规则引擎判定（AI 不直接判级）。
 */
export default function AiPoop() {
  const { currentBaby } = useBaby()
  const [draft, setDraft] = useState<ReturnType<typeof mapPoopToDraft> | null>(null)
  const [confidence, setConfidence] = useState<number | null>(null)
  const [scanning, setScanning] = useState(false)

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
      const result = await AiService.analyze('poop', base64, currentBaby!.id)
      track('ai_used', { scene: 'poop', ok: result.ok })
      if (!result.ok || !result.analysis) {
        Taro.showToast({ title: result.message ?? '没识别清楚，请人工打卡', icon: 'none' })
        return
      }
      setDraft(mapPoopToDraft(result))
      setConfidence(result.confidence ?? null)
    } catch {
      Taro.showToast({ title: 'AI 服务不可用，请人工打卡', icon: 'none' })
    } finally {
      setScanning(false)
    }
  }

  const syncToSymptom = () => {
    if (!draft || !currentBaby) return
    // 预填字段经事件回传打卡页；保存与预警判定都走打卡页既有链路（FR-D3/E1/E2）
    Taro.eventCenter.trigger('ai:poop-prefill', {
      color: draft.color,
      texture: draft.texture,
      note: draft.note,
    })
    Taro.navigateTo({ url: `/packages/record/pages/symptom/index?babyId=${currentBaby.id}` })
  }

  return (
    <View className='ai-poop'>
      <View className='ai-poop__photo' onClick={shoot}>
        <Text className='ai-poop__photo-icon'>📷</Text>
        <Text className='ai-poop__photo-hint'>
          {scanning ? '识别中…' : draft ? '重新拍摄' : '拍摄后仅输出结构化观察，不做诊断'}
        </Text>
      </View>

      {draft && (
        <View className='ai-poop__card'>
          <View className='ai-poop__card-h'>
            <Text className='ai-poop__card-title'>✦ AI 观察</Text>
            {confidence != null && (
              <Text className='ai-poop__conf'>
                {isLowConfidence(confidence) ? '低置信度' : `置信度 ${confidencePercent(confidence)}%`}
              </Text>
            )}
          </View>
          <View className='ai-poop__row'>
            <Text className='ai-poop__label'>颜色</Text>
            <Text className='ai-poop__value'>
              {draft.color ? COLOR_LABELS[draft.color] : '未能识别，请人工选择'}
            </Text>
          </View>
          <View className='ai-poop__row'>
            <Text className='ai-poop__label'>性状</Text>
            <Text className='ai-poop__value'>
              {draft.texture ? TEXTURE_LABELS[draft.texture] : '未能识别，请人工选择'}
            </Text>
          </View>
          <View className='ai-poop__row'>
            <Text className='ai-poop__label'>疑似异常</Text>
            <Text className={`ai-poop__value ${draft.abnormal_suspect ? 'is-warn' : 'is-ok'}`}>
              {draft.abnormal_suspect ? '建议留意' : '未发现'}
            </Text>
          </View>
          {draft.note && <Text className='ai-poop__note'>{draft.note}</Text>}
          {draft.lowConfidence && (
            <Text className='ai-poop__warn'>识别不确定，请以人工打卡为准</Text>
          )}
        </View>
      )}

      <View className='ai-poop__warnbar'>
        <Text>AI 观察仅供参考，不构成医学判断；异常或持续异常请及时就医</Text>
      </View>

      <View className='ai-poop__footer'>
        <Button
          color='primary'
          shape='round'
          block
          disabled={!draft}
          onClick={syncToSymptom}
        >
          同步到今日打卡
        </Button>
      </View>
    </View>
  )
}
