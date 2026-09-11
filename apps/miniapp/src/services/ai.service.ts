import { aiRequest } from './supabase'
import { ensureSession } from '../utils/auth'
import type { AiAnalyzeResult, AiChatMessage, AiSceneStatus } from '../types'
import { normalizeAnalyzeData } from '../utils/ai'

/**
 * AI 助手服务（模块 K，FR-K1–K5）。
 * 全部能力经后端 AI 网关 /v1/ai/*（配额、护栏、降级、密钥都在服务端闭环），
 * 小程序不接触模型供应商与密钥；任何失败返回 degraded 结果而非抛错（FR-K1 验收）。
 */

interface ApiEnvelope<T> {
  status: number
  data: T
  error: { message: string } | null
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  await ensureSession()
  const res = await aiRequest(`/v1/ai/${path}`, body)
  const payload = res.body as unknown as ApiEnvelope<T>
  if (res.status >= 400 || !payload || payload.status >= 400) {
    throw new Error(payload?.error?.message || `AI 服务不可用（HTTP ${res.status}）`)
  }
  return payload.data
}

export const AiService = {
  /** 场景可用性查询（入口前置判断，避免无效拍照） */
  async sceneConfig(scene: AiSceneStatus['scene']): Promise<AiSceneStatus> {
    return call<AiSceneStatus>('config', { scene })
  },

  /** 限定域问答（FR-K5）；返回降级文案而非抛错 */
  async chat(
    question: string,
    babyId?: string,
    history: AiChatMessage[] = [],
  ): Promise<{ answer: string; degraded: boolean; off_domain?: boolean }> {
    return call('chat', {
      question,
      baby_id: babyId ?? null,
      history: history
        .filter((m) => m.content)
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content })),
    })
  },

  /** 视觉识别（FR-K2/K3/K4）：照片仅 base64 即时分析（NFR-2 分析即弃） */
  async analyze(
    scene: 'poop' | 'bottle' | 'can',
    imageBase64: string,
    babyId?: string,
  ): Promise<AiAnalyzeResult> {
    const raw = await call<Record<string, unknown>>('analyze', {
      scene,
      image_base64: imageBase64,
      baby_id: babyId ?? null,
    })
    return normalizeAnalyzeData(raw)
  },
}
