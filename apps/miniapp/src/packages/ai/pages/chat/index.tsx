import { useEffect, useRef, useState } from 'react'
import { Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Button } from '@taroify/core'
import { AiService } from '../../../../services/ai.service'
import { track } from '../../../../services/analytics.service'
import { useBaby } from '../../../../store/baby'
import type { AiChatMessage, AiSceneStatus } from '../../../../types'
import './index.scss'

const GREETING =
  '你好呀！我可以解答转奶方法、奶粉知识与喂养观察的问题；宝宝在转奶时，我会结合计划进度回答。'

/** AI 限定域问答（FR-K5 / V2-K1）：出域拒答、降级文案、AI 标识与免责声明 */
export default function AiChat() {
  const { currentBaby } = useBaby()
  const [scene, setScene] = useState<AiSceneStatus | null>(null)
  const [messages, setMessages] = useState<AiChatMessage[]>([
    { role: 'assistant', content: GREETING },
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<AiChatMessage[]>(messages)
  listRef.current = messages

  useEffect(() => {
    AiService.sceneConfig('chat')
      .then(setScene)
      .catch(() => setScene({ scene: 'chat', enabled: false, daily_limit: 0, used_today: 0, remaining: 0 }))
  }, [])

  const send = async () => {
    const question = input.trim()
    if (!question || sending) return
    setInput('')
    setSending(true)
    const history = listRef.current.slice(-6)
    setMessages((prev) => [...prev, { role: 'user', content: question }])
    try {
      const res = await AiService.chat(question, currentBaby?.id, history)
      track('ai_used', { scene: 'chat', ok: !res.degraded })
      setMessages((prev) => [...prev, { role: 'assistant', content: res.answer }])
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '网络不太顺畅，请稍后再试；或先到「知识」栏目查阅转奶文章。' },
      ])
    } finally {
      setSending(false)
    }
  }

  const clearHistory = () => {
    Taro.showModal({
      title: '清空对话',
      content: '仅清空当前页面记录，历史消息可在「我的」注销时一并删除。',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm) setMessages([{ role: 'assistant', content: GREETING }])
      },
    })
  }

  if (scene && !scene.enabled) {
    return (
      <View className='ai-chat ai-chat--disabled'>
        <Text className='ai-chat__empty-title'>AI 问答暂未开放</Text>
        <Text className='ai-chat__empty-desc'>功能正在灰度中，先到「知识」栏目查看转奶文章吧。</Text>
      </View>
    )
  }

  return (
    <View className='ai-chat'>
      <View className='ai-chat__notice'>
        <Text>AI 生成内容仅供参考，不构成医学建议</Text>
      </View>

      <View className='ai-chat__list'>
        {messages.map((m, i) =>
          m.role === 'assistant' ? (
            <View key={i} className='ai-chat__row'>
              <View className='ai-chat__avatar'>
                <Text>✦</Text>
              </View>
              <View className='ai-chat__bubble'>
                <Text>{m.content}</Text>
              </View>
            </View>
          ) : (
            <View key={i} className='ai-chat__row ai-chat__row--user'>
              <View className='ai-chat__bubble ai-chat__bubble--user'>
                <Text>{m.content}</Text>
              </View>
            </View>
          ),
        )}
        {sending && (
          <View className='ai-chat__row'>
            <View className='ai-chat__bubble'>
              <Text>正在思考…</Text>
            </View>
          </View>
        )}
      </View>

      <View className='ai-chat__meta'>
        <Text onClick={clearHistory}>清空对话</Text>
        {scene && scene.daily_limit > 0 && (
          <Text>
            今日剩余 {Math.max(scene.remaining, 0)}/{scene.daily_limit} 次
          </Text>
        )}
      </View>

      <View className='ai-chat__input'>
        <Input
          placeholder='输入你的问题…'
          value={input}
          confirmType='send'
          onInput={(e) => setInput(e.detail.value)}
          onConfirm={() => void send()}
        />
        <Button
          className='ai-chat__send'
          size='small'
          color='primary'
          shape='round'
          loading={sending}
          onClick={() => void send()}
        >
          发送
        </Button>
      </View>
    </View>
  )
}
