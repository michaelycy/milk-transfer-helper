# 转奶日记 API（FastAPI）

小程序后端：鉴权代理（GoTrue）+ 数据白名单透传（PostgREST）+ 微信登录（code2session）。
行级数据隔离由 Supabase RLS 强制（用户 JWT 透传），服务端仅持有一把 service_role 密钥用于建号/迁移。

## 本地开发

```bash
cp .env.example .env   # 填写 SUPABASE_SERVICE_ROLE_KEY 与 WECHAT_SECRET
uv sync
uv run uvicorn app.main:app --reload --port 8000
uv run pytest          # 测试
uv run ruff check .    # lint
```

## 接口

路径分层契约见 `docs/spec/05-api-guidelines.md`（v2.0-draft11 起强制）：

- `GET  /healthz` — 健康检查（唯一无版本端点）
- `POST /v1/auth/anonymous` — 匿名登录（GoTrue signup 代理）
- `POST /v1/auth/wechat` — 微信登录（code2session + 匿名数据迁移，移植自 wechat-login Edge Function）
- `POST /v1/auth/refresh` — 刷新会话（refresh_token grant 代理）
- `POST /v1/auth/logout` — 登出
- `GET  /v1/auth/me?jwt=` — 当前用户
- `POST /v1/db/tables/{table}/query|insert|update|delete` — 白名单表数据操作（表名在路径中，Bearer 用户 JWT，RLS 强制隔离）
- `POST /v1/db/rpc/{fn}` — RPC 白名单（get_record_stats / increment_read_count）
- `GET  /v1/ai/scenes/{scene}/config` · `POST /v1/ai/chat` · `POST /v1/ai/analyze` — AI 助手（C 端）
- `GET|PUT /v1/admin/ai/providers/...` · `POST /v1/admin/ai/providers/probe` — 模型接入管理（管理端）
- `GET  /v1/admin/logs` — API 运行日志查询（FR-J12，管理端）

每个业务请求响应携带 `X-Request-Id`，与 `api_logs` 表一一对应，可按其精确检索日志（管理后台 → 运行日志）。

## 部署

容器已就绪（见 Dockerfile）：微信云托管（callContainer 免备案）或任意容器平台均可直跑，
环境变量见 `.env.example`。
