// Supabase Edge Function：admin-stats（管理后台数据看板，FR-H4「看板走服务端角色」）
//
// 部署：
//   supabase functions deploy admin-stats
//   （SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY 为平台自动注入的 secrets，无需手动 set）
//
// 职责：
//   1. 校验调用者是管理员（请求头 JWT → auth.getUser → admins 白名单），非管理员一律 403
//   2. 用 service_role 在服务端聚合运营指标（analytics_events 对任何客户端都无 select 权限，03 §2）：
//      用户规模、进行中计划、近 30 天事件汇总、关键事件按日序列、文章阅读 Top
//
// 客户端调用（apps/admin/src/services/stats.service.ts）：
//   supabase.functions.invoke('admin-stats', { body: { days: 30 } })

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** 参与按日趋势的关键事件（00-glossary §5） */
const TREND_EVENTS = ['app_launch', 'plan_created', 'feed_recorded']

Deno.serve(async (req) => {
  try {
    // 1. 鉴权：调用者 JWT → 管理员白名单
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'unauthorized' }, 401)

    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { data: userData, error: userError } = await anon.auth.getUser(token)
    if (userError || !userData.user) return json({ error: 'unauthorized' }, 401)

    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { data: adminRow } = await service
      .from('admins')
      .select('user_id')
      .eq('user_id', userData.user.id)
      .maybeSingle()
    if (!adminRow) return json({ error: 'forbidden: not an admin' }, 403)

    // 2. 聚合（近 N 天，默认 30）
    const { days: daysRaw } = await req.json().catch(() => ({ days: 30 }))
    const days = Math.min(Math.max(Number(daysRaw) || 30, 1), 90)
    const since = new Date(Date.now() - days * 86400_000).toISOString()

    const [users, activePlans, totalPlans, eventTotals, trendRaw, articleTops] = await Promise.all([
      service.from('users').select('id', { count: 'exact', head: true }),
      service.from('transfer_plans').select('id', { count: 'exact', head: true }).in('status', ['active', 'paused']),
      service.from('transfer_plans').select('id', { count: 'exact', head: true }),
      service.from('analytics_events').select('name')
        .gte('occurred_at', since),
      service.from('analytics_events').select('name, occurred_at')
        .in('name', TREND_EVENTS)
        .gte('occurred_at', since),
      service.from('analytics_events').select('props')
        .eq('name', 'article_read')
        .gte('occurred_at', since),
    ])

    // 事件汇总
    const eventsByName = new Map<string, number>()
    for (const row of eventTotals.data ?? []) {
      eventsByName.set(row.name, (eventsByName.get(row.name) ?? 0) + 1)
    }

    // 关键事件按日序列
    const trendByDay = new Map<string, Record<string, number>>()
    for (const row of trendRaw.data ?? []) {
      const day = String(row.occurred_at).slice(0, 10)
      const bucket = trendByDay.get(day) ?? Object.fromEntries(TREND_EVENTS.map((n) => [n, 0]))
      bucket[row.name] += 1
      trendByDay.set(day, bucket)
    }
    const trend = [...trendByDay.entries()]
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => (a.date < b.date ? -1 : 1))

    // 文章阅读 Top（props: { article_id, title }，取 title 兜底 article_id）
    const readsByArticle = new Map<string, number>()
    for (const row of articleTops.data ?? []) {
      const key = String(row.props?.title ?? row.props?.article_id ?? '未知')
      readsByArticle.set(key, (readsByArticle.get(key) ?? 0) + 1)
    }
    const topArticles = [...readsByArticle.entries()]
      .map(([title, count]) => ({ title, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    return json({
      window: { days, since },
      users: users.count ?? 0,
      plans: { active: activePlans.count ?? 0, total: totalPlans.count ?? 0 },
      eventsByName: Object.fromEntries([...eventsByName.entries()].sort((a, b) => b[1] - a[1])),
      trend,
      topArticles,
    })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
