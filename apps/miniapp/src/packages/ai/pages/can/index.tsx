import { useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Button } from '@taroify/core'
import { AiService } from '../../../../services/ai.service'
import { track } from '../../../../services/analytics.service'
import { confidencePercent } from '../../../../utils/ai'
import type { AiAnalyzeResult, MilkProductRow } from '../../../../types'
import { readFileBase64 } from '../shared'
import './index.scss'

const PROTEIN_LABELS: Record<string, string> = {
  intact: '整蛋白',
  partially_hydrolyzed: '部分水解',
  extensively_hydrolyzed: '深度水解',
  amino_acid: '氨基酸',
}

/** 拍奶粉罐识别（FR-K3 / V2-K4）：命中展示库内卡片（中性呈现）；未命中自动进补录队列 */
export default function AiCan() {
  const [result, setResult] = useState<AiAnalyzeResult | null>(null)
  const [scanning, setScanning] = useState(false)

  const shoot = () => {
    if (scanning) return
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
      const r = await AiService.analyze('can', base64)
      track('ai_used', { scene: 'can', ok: r.ok })
      if (!r.ok) {
        Taro.showToast({ title: r.message ?? '没识别清楚，可手动搜索品牌', icon: 'none' })
        return
      }
      setResult(r)
    } catch {
      Taro.showToast({ title: 'AI 服务不可用，请手动搜索品牌', icon: 'none' })
    } finally {
      setScanning(false)
    }
  }

  const goSearch = () => {
    const brand = result?.analysis?.brand ?? ''
    Taro.navigateTo({ url: `/packages/milk/pages/search/index${brand ? `?keyword=${brand}` : ''}` })
  }

  const goPlan = () => {
    const matched = result?.matched?.[0]
    if (!matched) return
    Taro.navigateTo({ url: `/packages/plan/pages/wizard/index?productId=${matched.id}` })
  }

  return (
    <View className='ai-can'>
      <View className='ai-can__photo' onClick={shoot}>
        <Text className='ai-can__photo-icon'>📷</Text>
        <Text className='ai-can__photo-hint'>
          {scanning ? '识别中…' : '对准罐体正面与段位标识'}
        </Text>
      </View>

      {result && (
        <>
          {result.matched && result.matched.length > 0 ? (
            <View className='ai-can__card'>
              <View className='ai-can__card-h'>
                <Text className='ai-can__card-title'>识别结果 · 已匹配奶粉库</Text>
                <Text className='ai-can__conf'>{confidencePercent(result.confidence)}%</Text>
              </View>
              {result.matched.map((p) => (
                <ProductCard key={p.id} product={p} onGoPlan={goPlan} />
              ))}
              <Text className='ai-can__neutral'>数据中性呈现 · 不含推荐与排名</Text>
            </View>
          ) : (
            <View className='ai-can__card'>
              <Text className='ai-can__card-title'>没有匹配到？</Text>
              <Text className='ai-can__desc'>
                {result.analysis?.brand
                  ? `识别到「${result.analysis.brand}」，奶粉库暂未收录，已提交运营补录。`
                  : '已提交识别结果给运营补录，收录后即可在奶粉库检索与创建计划。'}
              </Text>
              <Text className='ai-can__privacy'>照片默认不上传；勾选补录照片时才上传私有存储，仅运营可见</Text>
              <Button color='primary' variant='outlined' shape='round' block onClick={goSearch}>
                先手动搜索看看
              </Button>
            </View>
          )}
        </>
      )}
    </View>
  )
}

function ProductCard({ product, onGoPlan }: { product: MilkProductRow; onGoPlan: () => void }) {
  const ingredients = Object.entries((product.ingredients ?? {}) as Record<string, unknown>)
    .filter(([, v]) => v === true)
    .map(([k]) => k)
    .join(' · ')

  return (
    <View className='ai-can__product'>
      <Text className='ai-can__product-name'>
        {product.brand} {product.name} {product.stage} 段
      </Text>
      <View className='ai-can__tags'>
        <Text className='ai-can__tag ai-can__tag--primary'>{product.stage} 段</Text>
        <Text className='ai-can__tag ai-can__tag--info'>
          {PROTEIN_LABELS[product.protein_type] ?? product.protein_type}
        </Text>
        <Text className='ai-can__tag'>
          {product.region === 'overseas' ? '海外版无国行注册号' : (product.reg_no ?? '暂无注册号')}
        </Text>
      </View>
      {ingredients && <Text className='ai-can__ing'>{ingredients}</Text>}
      <View className='ai-can__btns'>
        <Button
          variant='outlined'
          size='small'
          shape='round'
          onClick={() => Taro.navigateTo({ url: `/packages/milk/pages/search/index?keyword=${product.brand}` })}
        >
          在奶粉库查看
        </Button>
        <Button color='primary' size='small' shape='round' onClick={onGoPlan}>
          用 TA 创建转奶计划
        </Button>
      </View>
    </View>
  )
}
