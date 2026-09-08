import type { SymptomLogRow } from '../types'

/**
 * 症状信号规则引擎（FR-E1/E2，纯函数 + 单测）。
 * 规则与阈值默认值在这里，可被配置表覆盖（NFR-1：上线前经专业顾问审核）。
 * 输出不构成医疗建议；红色预警建议就医（NFR-1 保守原则）。
 */

export type SymptomLevel = 'red' | 'yellow' | 'green'

export interface AlertRuleConfig {
  /** 稀水样便当日 ≥ 此次数 → 黄色 */
  wateryStoolCountThreshold: number
  /** 总奶量低于参考量此比例（且持续当日）→ 黄色 */
  lowMilkRatio: number
  /** 基线不足时，稀水样便绝对阈值分支的降级次数 */
  wateryStoolAbsoluteThreshold: number
}

export const DEFAULT_RULE_CONFIG: AlertRuleConfig = {
  wateryStoolCountThreshold: 3,
  lowMilkRatio: 0.7,
  wateryStoolAbsoluteThreshold: 3,
}

export interface SymptomRuleInput {
  log: Pick<
    SymptomLogRow,
    'stool_count' | 'stool_texture' | 'stool_color' | 'has_rash' | 'has_vomit' | 'has_fever'
  > | null
  /** 当日总奶量 ml（无记录传 null） */
  totalMl: number | null
  /** 当日奶量参考区间下限 ml（无参考传 null，规则自动 skipped/降级） */
  referenceMl: number | null
  /** 基线（计划开始前 3 个喂养日）平均大便次数；null 表示基线不足 */
  baselineStoolCount: number | null
  config?: Partial<AlertRuleConfig>
}

export interface SymptomRuleResult {
  level: SymptomLevel
  /** 命中的最高优先级规则编码 */
  ruleCode: string
  /** 人可读的触发依据（写入 alerts.payload，可追溯"当时为什么预警"） */
  evidence: string[]
  /** 因数据不足被跳过的规则（glossary §4：禁止静默失败） */
  skipped: string[]
}

/** 规则优先级：red（血便/频繁呕吐发热）> yellow（稀水便/湿疹加重/奶量低）> green */
export function evaluateSymptoms(input: SymptomRuleInput): SymptomRuleResult {
  const config = { ...DEFAULT_RULE_CONFIG, ...input.config }
  const evidence: string[] = []
  const skipped: string[] = []
  let level: SymptomLevel = 'green'
  let ruleCode = 'none'

  const raise = (next: SymptomLevel, code: string, why: string) => {
    if (next === 'red' || (next === 'yellow' && level === 'green')) {
      level = next
      ruleCode = code
    }
    evidence.push(why)
  }

  const log = input.log
  if (!log) {
    skipped.push('no_symptom_log')
  } else {
    // R1 血丝便/血便 → 红色（医学保守原则，最高优先级）
    if (log.stool_color === 'bloody') {
      raise('red', 'blood_stool', '大便颜色为带血丝/血便')
    }
    // R2 频繁呕吐或发热 → 红色
    if (log.has_fever || (log.has_vomit && log.stool_texture === 'watery')) {
      raise('red', 'fever_or_frequent_vomit', '存在发热或频繁呕吐表现')
    }
    // R3 稀水样便：有基线按"≥阈值 或 较基线明显增多"，基线不足降级为绝对阈值
    if (log.stool_texture === 'watery') {
      const count = log.stool_count
      if (input.baselineStoolCount != null) {
        if (count >= config.wateryStoolCountThreshold) {
          raise(
            'yellow',
            'watery_stool',
            `稀水样便 ${count} 次（≥ ${config.wateryStoolCountThreshold} 次）`,
          )
        } else if (count > input.baselineStoolCount + 1) {
          raise(
            'yellow',
            'watery_stool_vs_baseline',
            `稀水样便 ${count} 次，较基线均值 ${input.baselineStoolCount} 次明显增多`,
          )
        }
      } else {
        skipped.push('baseline_insufficient')
        if (count >= config.wateryStoolAbsoluteThreshold) {
          raise(
            'yellow',
            'watery_stool_absolute',
            `基线不足，按绝对阈值：稀水样便 ${count} 次（≥ ${config.wateryStoolAbsoluteThreshold} 次）`,
          )
        }
      }
    }
    // R4 湿疹明显加重或新发 → 黄色
    if (log.has_rash) {
      raise('yellow', 'rash', '出现皮疹/湿疹加重表现')
    }
  }

  // R5 连续当日总奶量低于参考量 70% → 黄色；参考缺失时 skipped（不静默）
  if (input.totalMl != null && input.referenceMl != null && input.referenceMl > 0) {
    if (input.totalMl < input.referenceMl * config.lowMilkRatio) {
      raise(
        'yellow',
        'low_milk_volume',
        `当日总奶量 ${input.totalMl} ml，低于参考量下限的 ${Math.round(config.lowMilkRatio * 100)}%`,
      )
    }
  } else {
    skipped.push('milk_reference_unavailable')
  }

  return { level, ruleCode, evidence, skipped }
}
