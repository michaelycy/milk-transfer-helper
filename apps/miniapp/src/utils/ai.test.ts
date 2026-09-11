import { describe, expect, it } from 'vitest'
import {
  confidencePercent,
  isLowConfidence,
  mapPoopToDraft,
  normalizeAnalyzeData,
  usableVolumeMl,
} from './ai'

describe('isLowConfidence', () => {
  it('低于 0.6 或缺失视为低置信度（FR-K4 验收）', () => {
    expect(isLowConfidence(0.59)).toBe(true)
    expect(isLowConfidence(0.6)).toBe(false)
    expect(isLowConfidence(0.92)).toBe(false)
    expect(isLowConfidence(undefined)).toBe(true)
    expect(isLowConfidence(null)).toBe(true)
  })
})

describe('confidencePercent', () => {
  it('取整百分比；缺失为 0', () => {
    expect(confidencePercent(0.876)).toBe(88)
    expect(confidencePercent(0)).toBe(0)
    expect(confidencePercent(undefined)).toBe(0)
  })
})

describe('usableVolumeMl', () => {
  it('合法奶量取整；越界与缺失返回 -1（FR-K2）', () => {
    expect(usableVolumeMl(210)).toBe(210)
    expect(usableVolumeMl(210.4)).toBe(210)
    expect(usableVolumeMl(0)).toBe(-1)
    expect(usableVolumeMl(9999)).toBe(-1)
    expect(usableVolumeMl(-5)).toBe(-1)
    expect(usableVolumeMl(undefined)).toBe(-1)
  })
})

describe('mapPoopToDraft', () => {
  it('合法枚举映射到打卡草稿字段', () => {
    const draft = mapPoopToDraft(
      normalizeAnalyzeData({
        ok: true,
        degraded: false,
        confidence: 0.87,
        analysis: { color: 'golden', texture: 'soft', abnormal_suspect: false, note: '成形度略低' },
      }),
    )
    expect(draft).toEqual({
      color: 'golden',
      texture: 'soft',
      abnormal_suspect: false,
      note: '成形度略低',
      lowConfidence: false,
    })
  })

  it('非法枚举置 null，交由用户人工选择（预警不来自 AI）', () => {
    const draft = mapPoopToDraft(
      normalizeAnalyzeData({
        ok: true,
        degraded: false,
        confidence: 0.4,
        analysis: { color: '彩虹色', texture: '未知', abnormal_suspect: true },
      }),
    )
    expect(draft.color).toBeNull()
    expect(draft.texture).toBeNull()
    expect(draft.abnormal_suspect).toBe(true)
    expect(draft.lowConfidence).toBe(true)
  })

  it('analysis 缺失时安全降级', () => {
    const draft = mapPoopToDraft(normalizeAnalyzeData({ ok: false, degraded: true }))
    expect(draft.color).toBeNull()
    expect(draft.texture).toBeNull()
    expect(draft.lowConfidence).toBe(true)
  })
})

describe('normalizeAnalyzeData', () => {
  it('字段类型漂移时不抛错', () => {
    const r = normalizeAnalyzeData({ ok: 'yes', matched: 'oops', confidence: 'high' })
    expect(r.ok).toBe(true) // 真值归一（Boolean 强制），目标是健壮而非严格布尔
    expect(r.matched).toBeUndefined()
    expect(r.confidence).toBeUndefined()
  })

  it('保留合法的 matched 与 submission_id（FR-K3）', () => {
    const products = [{ id: 'p1', brand: '飞鹤' }]
    const r = normalizeAnalyzeData({ ok: true, degraded: false, matched: products, submission_id: 's1' })
    expect(r.matched).toEqual(products)
    expect(r.submission_id).toBe('s1')
  })
})
