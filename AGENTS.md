# AGENTS.md — 本仓库协作规则

婴儿转奶助手：Taro 4 + React 18 + TypeScript + Supabase 的多端小程序（主端微信 weapp，兼顾 H5）+ Web 管理后台（apps/admin）。详细技术栈与数据安全模型见 `README.md`。

## 开发流程规范（所有功能必须遵循）

**需求梳理 → 产出 spec（docs/spec/modules/）→ UI 设计图（docs/ui/*.pen）→ 代码。**

- spec 先行：任何功能动代码前，对应模块文档（FR 编号、验收标准、依赖）必须存在并在 spec README 状态总表登记；
- UI 先于代码：页面类需求先在设计文件出画板（小程序 `docs/ui/ui.pen`，管理端 `docs/ui/admin.pen`），画板对照在模块文档「UI 画板对照」章节回链；
- 数据库改动走迁移文件、前端页面遵循下方分层约束，均以 spec 为准绳。

## 代码规范

- **文件与文件夹命名**：一律小写短横线（kebab-case，如 `page-header.tsx`、`milk.service.ts`），禁止大驼峰；React 组件的**类型名**仍用大驼峰（PascalCase），只是文件名小写。TanStack Router 等框架强制约定的文件名（`__root.tsx`、`_auth.tsx`）除外。
- **行尾分号**：所有 TS/JS 语句以分号结尾（admin 由 ESLint `semi` + Prettier 强制；小程序存量代码维持原风格，新文件一律分号）。
- **格式化**：apps/admin 使用 Prettier（`.prettierrc`：singleQuote、printWidth 100）。

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
- 涉及 UI 的改动遵循对应端的设计规范：小程序 `docs/ui/DESIGN-GUIDELINES.md`，管理端 `docs/ui/ADMIN-DESIGN-GUIDELINES.md`（两套 token 不互相复用，品牌色延续）；画布审计 `node docs/ui/audit.mjs ui.pen|admin.pen`。
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
