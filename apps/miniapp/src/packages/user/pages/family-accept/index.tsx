import { useEffect, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { Button } from '@taroify/core'
import { useAuth } from '../../../../store/auth'
import { FamilyService, type AcceptResult } from '../../../../services/family.service'
import { track } from '../../../../services/analytics.service'
import '../shared.scss'

/** 邀请接受页（FR-H3）：经分享卡片携带短码进入；游客需先升级微信登录 */
export default function FamilyAccept() {
  const router = useRouter()
  const { isWechat } = useAuth()
  const [result, setResult] = useState<AcceptResult | null>(null)
  const [error, setError] = useState('')
  const code = router.params.code || ''

  useEffect(() => {
    if (!code || !isWechat) return
    void FamilyService.acceptInvite(code)
      .then((res) => {
        // 接受成功才计事件；幂等重复接受（already）同样视为一次成功加入
        if (!res.already) track('family_invite_accepted', { role: res.role })
        setResult(res)
      })
      .catch((e) => setError((e as Error).message))
  }, [code, isWechat])

  return (
    <View className='user-page'>
      <View className='page-header'>
        <Text className='page-title'>家庭共享邀请</Text>
      </View>
      {!isWechat && (
        <View className='card'>
          <Text className='para'>游客模式不能加入家庭共享。请先使用微信登录（数据将迁移到正式账号）。</Text>
          <Button
            className='primary-btn'
            variant='contained'
            color='primary'
            onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}
          >
            去登录
          </Button>
        </View>
      )}
      {isWechat && !result && !error && <Text className='empty'>正在接受邀请…</Text>}
      {error && (
        <View className='card'>
          <Text className='para'>{error}</Text>
        </View>
      )}
      {result && (
        <View className='card'>
          <Text className='sec-title'>
            {result.already ? '你已在家庭中' : '加入成功'}
          </Text>
          <Text className='para'>
            已{result.already ? '位于' : '加入'}「{result.baby.nickname || '宝宝'}」的共享档案，
            角色：{result.role === 'editor' ? '可编辑' : '只读'}。
          </Text>
          <Button
            className='primary-btn'
            variant='contained'
            color='primary'
            onClick={() => Taro.switchTab({ url: '/pages/index/index' })}
          >
            去查看
          </Button>
        </View>
      )}
    </View>
  )
}
