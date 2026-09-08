# 婴儿转奶助手 (Milk Transfer Helper)

基于 Taro + React + TypeScript + Supabase 的微信小程序，帮助家长记录宝宝转奶过程，提供转奶记录和喂养知识文章。

## 技术栈

- **前端框架**：Taro 4 + React 18 + TypeScript（strict）
- **UI 组件库**：Taroify（@taroify/core，主题色经 CSS 变量 `--primary-color` 覆盖）
- **图表库**：ECharts 5（`echarts/core` 按需引入，自研 Canvas 封装）
- **后端服务**：Supabase（PostgreSQL + Auth 匿名登录 + RLS 行级安全）
- **测试**：Vitest
- **包管理**：pnpm

## 数据安全模型

客户端通过 **Supabase 匿名登录**（`signInAnonymously`）获得设备级身份，数据隔离完全由数据库端 **RLS** 保证：

- `records` 等表的 `user_id` 列默认值是 `auth.uid()`，**客户端不传该字段**，无法伪造他人身份；
- 所有读写策略面向 `authenticated` 角色，只能访问自己的数据；
- 后续接入微信登录时，将 openid 关联到同一 `auth.users` 即可平滑升级，历史数据不丢。

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

填写你的 Supabase 项目 URL 和 Anon Key（Dashboard → Project Settings → API）。

### 3. 初始化数据库

- 在 Supabase Dashboard → **Authentication → Sign In / Up** 中启用 **Anonymous sign-ins**（必须）。
- 执行 `supabase/migrations/20240523000000_init_schema.sql`：
  - 全新项目直接在 SQL Editor 中运行；
  - 已应用过旧版 schema 的项目请先 `supabase db reset`，避免残留的宽授权与外键冲突。

### 4. 运行

```bash
pnpm dev:weapp   # 微信小程序（微信开发者工具导入项目根目录）
pnpm dev:h5      # H5
```

## 质量保障

```bash
pnpm lint        # ESLint（eslint-config-taro/react）
pnpm typecheck   # tsc --noEmit
pnpm test        # Vitest 单元测试（日期兼容性、图表聚合等纯函数）
pnpm build:weapp # 生产构建
```

## 目录结构

```
src/
  assets/         # 静态资源（tab 图标）
  components/     # 公共组件（Chart：按需 ECharts 封装）
  config/         # 环境变量出口
  pages/          # 页面
    index/        # 首页（最近记录）
    records/      # 记录页（列表/图表、分页加载、增删）
    articles/     # 知识文章（搜索、分类、详情）
    profile/      # 个人中心（统计 RPC）
  services/       # Supabase 数据服务层（内聚会话管理）
  types/          # Database 类型 + 派生行类型
  utils/          # 纯函数工具（date/chart/error/auth）+ 单测
  app.config.ts   # 全局配置
supabase/
  migrations/     # 数据库迁移（基线 schema + RLS + RPC）
```

## 注意事项

- `feed_time` 表单值 `YYYY-MM-DD HH:mm` 必须经 `utils/date.ts` 的 `parseLocalDateTime` 解析——iOS JavaScriptCore 不支持该格式的 `new Date()` 直接解析。
- ECharts 已按需注册（折线图 + 网格/提示），新增图表类型时需在 `components/Chart` 中补充 `echarts.use([...])`。
- Anon Key 属公开客户端凭据，但所有数据安全边界都在 RLS 策略上，切勿为图省事关闭 RLS。
