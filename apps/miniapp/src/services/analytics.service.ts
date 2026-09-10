import { supabase } from './supabase'
import { ensureSession } from '../utils/auth'
import type { Json } from '../types/database'

/**
 * 埋点采集（FR-H4）。glossary §5 全部指标的唯一数据源。
 * fire-and-forget：上报失败静默降级、不重试、绝不阻塞业务操作。
 * analytics_events 无客户端 select 权限，因此这里只 insert。
 */

export type AnalyticsEvent =
  | 'app_launch'
  | 'feed_recorded'
  | 'symptom_saved'
  | 'plan_created'
  | 'plan_paused'
  | 'plan_rollback'
  | 'plan_completed'
  | 'alert_shown'
  | 'alert_acked'
  | 'share_card_created'
  | 'baby_created'

export function track(name: AnalyticsEvent, props: Record<string, unknown> = {}): void {
  void (async () => {
    try {
      await ensureSession()
      const { error } = await supabase
        .from('analytics_events')
        .insert({ name, props: props as Json })
      if (error) console.warn('[analytics]', error.message)
    } catch (error) {
      console.warn('[analytics] dropped', error)
    }
  })()
}
