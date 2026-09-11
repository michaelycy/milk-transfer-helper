/**
 * AI 分包共享件（模块 K 内部，不跨域）。
 */
import Taro from '@tarojs/taro'
import { buildPlanDays } from '../../../utils/plan'
import type { PlannedDay, TransferPlanRow } from '../../../types'

/** 拍照类页面固定提示（NFR-2 照片最小化 / NFR-1 免责） */
export const DEFAULT_RULES = '照片仅即时分析，不做存储；AI 结果仅供参考'

/** 弹层/识别页轻量计划节奏（与 QuickRecordSheet 同口径；无模板时按方法给默认节奏） */
export function quickDays(plan: TransferPlanRow): PlannedDay[] {
  if (plan.method === 'mixed') {
    return buildPlanDays(
      [
        { ratio: 0.33, label: '新奶 1/3' },
        { ratio: 0.33, label: '新奶 1/3' },
        { ratio: 0.33, label: '新奶 1/3' },
        { ratio: 0.5, label: '新奶 1/2' },
        { ratio: 0.5, label: '新奶 1/2' },
        { ratio: 0.5, label: '新奶 1/2' },
        { ratio: 1, label: '全量新奶' },
      ],
      plan.start_date,
    )
  }
  return buildPlanDays(
    Array.from({ length: 14 }, (_, i) => ({
      ratio: Math.min(1, (Math.floor(i / 2) + 1) / 5),
      label: `第 ${Math.floor(i / 2) + 1} 批新奶`,
    })),
    plan.start_date,
  )
}

/** 读取本地图片为 base64（NFR-2：随请求即时分析，不落盘不上传存储） */
export function readFileBase64(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const fsm = Taro.getFileSystemManager()
    fsm.readFile({
      filePath,
      encoding: 'base64',
      success: (res) => resolve(String(res.data)),
      fail: reject,
    })
  })
}
