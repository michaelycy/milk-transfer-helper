/**
 * AI 助手纯函数（模块 K，可测试）。
 * 职责：后端返回数据的防御性归一化 + 展示映射；不做任何 I/O。
 */
import type { AiAnalyzeResult, PoopAnalysis } from '../types'

/** FR-K4/K2/K3 验收：置信度 < 0.6 视为低置信度，提示以人工为准 */
export function isLowConfidence(confidence: number | undefined | null): boolean {
  if (confidence == null || Number.isNaN(confidence)) return true
  return confidence < 0.6
}

/** 置信度展示（% 取整） */
export function confidencePercent(confidence: number | undefined | null): number {
  if (confidence == null || Number.isNaN(confidence)) return 0
  return Math.round(confidence * 100)
}

/** FR-K2：奶瓶识别奶量合法性（0 < ml ≤ 500 才可预填；-1 = 无效） */
export function usableVolumeMl(volume: number | undefined | null): number {
  if (volume == null || Number.isNaN(volume)) return -1
  return volume > 0 && volume <= 500 ? Math.round(volume) : -1
}

const POOP_COLORS = new Set(['golden', 'green', 'black', 'bloody'])
const POOP_TEXTURES = new Set(['normal', 'soft', 'watery', 'constipated'])

/**
 * FR-K4：便便观察 → FR-D3 打卡草稿字段映射。
 * 枚举不在打卡选项内时置 null（由用户在打卡页人工选择）；预警级别一律由打卡页的规则引擎判定。
 */
export function mapPoopToDraft(analysis: AiAnalyzeResult): PoopAnalysis & { lowConfidence: boolean } {
  const a = (analysis.analysis ?? {}) as NonNullable<AiAnalyzeResult['analysis']>
  const color = a.color != null && POOP_COLORS.has(a.color) ? a.color : null
  const texture = a.texture != null && POOP_TEXTURES.has(a.texture) ? a.texture : null
  return {
    color,
    texture,
    abnormal_suspect: Boolean(a.abnormal_suspect),
    note: typeof a.note === 'string' ? a.note : '',
    lowConfidence: isLowConfidence(analysis.confidence),
  }
}

/** 后端 /analyze 返回的防御性归一化（字段缺失/类型漂移时不抛错） */
export function normalizeAnalyzeData(raw: Record<string, unknown>): AiAnalyzeResult {
  const analysis = (raw.analysis ?? null) as AiAnalyzeResult['analysis']
  const matched = Array.isArray(raw.matched) ? (raw.matched as AiAnalyzeResult['matched']) : undefined
  return {
    ok: Boolean(raw.ok),
    degraded: Boolean(raw.degraded),
    reason: typeof raw.reason === 'string' ? raw.reason : undefined,
    message: typeof raw.message === 'string' ? raw.message : undefined,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : undefined,
    analysis,
    matched,
    submission_id: typeof raw.submission_id === 'string' ? raw.submission_id : undefined,
  }
}
