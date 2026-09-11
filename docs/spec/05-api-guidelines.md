# 05 · 接口命名与演进规范（API Guidelines）

| 元素 | 内容 |
|---|---|
| 文档状态 | 已评审（随 v2.0-draft9 立项） |
| 上游文档 | [README.md](README.md)、[04-nfr.md](04-nfr.md)（NFR-7 可迁移性） |
| 约束范围 | 后端 `apps/backend` 全部对外端点；小程序 `apps/miniapp` 与管理端 `apps/admin` 的全部后端调用 |

> 本文档回答：对外接口长什么样、为什么这样长、改名要怎么改。**对外 API 是长期契约**（客户端发版后不可随时作废），实现层可以换——两者必须解耦。新增端点/参数前先读本文；与本文冲突的实现视为技术债登记。

## 1. 设计原则

1. **契约稳定，实现可换（NFR-7）**：客户端感知的只有「路径 + 方法 + 参数 + 响应信封」。Supabase（GoTrue/PostgREST）是过渡期实现适配层，其概念（PGRST 错误码、`Prefer` 头、`auth.uid()` 等）**不得成为对外契约的一部分**；迁移自建 PostgreSQL 时只允许替换 `app/core/supabase.py` 适配层与 RLS 等价物，路径与信封零变更。
2. **URL 语义自明**：看路径即知操作对象与意图。资源用名词（复数），动作不进路径（HTTP 方法表达）；确需表达的命令型动作（探测、登录等非 CRUD 语义）用动词子资源，如 `providers/{name}/probe`、`auth/wechat`。
3. **表名进路径**：数据网关类端点必须把操作对象（表/函数名）放进 URL，保证访问日志、审计、监控可区分业务（禁止出现「所有请求都是 `POST /query`」的不可观测形态）。
4. **版本化**：除健康检查（`/healthz`）外，全部端点带 `/v1` 前缀。破坏性变更（改响应结构、删字段、改语义）→ 升 `/v2` 并保留 v1 一个过渡期；加字段不升版。
5. **管理端与客户端物理隔离**：管理后台专用端点一律挂 `/v1/admin/**`（NFR-7「新增管理能力一律走后端 admin API」），与 C 端端点分开鉴权、分开限流、分开审计，禁止共用前缀。

## 2. 路径分层总表

| 前缀 | 归属 | 鉴权 | 说明 |
|---|---|---|---|
| `/healthz` | 基础设施 | 无 | 唯一无版本端点 |
| `/v1/auth/*` | 会话认证 | 匿名可调（本身即登录） | anonymous / wechat / refresh / logout / me |
| `/v1/db/*` | 数据网关（白名单透传） | 用户 JWT + RLS | `tables/{table}/{query\|insert\|update\|delete}`、`rpc/{fn}` |
| `/v1/ai/*` | AI 助手（C 端） | 用户 JWT | `scenes/{scene}/config`、`chat`、`analyze` |
| `/v1/admin/**` | 管理后台专用 | 用户 JWT + 管理员白名单 | 现含 `ai/providers/*`（密钥与探针）、`logs`（运行日志） |

命名细则：

- 路径段一律小写；业务资源用复数名词（`providers`）；数据网关内的表/函数段与数据库命名保持一致（snake_case），不二次翻译；
- 多级从属用路径表达归属：`/v1/admin/ai/providers/{provider}/key`（某供应商的密钥）优于把 `provider` 埋进 body；
- 查询类读操作优先 GET；参数放 query string。仅当参数结构复杂（如 AI 的 history 数组）才用 POST body；
- 端点函数名与路径语义一致（`scene_config` ↔ `scenes/{scene}/config`），代码可搜索性优先。

## 3. 参数与响应信封规范

- **参数命名**：JSON 出入参一律 snake_case（与数据库列名对齐，杜绝一层映射）；布尔值不缩写（`fallback_used` 而非 `fb`）；枚举值用小写下划线（`scene_disabled`、`on_shelf`）。
- **响应信封（现状约定，延续不新增形态）**：
  - 数据网关与 AI 端点：`{ status, data, error, count? }`，`status` 为业务真实状态码；
  - 认证端点：`{ status, body }`；
  - 客户端以信封内 `status` 为准做错误处理（兼容外层 HTTP 状态）。
- **新增端点优先直接使用 HTTP 状态码**（2xx/4xx/5xx 语义完整），信封仅承载业务载荷；错误响应体统一 `{ message, code?, details?, hint? }`。
- **分页**：列表类查询统一 `limit`（默认 50，单页上限 200）+ `offset`，总数经 `count` 返回。

## 4. 运行日志规范（FR-J12）

- **每个请求必须可追溯**：中间件为每个请求生成 `request_id`（UUID）并写入响应头 `X-Request-Id`，与 `api_logs` 表行一一对应；排障时「客户端提供 request_id → 管理端日志页检索」是第一定位手段。
- **记录字段**：request_id、method、path、status、level（info/warn/error，按状态码 4xx=warn、5xx/异常=error）、duration_ms、user_id（JWT sub，解析失败留空）、message（异常摘要，≤500 字）。
- **隐私红线（NFR-2）**：不记录请求体与响应体（可能含照片 base64、密钥、宝宝信息）；不记录 `authorization` 头；`message` 仅异常类型与摘要。
- **写入失败不影响业务**：日志写入为后台异步任务，失败仅 stderr 告警；`/healthz` 与 CORS 预检不记录。
- **保留期**：`API_LOG_RETENTION_DAYS`（默认 30 天）由后端定时清理，无界面删除入口；排查窗口外的历史问题以平台层日志为准。
- 与 FR-J11 的边界：J11 管「管理员做了什么」（合规审计，不可删改），J12 管「接口运行得怎么样」（技术排障，到期即清）——两表不混用。

## 5. 变更流程

1. 新增端点：按 §2 分层选前缀 → 按 §3 定参数与信封 → 后端实现 + 测试 → 本文档 §2 总表如涉及新前缀/新分组则同步更新；
2. 改名/下线旧端点：**先加新、后废旧**——旧路径保留一个过渡版本并在响应头加 `Deprecation: true`，前端全部切换后再删；
3. 前端禁止散落拼接 URL：各端 service 层集中管理路径常量，页面/组件不得直接写端点字符串。
