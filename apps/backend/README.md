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

- `GET  /healthz` — 健康检查
- `POST /auth/anonymous` — 匿名登录（GoTrue signup 代理）
- `POST /auth/wechat` — 微信登录（code2session + 匿名数据迁移，移植自 wechat-login Edge Function）
- `POST /auth/refresh` — 刷新会话（refresh_token grant 代理）
- `POST /auth/logout` — 登出
- `GET  /auth/me?jwt=` — 当前用户
- `POST /v1/query|insert|update|delete` — 白名单表数据操作（Bearer 用户 JWT，RLS 强制隔离）
- `POST /v1/rpc/{fn}` — RPC 白名单（get_record_stats / increment_read_count）

## 部署

容器已就绪（见 Dockerfile）：微信云托管（callContainer 免备案）或任意容器平台均可直跑，
环境变量见 `.env.example`。
