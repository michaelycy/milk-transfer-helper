-- ============================================================
-- API 运行日志（FR-J12，v2.0-draft11）：请求级排障日志落库 + 管理端查询
--
-- 服务的 FR：J12（api_logs 表 + /v1/admin/logs 只读查询）；规范见 docs/spec/05-api-guidelines.md §4
-- 前置要求：20240523000000_init_schema.sql（users 表）
-- 回滚方式：drop table public.api_logs;（后端 ApiLogMiddleware 写入失败会静默降级，不影响业务）
--
-- 约束（NFR-7 / NFR-2）：
--   1. 普通 Postgres DDL，无 auth.* 引用；user_id 外键指向 public.users（用户主数据），删用户置空不留孤行
--   2. 不建任何客户端策略、不授任何授权：日志仅后端 service_role 写/读，管理端经 /v1/admin/logs 间接查询
--   3. 只记 request_id/method/path/status/level/duration_ms/user_id/message——不记请求体与凭证
--   4. 保留期默认 30 天（后端 API_LOG_RETENTION_DAYS，定时 DELETE，见 app/core/api_log.py）
-- ============================================================

create table if not exists public.api_logs (
  id bigserial primary key,
  request_id uuid not null,
  method varchar(10) not null,
  path varchar(200) not null,
  status integer not null,
  level varchar(10) not null default 'info' check (level in ('info', 'warn', 'error')),
  duration_ms integer,
  user_id uuid references public.users (id) on delete set null,
  message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_logs_created_at on public.api_logs (created_at desc);
create index if not exists idx_api_logs_level_created on public.api_logs (level, created_at desc);
create index if not exists idx_api_logs_request_id on public.api_logs (request_id);

-- ---------- RLS：启用且无任何策略（客户端零访问；service_role 不受 RLS 限制） ----------
alter table public.api_logs enable row level security;

-- ---------- 最小授权：不授予 anon/authenticated 任何权限 ----------
revoke all on public.api_logs from anon, authenticated;

-- ---------- 表与字段注释（自注释，便于库内直查） ----------
comment on table public.api_logs is 'API 运行日志（FR-J12）：后端为每个业务请求落一行，供管理后台「运行日志」页排障查询；与 FR-J11 合规审计（admin_audit_logs）分表，保留期默认 30 天';
comment on column public.api_logs.id is '自增主键';
comment on column public.api_logs.request_id is '请求唯一标识（UUID）：与响应头 X-Request-Id 一一对应，排障时据此关联客户端报错与服务端日志';
comment on column public.api_logs.method is 'HTTP 方法（GET/POST/PUT/PATCH/DELETE）';
comment on column public.api_logs.path is '请求路径（不含 query string，最长 200）；路径含表名/资源名，可区分业务';
comment on column public.api_logs.status is 'HTTP 状态码（客户端感知的业务状态）';
comment on column public.api_logs.level is '日志级别：4xx=warn、5xx 或未捕获异常=error、其余=info';
comment on column public.api_logs.duration_ms is '服务端处理耗时（毫秒），不含日志写入本身';
comment on column public.api_logs.user_id is '请求用户（JWT sub 解析，不验签；匿名/解析失败为 NULL）；仅排障归因用，权限判定不走此字段';
comment on column public.api_logs.message is '异常摘要（≤500 字，仅异常类型与消息）；成功请求为 NULL——不记录请求体与响应体（NFR-2）';
comment on column public.api_logs.created_at is '日志写入时间（数据库时钟）';
