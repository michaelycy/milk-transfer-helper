import { useCallback, useEffect, useState } from 'react'
import { Input, Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { Button } from '@taroify/core'
import { SymptomService } from '../../../../services/symptom.service'
import { AlertService } from '../../../../services/alert.service'
import { FeedRecordService } from '../../../../services/record.service'
import { track } from '../../../../services/analytics.service'
import { evaluateSymptoms } from '../../../../utils/rules'
import { toFeedDay } from '../../../../utils/plan'
import { formatDate } from '../../../../utils/date'
import './index.scss'

const TEXTURES = ['normal', 'soft', 'watery', 'constipated']
const TEXTURE_LABELS: Record<string, string> = { normal: '正常', soft: '稀软', watery: '稀水样', constipated: '便秘' }
const COLORS = ['golden', 'green', 'black', 'bloody']
const COLOR_LABELS: Record<string, string> = { golden: '金黄', green: '绿色', black: '黑色', bloody: '带血丝' }
const CRYING: Array<'normal' | 'fussy' | 'crying_a_lot'> = ['normal', 'fussy', 'crying_a_lot']
const CRYING_LABELS: Record<string, string> = { normal: '正常', fussy: '略烦躁', crying_a_lot: '哭闹较多' }
const SLEEP = [['normal', '正常'], ['poor', '偏差']] as const

/** 症状打卡（FR-D3 / V2-07）：按日一条、全部可跳过、30 秒完成 */
export default function Symptom() {
  const router = useRouter()
  const babyId = router.params.babyId ?? ''
  const today = formatDate(new Date())

  const [stoolCount, setStoolCount] = useState(1)
  const [texture, setTexture] = useState<string | null>(null)
  const [color, setColor] = useState<string | null>(null)
  const [flags, setFlags] = useState({ rash: false, vomit: false, bloating: false, fever: false })
  const [crying, setCrying] = useState<'normal' | 'fussy' | 'crying_a_lot'>('normal')
  const [sleep, setSleep] = useState<'normal' | 'poor'>('normal')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const log = await SymptomService.getByDate(babyId, toFeedDay(new Date()))
      if (log) {
        setStoolCount(log.stool_count)
        setTexture(log.stool_texture)
        setColor(log.stool_color)
        setFlags({ rash: log.has_rash, vomit: log.has_vomit, bloating: log.has_bloating, fever: log.has_fever })
        setCrying(log.crying_level)
        setSleep(log.sleep_quality)
        setNote(log.note ?? '')
      }
    } catch (error) {
      console.warn('[symptom] load failed', error)
    }
  }, [babyId])

  // FR-K4：AI 便便观察回传预填（颜色/性状/备注），保存与预警判定仍走本页链路（FR-E1/E2）
  useEffect(() => {
    const handler = (payload: { color?: string | null; texture?: string | null; note?: string }) => {
      if (payload.color) setColor(payload.color)
      if (payload.texture) setTexture(payload.texture)
      if (payload.note) setNote((prev) => prev || `AI 观察：${payload.note}`)
    }
    Taro.eventCenter.on('ai:poop-prefill', handler)
    return () => {
      Taro.eventCenter.off('ai:poop-prefill', handler)
    }
  }, [])

  useEffect(() => {
    if (babyId) void load()
  }, [babyId, load])

  const toggleFlag = (key: 'rash' | 'vomit' | 'bloating' | 'fever') =>
    setFlags((f) => ({ ...f, [key]: !f[key] }))

  const save = async () => {
    if (!babyId || saving) return
    setSaving(true)
    try {
      const logDate = toFeedDay(new Date())
      const log = await SymptomService.upsert({
        baby_id: babyId,
        log_date: logDate,
        stool_count: stoolCount,
        stool_texture: texture,
        stool_color: color,
        has_rash: flags.rash,
        has_vomit: flags.vomit,
        has_bloating: flags.bloating,
        has_fever: flags.fever,
        crying_level: crying,
        sleep_quality: sleep,
        note: note || null,
      })
      // FR-E1：打卡数据实时供规则引擎评估，命中即落库预警（可追溯）
      const dayRecords = await FeedRecordService.listByDateRange(babyId, logDate, logDate)
      const totalMl = dayRecords.reduce((s, r) => s + r.feed_amount, 0)
      const result = evaluateSymptoms({ log, totalMl, referenceMl: 700, baselineStoolCount: null })
      if (result.level !== 'green') {
        const alert = await AlertService.create({
          babyId,
          planId: null,
          level: result.level,
          ruleCode: result.ruleCode,
          payload: { evidence: result.evidence, skipped: result.skipped, totalMl, logDate },
        })
        track('alert_shown', { level: result.level })
        Taro.showToast({ title: result.level === 'red' ? '红色预警：建议就医' : '已生成黄色预警', icon: 'none' })
        Taro.navigateTo({ url: `/packages/alert/pages/detail/index?id=${alert.id}` })
        return
      }
      track('symptom_saved', { stool_count: stoolCount })
      Taro.showToast({ title: '打卡已保存', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 600)
    } catch (error) {
      Taro.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <View className='symptom'>
      <View className='symptom__date'>
        <Text>{today} · 今天</Text>
      </View>

      <View className='symptom__card'>
        <View className='symptom__card-h'>
          <Text className='symptom__card-t'>大便</Text>
          <Text
            className='symptom__card-link'
            onClick={() => Taro.navigateTo({ url: `/packages/ai/pages/poop/index?babyId=${babyId}` })}
          >
            拍照识别 &gt;
          </Text>
        </View>
        <View className='symptom__row'>
          <Text className='symptom__row-l'>次数</Text>
          <View className='symptom__stepper'>
            <View className='symptom__step-btn' onClick={() => setStoolCount((c) => Math.max(0, c - 1))}><Text>−</Text></View>
            <Text className='symptom__step-v'>{stoolCount} 次</Text>
            <View className='symptom__step-btn' onClick={() => setStoolCount((c) => c + 1)}><Text>＋</Text></View>
          </View>
        </View>
        <Text className='symptom__row-l'>性状</Text>
        <View className='symptom__chips'>
          {TEXTURES.map((t) => (
            <View key={t} className={`symptom__chip ${texture === t ? 'is-on' : ''}`} onClick={() => setTexture(texture === t ? null : t)}>
              <Text>{TEXTURE_LABELS[t]}</Text>
            </View>
          ))}
        </View>
        <Text className='symptom__row-l'>颜色</Text>
        <View className='symptom__chips'>
          {COLORS.map((c) => (
            <View key={c} className={`symptom__chip ${color === c ? 'is-on' : ''}`} onClick={() => setColor(color === c ? null : c)}>
              <Text>{COLOR_LABELS[c]}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className='symptom__card'>
        <Text className='symptom__card-t'>其他症状（可多选）</Text>
        <View className='symptom__chips'>
          {([['rash', '湿疹'], ['vomit', '吐奶'], ['bloating', '胀气'], ['fever', '发热']] as const).map(([k, lb]) => (
            <View key={k} className={`symptom__chip ${flags[k] ? 'is-on' : ''}`} onClick={() => toggleFlag(k)}>
              <Text>{lb}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className='symptom__card'>
        <Text className='symptom__card-t'>哭闹与睡眠</Text>
        <Text className='symptom__row-l'>哭闹程度</Text>
        <View className='symptom__chips'>
          {CRYING.map((c) => (
            <View key={c} className={`symptom__chip ${crying === c ? 'is-on' : ''}`} onClick={() => setCrying(c)}>
              <Text>{CRYING_LABELS[c]}</Text>
            </View>
          ))}
        </View>
        <Text className='symptom__row-l'>睡眠</Text>
        <View className='symptom__chips'>
          {SLEEP.map(([k, lb]) => (
            <View key={k} className={`symptom__chip ${sleep === k ? 'is-on' : ''}`} onClick={() => setSleep(k)}>
              <Text>{lb}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className='symptom__note'>
        <Input placeholder='备注（选填）' value={note} onInput={(e) => setNote(e.detail.value)} />
      </View>

      <View className='symptom__footer'>
        <Button color='primary' shape='round' block loading={saving} onClick={() => void save()}>
          保存打卡
        </Button>
        <Text className='symptom__skip' onClick={() => Taro.navigateBack()}>跳过，今天只记奶</Text>
      </View>
    </View>
  )
}
