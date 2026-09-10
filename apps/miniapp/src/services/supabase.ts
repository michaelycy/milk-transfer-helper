import Taro from '@tarojs/taro'
import type { Database } from '../types/database'

/**
 * Supabase REST 薄客户端（方案 D）：
 * 服务层调用面与 supabase-js 保持同形（from/rpc/auth/functions），
 * 底层改为 Taro.request 调用自建 FastAPI（/v1/*、/auth/*）。
 *
 * 网络栈：Taro.request + JSON，无任何浏览器全局依赖。
 * 会话：access/refresh token 持久化于 Taro 存储，过期自动刷新。
 */

const API_BASE = process.env.TARO_APP_API_BASE_URL || 'http://localhost:8000'
const SESSION_KEY = 'supabase:session'

export interface ApiError {
  message: string
  code?: string | null
  details?: unknown
  hint?: string | null
}

export interface ApiSession {
  access_token: string
  refresh_token: string
  expires_at?: number
  user?: { id: string; [key: string]: unknown }
  [key: string]: unknown
}

export interface ApiResult<Row> {
  data: Row
  error: ApiError | null
  count?: number
}

export type RowList<Row> = ApiResult<Row[]>

// ---------- 会话存取 ----------

function loadSession(): ApiSession | null {
  const stored = Taro.getStorageSync(SESSION_KEY)
  return stored && typeof stored === 'object' ? (stored as ApiSession) : null
}

function saveSession(session: ApiSession | null): void {
  if (session) Taro.setStorageSync(SESSION_KEY, session)
  else Taro.removeStorageSync(SESSION_KEY)
}

// ---------- 会话生命周期（数据请求自愈） ----------

type SessionInvalidListener = () => void
let sessionInvalidListener: SessionInvalidListener | null = null

/** 注册会话彻底失效回调（返回解绑函数）：数据层刷新会话被服务端拒绝时触发 */
export function onSessionInvalid(listener: SessionInvalidListener | null): () => void {
  sessionInvalidListener = listener
  return () => {
    if (sessionInvalidListener === listener) sessionInvalidListener = null
  }
}

/** 会话已死：清本地凭证并通知 UI 层回落登录门 */
function clearSession(): void {
  saveSession(null)
  sessionInvalidListener?.()
}

/** 单飞刷新：并发请求共享同一次 refresh，避免 refresh token 轮换被并发用废 */
let refreshingPromise: Promise<ApiSession | null> | null = null

function refreshSessionCached(session: ApiSession): Promise<ApiSession | null> {
  if (!refreshingPromise) {
    refreshingPromise = refreshSession(session)
      .then((res) => {
        if (res.data) return res.data
        // 服务端明确拒绝（refresh token 失效/已被轮换）：会话无法自愈，清理并通知
        clearSession()
        return null
      })
      .finally(() => {
        refreshingPromise = null
      })
  }
  return refreshingPromise
}

/**
 * 取可用于数据请求的会话：
 * 临期（余量 < 60s）或缺 expires_at（旧版会话字段缺失）时先刷新补全；
 * 刷新被拒返回 null（本地会话已一并清理），网络异常向上抛（与请求不可达同路径）。
 */
async function getValidSession(): Promise<ApiSession | null> {
  const session = loadSession()
  if (!session?.access_token) return null
  const expiresMs = typeof session.expires_at === 'number' ? session.expires_at * 1000 : null
  if (expiresMs !== null && expiresMs >= Date.now() + 60_000) return session
  return refreshSessionCached(session)
}

// ---------- 传输层 ----------

interface TransportResult {
  status: number
  body: Record<string, unknown>
}

interface TaroResponseLike {
  statusCode: number
  data: unknown
  header?: Record<string, unknown>
}

async function httpRequest(options: {
  url: string
  method: 'GET' | 'POST'
  data?: Record<string, unknown>
  header?: Record<string, string>
}): Promise<TaroResponseLike> {
  try {
    const res = await Taro.request(options)
    return { statusCode: res.statusCode, data: res.data, header: res.header }
  } catch (err) {
    // 网络层失败（后端未启动 / 域名被 DevTools 拦截等）：转成带原因的 Error
    const errMsg = (err as { errMsg?: string })?.errMsg ?? '网络请求失败'
    throw new Error(`API 不可达：${errMsg}`)
  }
}

async function transport(
  path: string,
  body: Record<string, unknown>,
  bearerToken?: string,
): Promise<TransportResult> {
  const token = bearerToken ?? loadSession()?.access_token
  const res = await httpRequest({
    url: `${API_BASE}${path}`,
    method: 'POST',
    data: body,
    header: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  return {
    status: res.statusCode,
    body: (res.data ?? {}) as Record<string, unknown>,
  }
}

/** /auth/* 接口返回 {status, body} 信封：拆出内层 body 与真实状态码 */
function unwrapAuth(res: TransportResult): TransportResult {
  const data = res.body as { status?: unknown; body?: unknown }
  if (data && typeof data === 'object' && 'status' in data && 'body' in data) {
    return {
      status: typeof data.status === 'number' ? data.status : res.status,
      body: (data.body ?? {}) as Record<string, unknown>,
    }
  }
  return res
}

async function authPost(path: string, body: Record<string, unknown>): Promise<TransportResult> {
  return unwrapAuth(await transport(path, body))
}

function toApiError(body: unknown, fallbackStatus: number): ApiError {
  if (body && typeof body === 'object') {
    const raw = body as Record<string, unknown>
    // GoTrue 错误体字段为 { code, error_code, msg }；PostgREST 为 { message, code, details, hint }
    const message =
      (typeof raw.msg === 'string' && raw.msg) ||
      (typeof raw.message === 'string' && raw.message) ||
      (typeof raw.error === 'string' && raw.error) ||
      (typeof raw.detail === 'string' && raw.detail) ||
      `请求失败（HTTP ${fallbackStatus}）`
    const code =
      (typeof raw.error_code === 'string' && raw.error_code) ||
      (typeof raw.code === 'string' && raw.code) ||
      null
    return {
      message,
      code: code || null,
      details: raw.details ?? null,
      hint: typeof raw.hint === 'string' ? raw.hint : null,
    }
  }
  return { message: `请求失败（HTTP ${fallbackStatus}）` }
}

// ---------- 查询构建器 ----------

interface Filter {
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'ilike' | 'in' | 'or'
  col: string
  value: string
}

interface OrderItem {
  col: string
  ascending: boolean
}

export type ApiRow = Record<string, unknown>

type Tables = Database['public']['Tables']
export type TableRow<Table extends keyof Tables> = Tables[Table]['Row']

type MutationMode = 'select' | 'insert' | 'update' | 'delete'
type SingleMode = 'none' | 'one' | 'maybe'

/** 未带 single/maybeSingle 的链式调用：结果为行数组 */
export class QueryBuilder<Row extends ApiRow = ApiRow> {
  protected table: string
  protected mode: MutationMode = 'select'
  protected selectExpr = '*'
  protected countExact = false
  protected values: Record<string, unknown> | null = null
  protected onConflict: string | null = null
  protected filters: Filter[] = []
  protected orders: OrderItem[] = []
  protected limitN: number | null = null
  protected rangeN: [number, number] | null = null
  protected singleMode: SingleMode = 'none'

  constructor(table: string) {
    this.table = table
  }

  select(columns = '*', options?: { count?: 'exact' }): this {
    this.selectExpr = columns
    if (options?.count === 'exact') this.countExact = true
    return this
  }

  eq(col: keyof Row & string, value: string | number | boolean): this {
    this.filters.push({ op: 'eq', col, value: String(value) })
    return this
  }

  neq(col: keyof Row & string, value: string | number): this {
    this.filters.push({ op: 'neq', col, value: String(value) })
    return this
  }

  gt(col: keyof Row & string, value: string | number): this {
    this.filters.push({ op: 'gt', col, value: String(value) })
    return this
  }

  gte(col: keyof Row & string, value: string | number): this {
    this.filters.push({ op: 'gte', col, value: String(value) })
    return this
  }

  lt(col: keyof Row & string, value: string | number): this {
    this.filters.push({ op: 'lt', col, value: String(value) })
    return this
  }

  lte(col: keyof Row & string, value: string | number): this {
    this.filters.push({ op: 'lte', col, value: String(value) })
    return this
  }

  ilike(col: keyof Row & string, pattern: string): this {
    this.filters.push({ op: 'ilike', col, value: pattern })
    return this
  }

  in(col: keyof Row & string, values: string[]): this {
    this.filters.push({ op: 'in', col, value: values.join(',') })
    return this
  }

  or(expr: string): this {
    this.filters.push({ op: 'or', col: '', value: expr })
    return this
  }

  order(col: keyof Row & string, options?: { ascending?: boolean }): this {
    this.orders.push({ col, ascending: options?.ascending ?? true })
    return this
  }

  limit(n: number): this {
    this.limitN = n
    return this
  }

  range(offset: number, to: number): this {
    this.rangeN = [offset, to]
    return this
  }

  insert(values: Partial<Row> | Array<Partial<Row>>): this {
    this.mode = 'insert'
    this.values = Array.isArray(values) ? values[0] : values
    return this
  }

  upsert(values: Partial<Row>, options?: { onConflict?: string }): this {
    this.mode = 'insert'
    this.values = values
    if (options?.onConflict) this.onConflict = options.onConflict
    return this
  }

  update(values: Partial<Row>): this {
    this.mode = 'update'
    this.values = values
    return this
  }

  delete(): this {
    this.mode = 'delete'
    return this
  }

  /** 单行返回（0 行或 1 行均可，data 可能为 null） */
  maybeSingle(): SingleQueryBuilder<Row, true> {
    return new SingleQueryBuilder<Row, true>(this.snapshot('maybe'))
  }

  /** 单行返回（严格：0 行或多行会返回 PGRST116 错误） */
  single(): SingleQueryBuilder<Row, false> {
    return new SingleQueryBuilder<Row, false>(this.snapshot('one'))
  }

  protected snapshot(singleMode?: SingleMode): BuilderState {
    return {
      table: this.table,
      mode: this.mode,
      selectExpr: this.selectExpr,
      countExact: this.countExact,
      values: this.values,
      onConflict: this.onConflict,
      filters: this.filters,
      orders: this.orders,
      limitN: this.limitN,
      rangeN: this.rangeN,
      singleMode: singleMode ?? this.singleMode,
    }
  }

  then<TResult1 = ApiResult<Row[]>, TResult2 = never>(
    onfulfilled?: ((value: ApiResult<Row[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return execBuilder(this.snapshot()).then(
      onfulfilled as ((value: ApiResult<ApiRow | ApiRow[] | null>) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected,
    )
  }
}

/** 单行查询结果：single → data: Row；maybeSingle → data: Row | null */
export class SingleQueryBuilder<
  Row extends ApiRow,
  Nullable extends boolean = false,
> {
  constructor(private readonly state: BuilderState) {
    this.state.singleMode = this.state.singleMode === 'one' ? 'one' : 'maybe'
  }

  then<
    TResult1 = ApiResult<Nullable extends true ? Row | null : Row>,
    TResult2 = never,
  >(
    onfulfilled?:
      | ((value: ApiResult<Nullable extends true ? Row | null : Row>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return execBuilder(this.state).then(
      onfulfilled as ((value: ApiResult<ApiRow | ApiRow[] | null>) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected,
    )
  }
}

interface BuilderState {
  table: string
  mode: MutationMode
  selectExpr: string
  countExact: boolean
  values: Record<string, unknown> | null
  onConflict: string | null
  filters: Filter[]
  orders: OrderItem[]
  limitN: number | null
  rangeN: [number, number] | null
  singleMode: SingleMode
}

// ---------- 执行 ----------

/** 后端把 PostgREST 真实状态装进信封体（外层 HTTP 恒为 200）；FastAPI 层错误才是真实状态码 */
function resultStatus(res: TransportResult): number {
  const inner = res.body.status
  return typeof inner === 'number' ? inner : res.status
}

/** 信封 error 优先；FastAPI 层错误体是 {detail}（表白名单/缺凭证等），归一为 ApiError 避免被吞成空数据 */
function errorOf(res: TransportResult): ApiError | null {
  const raw = (res.body.error ?? null) as ApiError | null
  if (raw || resultStatus(res) < 400) return raw
  return toApiError(res.body, resultStatus(res))
}

function readResult(
  res: TransportResult,
  singleMode: SingleMode,
): ApiResult<ApiRow | ApiRow[] | null> {
  const count = typeof res.body.count === 'number' ? res.body.count : undefined
  if (resultStatus(res) >= 400) {
    return { data: null, error: errorOf(res), count }
  }
  const data = (res.body.data ?? null) as ApiRow | ApiRow[] | null
  if (singleMode === 'one' || singleMode === 'maybe') {
    const row = Array.isArray(data) ? (data[0] ?? null) : (data ?? null)
    return { data: row, error: errorOf(res), count }
  }
  return { data, error: errorOf(res), count }
}

async function execBuilder(state: BuilderState): Promise<ApiResult<ApiRow | ApiRow[] | null>> {
  const session = await getValidSession()
  if (!session) {
    // 未登录时数据接口不可用，读写一视同仁本地短路，请求不出网（服务端同样会以 401 拒绝）
    return { data: null, error: { message: '未登录' } }
  }

  let path = '/v1/query'
  let payload: Record<string, unknown>

  if (state.mode === 'select') {
    payload = {
      table: state.table,
      select: state.selectExpr,
      filters: state.filters,
      order: state.orders,
      limit: state.limitN ?? undefined,
      range_from: state.rangeN?.[0] ?? undefined,
      range_to: state.rangeN?.[1] ?? undefined,
      count: state.countExact || undefined,
    }
  } else if (state.mode === 'insert') {
    path = '/v1/insert'
    payload = {
      table: state.table,
      values: state.values,
      select: state.selectExpr,
      on_conflict: state.onConflict ?? undefined,
    }
  } else if (state.mode === 'update') {
    path = '/v1/update'
    payload = { table: state.table, values: state.values, filters: state.filters }
  } else {
    path = '/v1/delete'
    payload = { table: state.table, filters: state.filters }
  }

  // 压缩 undefined 字段
  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) delete payload[key]
  })

  let res = await transport(path, payload, session.access_token)
  // access token 恰在请求途中失效（服务端 401）：刷新一次并重试一次。
  // 若期间会话已被其他流程刷新（token 已变化），直接用新凭证重试，避免拿旧 refresh token 误刷
  if (resultStatus(res) === 401) {
    const current = loadSession()
    const retrySession =
      current && current.access_token !== session.access_token
        ? current
        : await refreshSessionCached(session)
    if (retrySession) res = await transport(path, payload, retrySession.access_token)
  }
  return readResult(res, state.singleMode)
}

// ---------- 客户端主体 ----------

function from<Table extends keyof Tables & string>(
  table: Table,
): QueryBuilder<TableRow<Table>> {
  return new QueryBuilder<TableRow<Table>>(table)
}

async function rpc(fnName: string, args: Record<string, unknown> = {}): Promise<ApiResult<unknown>> {
  const session = await getValidSession()
  if (!session) return { data: null, error: { message: '未登录' } }
  const res = await transport(`/v1/rpc/${fnName}`, { args }, session.access_token)
  return {
    data: (res.body.data ?? null) as unknown,
    error: errorOf(res),
  }
}

async function refreshSession(session: ApiSession): Promise<ApiResult<ApiSession | null>> {
  const res = await authPost('/auth/refresh', {
    refresh_token: session.refresh_token,
  })
  const body = res.body
  if (res.status >= 400 || !body.access_token) {
    return { data: null, error: { message: '会话已过期，请重新登录' } }
  }
  const next: ApiSession = {
    ...session,
    access_token: String(body.access_token),
    refresh_token: String(body.refresh_token ?? session.refresh_token),
    // 必须写回新过期时间：沿用旧值会让下一次请求立刻再次触发刷新（并白白轮换 refresh token）
    expires_at:
      typeof body.expires_at === 'number'
        ? body.expires_at
        : typeof body.expires_in === 'number'
          ? Math.round(Date.now() / 1000) + body.expires_in
          : session.expires_at,
    user: (body.user as ApiSession['user']) ?? session.user,
  }
  saveSession(next)
  return { data: next, error: null }
}

const auth = {
  async signInAnonymously(): Promise<ApiResult<{ user: { id: string } | null }>> {
    const res = await authPost('/auth/anonymous', {})
    const body = res.body
    if (res.status >= 400) {
      return { data: { user: null }, error: toApiError(body, res.status) }
    }
    if (typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string') {
      return { data: { user: null }, error: { message: '匿名登录失败：服务端未返回会话' } }
    }
    const session: ApiSession = {
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      expires_at: typeof body.expires_at === 'number' ? body.expires_at : undefined,
      user: body.user as ApiSession['user'],
    }
    saveSession(session)
    return { data: { user: session.user ?? null }, error: null }
  },

  async getSession(): Promise<ApiResult<{ session: ApiSession | null }>> {
    // 与数据请求同一套会话自愈逻辑：临期/缺 expires_at 先刷新，已死则返回 null（由调用方重登）
    const session = await getValidSession()
    return { data: { session }, error: null }
  },

  async setSession(params: {
    access_token: string
    refresh_token: string
    /** 过期时间（秒级时间戳）；微信登录路径必须携带，否则会话永不刷新 */
    expires_at?: number
  }): Promise<ApiResult<null>> {
    // 校验并取回用户信息
    const res = await httpRequest({
      url: `${API_BASE}/auth/me`,
      method: 'GET',
      data: {},
      header: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.access_token}`,
      },
    })
    const body = (res.data ?? {}) as Record<string, unknown>
    if (res.statusCode >= 400) {
      return { data: null, error: { message: String(body.msg ?? body.error ?? '会话无效') } }
    }
    const session: ApiSession = {
      access_token: params.access_token,
      refresh_token: params.refresh_token,
      expires_at: params.expires_at,
      user: body as ApiSession['user'],
    }
    saveSession(session)
    return { data: null, error: null }
  },

  async signOut(): Promise<ApiResult<null>> {
    const session = loadSession()
    if (session?.access_token) {
      try {
        await authPost('/auth/logout', { access_token: session.access_token })
      } catch {
        // 登出尽力而为：本地会话必然清除
      }
    }
    saveSession(null)
    return { data: null, error: null }
  },
}

const functions = {
  async invoke(
    name: string,
    options?: { body?: Record<string, unknown> },
  ): Promise<ApiResult<Record<string, unknown> | null>> {
    if (name === 'wechat-login') {
      const res = await authPost('/auth/wechat', options?.body ?? {})
      if (res.status >= 400 || res.body.error) {
        return { data: null, error: { message: String(res.body.error ?? '微信登录失败') } }
      }
      return { data: res.body, error: null }
    }
    return { data: null, error: { message: `未知的函数 ${name}` } }
  },
}

export const supabase = { from, rpc, auth, functions }
