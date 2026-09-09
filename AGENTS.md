# AGENTS.md — 本仓库协作规则

婴儿转奶助手：Taro 4 + React 18 + TypeScript + Supabase 的多端小程序（主端微信 weapp，兼顾 H5）。详细技术栈与数据安全模型见 `README.md`。

## 常用命令

```bash
pnpm dev:weapp        # 微信小程序 watch 开发（H5 用 dev:h5）
pnpm build:weapp      # 生产构建
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint src（配置在 .eslintrc.js）
pnpm test             # vitest run（用例为 src/**/*.test.ts，与源码同目录）
```

**质量门：任何提交前 `typecheck`、`lint`、`test` 三项必须全部通过。**

## Git 提交

中文 conventional commits，scope 用业务域，多域逗号分隔：

```
feat(auth,pages): 实现FR-H5开屏页、登录门与全认证链路
fix(record): 修复转奶记录跨天排序
```

## 规格驱动开发

- 实现功能前先读 `docs/spec/`：模块规格在 `modules/`，数据模型以 `03-data-model.md` 为准，术语见 `00-glossary.md`。提交信息可引用 FR 编号（如 FR-H5）。
- 涉及 UI 的改动遵循 `docs/ui/DESIGN-GUIDELINES.md`（字阶白名单、lucide 图标、token 化颜色）。
- 数据库改动必须走 `supabase/migrations/` 新增迁移文件（日期前缀命名），遵循现有 RLS 策略：`user_id` 由数据库端 `auth.uid()` 默认，客户端不传、不可伪造。

## 代码组织与拆分

分层职责，新代码放对位置，不跨层：

| 目录 | 职责 | 约束 |
|---|---|---|
| `src/pages/` | 主包页面（tab 页等高频页） | 只做主端入口，保持薄 |
| `src/packages/<域>/pages/` | 业务域分包页面 | 新业务域建分包并在 `src/app.config.ts` 注册 `subPackages`，控制主包体积 |
| `src/services/` | Supabase 数据访问（每域一个 `*.service.ts`） | 页面/组件**禁止**直接 import `supabase`，必须走 service |
| `src/store/` | 跨页共享状态（React Context，`*.tsx`） | 仅放真正跨页的状态，页面私有状态用 useState |
| `src/components/` | 跨域共享 UI 组件 | 单域私有组件放在该域包内 |
| `src/utils/` | 纯函数（计算、校验、规则） | 必须可测试，配同目录 `*.test.ts` |
| `src/types/` | 共享类型，Row 类型以 `database.ts` 为准 | service 返回值用 Row 类型，不手写重复结构 |

统一模式（跟随现有代码，不自创风格）：

- service 统一为单例对象 + async 方法，`error` 即 throw，数据默认 `?? []`（参照 `src/services/milk.service.ts`）。
- 组件用函数组件 + hooks；导入用路径别名 `@/`。
- 超过约 200 行或多职责的组件拆子组件或抽自定义 hook；纯逻辑从组件抽到 `utils/` 并补测试。

## 兼容性（多端）

- 一律使用 `Taro.*` API，禁用 `wx.*`、`window`/`document` 等平台专属接口；平台差异用 `process.env.TARO_ENV` 条件分支。
- 样式用 sass + 普通 px（Taro 编译期转换 rpx/vw），避免小程序不支持的 CSS（通配符选择器、后代选择器过深、`*` 等）；browserslist 面向旧内核，避免过新的 JS/CSS 语法。
- ECharts 只从 `echarts/core` 按需引入，走 `src/components/Chart` 封装，不在页面直接操作图表实例。
- 日期处理统一走 `src/utils/date.ts`，不散落各处直接操作 `new Date()`。

## TypeScript

`tsconfig` 已开 `noImplicitAny` / `strictNullChecks` / `noUnusedLocals`：不写 `any`，可空值显式处理，删干净未用的导入和参数。
