import { describe, expect, it } from 'vitest'
import { DEFAULT_RULE_CONFIG, evaluateSymptoms } from './rules'

const baseLog = {
  stool_count: 1,
  stool_texture: 'normal',
  stool_color: 'golden',
  has_rash: false,
  has_vomit: false,
  has_fever: false,
}

describe('evaluateSymptoms（FR-E1 规则引擎）', () => {
  it('无异常数据 → 绿色', () => {
    const r = evaluateSymptoms({ log: baseLog, totalMl: 700, referenceMl: 800, baselineStoolCount: 1 })
    expect(r.level).toBe('green')
    expect(r.ruleCode).toBe('none')
  })

  it('R1 血便 → 红色（最高优先级）', () => {
    const r = evaluateSymptoms({
      log: { ...baseLog, stool_color: 'bloody', stool_count: 5 },
      totalMl: 700,
      referenceMl: 800,
      baselineStoolCount: 1,
    })
    expect(r.level).toBe('red')
    expect(r.ruleCode).toBe('blood_stool')
  })

  it('R2 发热 → 红色', () => {
    const r = evaluateSymptoms({
      log: { ...baseLog, has_fever: true },
      totalMl: 700,
      referenceMl: 800,
      baselineStoolCount: 1,
    })
    expect(r.level).toBe('red')
  })

  it('R3 有基线：稀水样便 ≥3 次 → 黄色', () => {
    const r = evaluateSymptoms({
      log: { ...baseLog, stool_texture: 'watery', stool_count: 3 },
      totalMl: 700,
      referenceMl: 800,
      baselineStoolCount: 1,
    })
    expect(r.level).toBe('yellow')
    expect(r.ruleCode).toBe('watery_stool')
  })

  it('R3 有基线：稀水样便较基线明显增多（未达绝对阈值）→ 黄色', () => {
    const config = { ...DEFAULT_RULE_CONFIG, wateryStoolCountThreshold: 5 }
    const r = evaluateSymptoms({
      log: { ...baseLog, stool_texture: 'watery', stool_count: 3 },
      totalMl: 700,
      referenceMl: 800,
      baselineStoolCount: 1,
      config,
    })
    expect(r.level).toBe('yellow')
    expect(r.ruleCode).toBe('watery_stool_vs_baseline')
  })

  it('R3 基线不足时降级为绝对阈值分支，并记录 skipped', () => {
    const r = evaluateSymptoms({
      log: { ...baseLog, stool_texture: 'watery', stool_count: 3 },
      totalMl: 700,
      referenceMl: 800,
      baselineStoolCount: null,
    })
    expect(r.level).toBe('yellow')
    expect(r.ruleCode).toBe('watery_stool_absolute')
    expect(r.skipped).toContain('baseline_insufficient')
  })

  it('R5 奶量低于参考量 70% → 黄色', () => {
    const r = evaluateSymptoms({
      log: baseLog,
      totalMl: 500,
      referenceMl: 800,
      baselineStoolCount: 1,
    })
    expect(r.level).toBe('yellow')
    expect(r.ruleCode).toBe('low_milk_volume')
  })

  it('参考量缺失时奶量规则 skipped（禁止静默失败）', () => {
    const r = evaluateSymptoms({ log: baseLog, totalMl: 100, referenceMl: null, baselineStoolCount: 1 })
    expect(r.level).toBe('green')
    expect(r.skipped).toContain('milk_reference_unavailable')
  })

  it('无打卡数据 → green 且记录 skipped', () => {
    const r = evaluateSymptoms({ log: null, totalMl: 700, referenceMl: 800, baselineStoolCount: null })
    expect(r.level).toBe('green')
    expect(r.skipped).toContain('no_symptom_log')
  })

  it('红色优先于黄色（血便 + 奶量低同时命中）', () => {
    const r = evaluateSymptoms({
      log: { ...baseLog, stool_color: 'bloody' },
      totalMl: 100,
      referenceMl: 800,
      baselineStoolCount: 1,
    })
    expect(r.level).toBe('red')
    expect(r.evidence.length).toBe(2)
  })
})
