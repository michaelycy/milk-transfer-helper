// Supabase Edge Function：wechat-login（FR-H1 微信登录与数据迁移）
//
// 部署：
//   supabase functions deploy wechat-login --no-verify-jwt
//   supabase secrets set WECHAT_APPID=xxx WECHAT_SECRET=xxx
//
// 职责：
//   1. 用小程序 wx.login 的 code 换 openid（code2session）
//   2. 按 openid 查找/创建 users 记录（openid 唯一）
//   3. 签发 Supabase 会话（匿名会话升级为正式账号时，由服务端将匿名用户
//      的业务数据合并到正式账号——幂等可重试，失败不落库）
//
// 客户端调用（src/services/auth.service.ts → loginWechat）：
//   supabase.functions.invoke('wechat-login', { body: { code } })

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const { code, anonymousUserId } = await req.json()
    if (!code) return json({ error: 'missing code' }, 400)

    // 1. code2session 换 openid
    const appid = Deno.env.get('WECHAT_APPID')!
    const secret = Deno.env.get('WECHAT_SECRET')!
    const wxRes = await fetch(
      `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`,
    )
    const wx = await wxRes.json()
    if (!wx.openid) return json({ error: 'wechat auth failed', detail: wx }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // 2. 按 openid 找已有用户；没有则创建（users.openid 唯一）
    const { data: existing } = await admin
      .from('users')
      .select('id')
      .eq('openid', wx.openid)
      .maybeSingle()

    let userId: string
    if (existing) {
      userId = existing.id
    } else {
      // 创建正式账号；若携带匿名用户 id，则将其业务数据（feed_records 等）
      // 的 user_id 合并到新账号后删除匿名身份（幂等：重复调用无副作用）
      const { data: userData, error: userError } = await admin.auth.admin.createUser({
        user_metadata: { provider: 'wechat', openid: wx.openid },
      })
      if (userError) return json({ error: userError.message }, 500)
      userId = userData.id
      await admin.from('users').upsert({ id: userId, openid: wx.openid })

      if (anonymousUserId) {
        await migrateUserData(admin, anonymousUserId, userId)
        await admin.auth.admin.deleteUser(anonymousUserId)
      }
    }

    // 3. 签发 Supabase 会话（magic link 形态的 OTP token，客户端 setSession）
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: `${userId}@wechat.local`,
      options: { data: { provider: 'wechat' } },
    })
    if (linkError || !linkData.properties) return json({ error: 'sign-in failed' }, 500)

    const supabaseAnon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: sessionData, error: verifyError } = await supabaseAnon.auth.verifyOTP({
      type: 'magiclink',
      email: `${userId}@wechat.local`,
      token: linkData.properties.hashed_token,
    })
    if (verifyError || !sessionData.session) return json({ error: 'session failed' }, 500)

    return json({ session: sessionData.session })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

/** 匿名→微信数据迁移（幂等：先迁移再删除，重复执行无副作用） */
async function migrateUserData(admin: ReturnType<typeof createClient>, from: string, to: string) {
  for (const table of ['feed_records', 'symptom_logs', 'transfer_plans', 'alerts', 'favorites', 'weight_logs', 'babies']) {
    await admin.from(table).update({ user_id: to }).eq('user_id', from)
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
