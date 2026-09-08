import { useCallback, useEffect, useMemo, useState } from 'react'
import { Input, Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { Button, Checkbox } from '@taroify/core'
import { MilkService } from '../../../../services/milk.service'
import { PlanService } from '../../../../services/plan.service'
import { track } from '../../../../services/analytics.service'
import { useBaby } from '../../../../store/baby'
import { formatDate, nowInputValue } from '../../../../utils/date'
import type { MilkProductRow, PlanMethod, PlanReason, PlanTemplateRow } from '../../../../types'
import './index.scss'

const REASONS: Array<{ key: PlanReason; label: string }> = [
  { key: 'stage', label: '换段位' },
  { key: 'brand', label: '换品牌' },
  { key: 'medical', label: '遵医嘱转回' },
  { key: 'other', label: '其他' },
]

/** 计划创建向导（FR-C1，四步；画板 V2-03/V2-04） */
export default function PlanWizard() {
  const router = useRouter()
  const { currentBaby } = useBaby()
  const [step, setStep] = useState(1)
  const [fromMilk, setFromMilk] = useState('')
  const [toMilk, setToMilk] = useState('')
  const [reason, setReason] = useState<PlanReason>('stage')
  const [methodOverride, setMethodOverride] = useState<PlanMethod | null>(null)
  const [safetyConfirmed, setSafetyConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [templates, setTemplates] = useState<PlanTemplateRow[]>([])

  const babyId = router.params.babyId ?? ''

  useEffect(() => {
    PlanService.listTemplates()
      .then(setTemplates)
      .catch(() => {})
  }, [])

  const defaultMethod: PlanMethod = useMemo(
    () => (reason === 'brand' || reason === 'medical' ? 'interval' : 'mixed'),
    [reason],
  )
  const method = methodOverride ?? defaultMethod
  const template = useMemo(
    () =>
      templates.find((t) => t.method === method && t.is_default) ??
      templates.find((t) => t.method === method),
    [templates, method],
  )
  const tomorrow = useMemo(() => {
    const d = new Date(nowInputValue())
    d.setDate(d.getDate() + 1)
    return formatDate(d)
  }, [])

  const canNext = useCallback((): boolean => {
    if (step === 1) return fromMilk.trim().length > 0
    if (step === 2) return toMilk.trim().length > 0
    return true
  }, [step, fromMilk, toMilk])

  const generate = useCallback(async () => {
    if (!safetyConfirmed) {
      Taro.showToast({ title: '请先勾选安全确认', icon: 'none' })
      return
    }
    if (!currentBaby || !template) {
      Taro.showToast({ title: '暂无可用计划模板', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      const plan = await PlanService.create({
        baby_id: currentBaby.id,
        from_brand_text: fromMilk.trim(),
        to_brand_text: toMilk.trim(),
        reason,
        method,
        template_id: template.id,
        template_version: template.version,
        start_date: tomorrow,
      })
      track('plan_created', { reason, method, days: (template.days as unknown[]).length })
      Taro.redirectTo({
        url: `/packages/plan/pages/detail/index?id=${plan.id}&babyId=${currentBaby.id}`,
      })
    } catch (error) {
      Taro.showToast({ title: '创建失败，请重试', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }, [safetyConfirmed, currentBaby, template, fromMilk, toMilk, reason, method, tomorrow])

  return (
    <View className='wizard'>
      <View className='wizard__stepbar'>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} className={`wizard__stepbar-seg ${i <= step ? 'is-on' : ''}`} />
        ))}
      </View>

      {step === 1 && (
        <StepMilk
          label='当前奶粉'
          hint='宝宝现在喝的奶粉；库里没有可直接手动输入'
          value={fromMilk}
          onChange={setFromMilk}
          babyId={babyId}
        />
      )}
      {step === 2 && (
        <StepMilk
          label='目标奶粉'
          hint={reason === 'stage' ? '建议同品牌相邻段位' : '跨品牌建议选择隔顿法'}
          value={toMilk}
          onChange={setToMilk}
          babyId={babyId}
        />
      )}
      {step === 3 && (
        <View className='wizard__section'>
          <Text className='wizard__label'>转奶原因</Text>
          <View className='wizard__reasons'>
            {REASONS.map((r) => (
              <View
                key={r.key}
                className={`wizard__reason ${reason === r.key ? 'is-on' : ''}`}
                onClick={() => setReason(r.key)}
              >
                <Text>{r.label}</Text>
              </View>
            ))}
          </View>
          {reason === 'medical' && (
            <View className='wizard__medical-tip'>
              <Text>水解配方与普通配方之间的转换请务必遵医嘱，速度宁慢勿快。</Text>
            </View>
          )}
        </View>
      )}
      {step === 4 && (
        <View className='wizard__section'>
          <Text className='wizard__label'>转奶方法（默认按原因推荐，可更换）</Text>
          <View className='wizard__reasons'>
            <View
              className={`wizard__reason ${method === 'mixed' ? 'is-on' : ''}`}
              onClick={() => setMethodOverride('mixed')}
            >
              <Text>混合法（同瓶混冲）</Text>
            </View>
            <View
              className={`wizard__reason ${method === 'interval' ? 'is-on' : ''}`}
              onClick={() => setMethodOverride('interval')}
            >
              <Text>隔顿法（逐顿替换）</Text>
            </View>
          </View>
          <View className='wizard__overview'>
            <Text className='wizard__overview-title'>计划总览</Text>
            {[
              ['当前奶粉', fromMilk],
              ['目标奶粉', toMilk],
              ['原因', REASONS.find((r) => r.key === reason)?.label ?? ''],
              ['方法', method === 'mixed' ? '混合法（同瓶混冲）' : '隔顿法（逐顿替换）'],
              ['开始日期', `${tomorrow}（明天）`],
            ].map(([k, v]) => (
              <View key={k} className='wizard__overview-row'>
                <Text className='wizard__overview-k'>{k}</Text>
                <Text className='wizard__overview-v'>{v}</Text>
              </View>
            ))}
          </View>
          {template && (
            <View className='wizard__template'>
              <Text className='wizard__template-name'>{template.name}</Text>
              <Text className='wizard__template-desc'>
                {(template.days as Array<{ label: string }>).map((d) => d.label).join(' → ')}
              </Text>
            </View>
          )}
          <View className='wizard__safe'>
            <Text className='wizard__safe-title'>⚠ 安全提示</Text>
            <Text className='wizard__safe-text'>
              宝宝腹泻、感冒或接种疫苗前后一周内，不建议开始转奶。若涉及水解配方，请务必在医生指导下进行。
            </Text>
            <Checkbox
              checked={safetyConfirmed}
              onChange={(checked) => setSafetyConfirmed(checked)}
            >
              <Text className='wizard__safe-ck'>我已知晓并确认继续</Text>
            </Checkbox>
          </View>
        </View>
      )}

      <View className='wizard__footer'>
        {step > 1 && (
          <Button variant='outlined' color='primary' shape='round' onClick={() => setStep(step - 1)}>
            上一步
          </Button>
        )}
        {step < 4 ? (
          <Button
            color='primary'
            shape='round'
            disabled={!canNext()}
            onClick={() => canNext() && setStep(step + 1)}
          >
            下一步
          </Button>
        ) : (
          <Button
            color='primary'
            shape='round'
            loading={submitting}
            onClick={() => void generate()}
          >
            生成计划
          </Button>
        )}
      </View>
    </View>
  )
}

/** 步骤 1/2：奶粉选择（库内搜索 + 手动输入兜底，FR-B2/C1） */
function StepMilk(props: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  babyId: string
}) {
  const [keyword, setKeyword] = useState('')
  const [products, setProducts] = useState<MilkProductRow[]>([])
  const [manual, setManual] = useState(false)

  useEffect(() => {
    if (manual) return
    MilkService.search({ keyword: keyword || undefined })
      .then(setProducts)
      .catch(() => setProducts([]))
  }, [keyword, manual])

  useEffect(() => {
    if (props.value && manual) setManual(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value])

  return (
    <View className='wizard__section'>
      <Text className='wizard__label'>{props.label}</Text>
      <Text className='wizard__hint'>{props.hint}</Text>
      <Input
        className='wizard__search'
        placeholder='搜索品牌或产品名'
        value={keyword}
        onInput={(e) => setKeyword(e.detail.value)}
      />
      {!manual && (
        <View className='wizard__products'>
          {products.map((p) => (
            <View
              key={p.id}
              className={`wizard__product ${props.value === `${p.brand} ${p.name}` ? 'is-on' : ''}`}
              onClick={() => props.onChange(`${p.brand} ${p.name}`)}
            >
              <Text className='wizard__product-name'>
                {p.brand} {p.name}
              </Text>
              <Text className='wizard__product-meta'>
                {p.stage} 段 · {p.reg_no ?? '海外版无国行注册号'}
              </Text>
            </View>
          ))}
          {products.length === 0 && (
            <View className='wizard__product-manual' onClick={() => setManual(true)}>
              <Text>未收录？手动输入品牌</Text>
            </View>
          )}
        </View>
      )}
      {manual && (
        <Input
          className='wizard__manual'
          placeholder='输入品牌，如：启赋蕴淳 3段'
          value={props.value}
          onInput={(e) => props.onChange(e.detail.value)}
        />
      )}
    </View>
  )
}
