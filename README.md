# 转奶日记 (Milk Transfer Helper)

基于 Taro + React + TypeScript + Supabase 的微信小程序（家长端）+ Web 管理后台（运营端），帮助家长记录宝宝转奶过程，提供转奶记录和喂养知识文章；运营侧维护奶粉库、文章审核与转奶模板。

## 仓库结构（pnpm monorepo）

```
apps/
  miniapp/        # 小程序（Taro 4 + React 18，主端微信 weapp，兼顾 H5）
  admin/          # 管理后台（Vite + React 18 + antd 5 + TanStack Router）
  backend/        # 小程序后端服务（FastAPI：鉴权代理 + 数据白名单透传，见 apps/backend/README.md）
packages/
  shared/         # 跨端共享数据库类型（纯类型包，源码分发）
supabase/
  migrations/     # 数据库迁移
  functions/      # Edge Functions（wechat-login 登录迁移、admin-stats 看板聚合）
docs/
  spec/           # 需求规格（唯一事实源，FR 编号登记在 spec README）
  ui/             # UI 设计文件（ui.pen 小程序 / admin.pen 管理端）+ 设计规范
```

## 技术栈

- **小程序**：Taro 4 + React 18 + TypeScript（strict）+ Taroify + ECharts 5（按需引入）
- **管理后台**：Vite + React 18 + antd 5 + @tanstack/react-router + @tanstack/react-query + recharts
- **后端**：Supabase（PostgreSQL + Auth + RLS 行级安全 + Edge Functions）
- **测试**：Vitest（两端）
- **包管理**：pnpm workspace

## 数据安全模型

客户端通过 **Supabase 匿名登录**（`signInAnonymously`）获得设备级身份，数据隔离完全由数据库端 **RLS** 保证：

- 用户表的 `user_id` 列默认值是 `auth.uid()`，**客户端不传该字段**，无法伪造他人身份；
- 所有读写策略面向 `authenticated` 角色，只能访问自己的数据；
- **管理后台只持有 anon key**：管理员 = Auth 邮箱账号 + `admins` 白名单表，写权限由 RLS 的 `is_admin()` 裁决；`service_role` 仅存在于 `admin-stats` Edge Function 服务端；
- 微信登录（`wechat-login`）将 openid 关联到同一 `auth.users`，匿名数据平滑迁移。

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

```bash
cp apps/miniapp/.env.example apps/miniapp/.env
cp apps/admin/.env.example apps/admin/.env
```

分别填写 Supabase 项目 URL 和 Anon Key（Dashboard → Project Settings → API）。

### 3. 初始化数据库

- Supabase Dashboard → **Authentication → Sign In / Up** 中启用 **Anonymous sign-ins**（必须）；
- 依次在 SQL Editor 执行 `supabase/migrations/` 下的迁移文件（按文件名日期顺序）；
- 管理后台首个管理员引导见迁移文件 `20260909120000_admin_console.sql` 尾部注释；
- Edge Functions 部署：`supabase functions deploy wechat-login --no-verify-jwt`、`supabase functions deploy admin-stats`。

### 4. 运行

```bash
pnpm dev:weapp    # 微信小程序（微信开发者工具导入 apps/miniapp）
pnpm dev:h5       # H5
pnpm dev:admin    # 管理后台（http://localhost:5174）
```

## 质量保障（提交前必须全绿）

```bash
pnpm typecheck    # 两端 tsc --noEmit
pnpm lint         # 两端 ESLint（miniapp: eslint-config-taro；admin: typescript-eslint + prettier）
pnpm test         # 两端 Vitest
pnpm build:weapp  # 小程序生产构建
pnpm build:admin  # 管理后台生产构建
```

部署（GitHub Actions + Vercel + Supabase）：见 [docs/deploy.md](docs/deploy.md)。

## 管理后台（apps/admin）

需求规格见 `docs/spec/modules/J-admin-console.md`（FR-J1~J5），UI 设计见 `docs/ui/admin.pen`（规范 `docs/ui/ADMIN-DESIGN-GUIDELINES.md`）：

- **登录**：邮箱密码 + `admins` 白名单，非白名单账号拒绝；
- **奶粉库**：SKU 增删改查、上下架、CSV 批量导入（模板下载、本地校验、业务键 upsert，TY 注册号自动加特医标记）；
- **文章管理**：撰写/编辑 + 审核流转（仅 `approved` 对小程序可见）；
- **转奶模板**：逐日节奏结构化编辑，内容变更自动 `version +1`（进行中计划锁定创建时版本）；
- **数据看板**：`admin-stats` 服务端聚合的用户/计划/埋点指标。

## 目录结构（apps/miniapp）

```
apps/miniapp/src/
  assets/         # 静态资源（tab 图标）
  components/     # 公共组件（Chart：按需 ECharts 封装）
  config/         # 环境变量出口
  pages/          # 主包页面
  packages/<域>/  # 业务域分包页面（plan/record/baby/milk/report/alert/article）
  services/       # Supabase 数据服务层
  types/          # 数据库类型（转发 @milk-transfer/shared）+ 派生行类型
  utils/          # 纯函数工具 + 单测
```

## 注意事项

- `feed_time` 表单值 `YYYY-MM-DD HH:mm` 必须经 `utils/date.ts` 的 `parseLocalDateTime` 解析——iOS JavaScriptCore 不支持该格式的 `new Date()` 直接解析；
- ECharts 已按需注册（折线图 + 网格/提示），新增图表类型时需在 `components/Chart` 中补充 `echarts.use([...])`；
- Anon Key 属公开客户端凭据，所有数据安全边界都在 RLS 策略上，切勿为图省事关闭 RLS；
- 仓库协作规范（开发流程、命名、质量门）见 `AGENTS.md`。
