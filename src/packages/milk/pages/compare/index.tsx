import { useEffect, useState } from 'react'
import { Text, View } from '@tarojs/components'
import { useRouter } from '@tarojs/taro'
import { MilkService } from '../../../../services/milk.service'
import type { MilkProductRow } from '../../../../types'
import './index.scss'

/** 奶粉对比（FR-B3 / V2-11）：差异高亮、缺失显示暂无、固定免责声明，不给结论 */
export default function MilkCompare() {
  const router = useRouter()
  const [products, setProducts] = useState<MilkProductRow[]>([])

  useEffect(() => {
    const ids = (router.params.ids ?? '').split(',').filter(Boolean)
    MilkService.getByIds(ids)
      .then(setProducts)
      .catch(() => setProducts([]))
  }, [router.params.ids])

  const rows: Array<[string, (p: MilkProductRow) => string]> = [
    ['段位', (p) => `${p.stage} 段`],
    ['蛋白类型', (p) => p.protein_type],
    ['国食注字', (p) => p.reg_no ?? '暂无'],
    ['品牌产地', (p) => (p.region === 'overseas' ? '海外版' : '国行')],
  ]

  const cellValue = (p: MilkProductRow, label: string): string => {
    if (label === '段位' || label === '蛋白类型' || label === '国食注字' || label === '品牌产地') {
      const found = rows.find(([k]) => k === label)!
      return found[1](p)
    }
    return '暂无'
  }

  return (
    <View className='page'>
      <View className='disclaimer'>
        <Text>ⓘ 信息仅供参考，请以罐体标注为准</Text>
      </View>

      <View className='table'>
        <View className='th'>
          <Text className='th-k'>对比项</Text>
          {products.map((p) => (
            <Text key={p.id} className='th-v'>{p.name}</Text>
          ))}
        </View>
        {rows.map(([label], i) => {
          const values = products.map((p) => cellValue(p, label))
          const diff = products.length === 2 && values[0] !== values[1]
          return (
            <View key={label}>
              {i > 0 && <View className='hair' />}
              <View className={`tr ${diff ? 'is-diff' : ''}`}>
                <Text className='tr-k'>{label}</Text>
                {values.map((v, idx) => (
                  <Text key={idx} className={`tr-v ${diff ? 'is-diff' : ''}`}>{v}</Text>
                ))}
              </View>
            </View>
          )
        })}
      </View>

      {products.length === 0 && (
        <Text className='empty'>未选择产品，请在奶粉库中勾选 2–3 款</Text>
      )}

      <Text className='foot'>＋ 返回奶粉库添加第三款对比</Text>
    </View>
  )
}
