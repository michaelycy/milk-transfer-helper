import { useEffect, useState } from 'react'
import { Input, Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { MilkService } from '../../../../services/milk.service'
import type { MilkProductRow } from '../../../../types'
import './index.scss'

const STAGES = ['1 段', '2 段', '3 段', '4 段']
const PROTEINS: Array<[string, string]> = [
  ['intact', '整蛋白'],
  ['partially_hydrolyzed', '部分水解'],
  ['extensively_hydrolyzed', '深度水解'],
  ['amino_acid', '氨基酸'],
]

/** 奶粉库搜索（FR-B1/B2 / V2-10）：中性呈现、手动输入兜底 */
export default function MilkSearch() {
  const router = useRouter()
  const pickMode = router.params.mode === 'pick'
  // FR-K3 拍罐识别带品牌词跳转：以识别品牌预填搜索
  const [keyword, setKeyword] = useState(router.params.keyword ?? '')
  const [stage, setStage] = useState<number | null>(null)
  const [protein, setProtein] = useState<string | null>(null)
  const [products, setProducts] = useState<MilkProductRow[]>([])
  const [checked, setChecked] = useState<string[]>([])

  useEffect(() => {
    MilkService.search({ keyword: keyword || undefined, stage: stage ?? undefined, proteinType: protein ?? undefined })
      .then(setProducts)
      .catch(() => setProducts([]))
  }, [keyword, stage, protein])

  const toggleCheck = (id: string) => {
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 3 ? prev : [...prev, id]))
  }

  const pick = (p: MilkProductRow) => {
    if (pickMode) {
      Taro.eventCenter.trigger('milk:selected', p)
      Taro.navigateBack()
      return
    }
    toggleCheck(p.id)
  }

  const goCompare = () => {
    Taro.navigateTo({ url: `/packages/milk/pages/compare/index?ids=${checked.join(',')}` })
  }

  return (
    <View className='page'>
      <View className='page__search'>
        <Input placeholder='搜索品牌或产品名' value={keyword} onInput={(e) => setKeyword(e.detail.value)} />
        <Text className='page__scan' onClick={() => Taro.navigateTo({ url: '/packages/ai/pages/can/index' })}>
          拍罐识别
        </Text>
      </View>

      <Text className='page__label'>段位</Text>
      <View className='page__chips'>
        {STAGES.map((lb, i) => (
          <View
            key={lb}
            className={`page__chip ${stage === i + 1 ? 'is-on' : ''}`}
            onClick={() => setStage(stage === i + 1 ? null : i + 1)}
          >
            <Text>{lb}</Text>
          </View>
        ))}
      </View>

      <Text className='page__label'>蛋白类型</Text>
      <View className='page__chips'>
        {PROTEINS.map(([key, lb]) => (
          <View
            key={key}
            className={`page__chip ${protein === key ? 'is-on' : ''}`}
            onClick={() => setProtein(protein === key ? null : key)}
          >
            <Text>{lb}</Text>
          </View>
        ))}
      </View>

      <View className='page__results'>
        {products.map((p) => (
          <View key={p.id} className='page__card' onClick={() => pick(p)}>
            <Text className='page__card-name'>{p.brand} {p.name}</Text>
            <View className='page__tags'>
              <Text className='page__tag' style={{ background: '#FFF1EA', color: '#FF6B35' }}>{p.stage} 段</Text>
              <Text className='page__tag' style={{ background: '#E8F3FE', color: '#1989FA' }}>
                {PROTEINS.find(([k]) => k === p.protein_type)?.[1] ?? p.protein_type}
              </Text>
              <Text className='page__tag' style={{ background: '#F2F3F5', color: '#646566' }}>
                {p.region === 'overseas' ? '海外版无国行注册号' : p.reg_no ?? '暂无注册号'}
              </Text>
              <Text className='page__ing'>
                {Object.entries((p.ingredients ?? {}) as Record<string, unknown>)
                  .filter(([, v]) => v === true || typeof v === 'string')
                  .map(([k]) => k)
                  .join(' · ') || '　'}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {!pickMode && (
        <View className='page__compare-bar'>
          <Text className='page__compare-hint'>已选 {checked.length}/3</Text>
          <View
            className={`page__compare-btn ${checked.length < 2 ? 'is-disabled' : ''}`}
            onClick={() => checked.length >= 2 && goCompare()}
          >
            <Text>对比</Text>
          </View>
        </View>
      )}

      <Text className='page__note'>数据中性呈现 · 不含推荐与排名</Text>
    </View>
  )
}
