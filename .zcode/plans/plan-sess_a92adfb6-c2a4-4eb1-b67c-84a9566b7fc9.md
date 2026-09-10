# 管理后台 + 标准 monorepo 重构实施方案（修订版）

修订点：路由改用 **@tanstack/react-router**（文件路由 + @tanstack/router-plugin）；仓库重构为**标准 pnpm monorepo**（apps/miniapp + apps/admin + packages/shared，根作纯编排层）。

## 阶段 1 · 仓库结构迁移（先迁移、后加新，迁移完质量门必须全绿再继续）

目标结构：

```
taro-milk-transfer-helper/
├─ pnpm-workspace.yaml        # packages: ['apps/*', 'packages/*']（保留 allowBuilds）
├─ package.json               # 纯编排层：typecheck/lint/test = pnpm -r run …，另留 dev:weapp/dev:h5/dev:admin/build:weapp/build:admin 快捷别名
├─ apps/
│  ├─ miniapp/                # git mv 迁入：src、config、project.config.json、babel.config.js、
│  │                          #   tsconfig.json、.eslintrc.js、vitest.config.ts、.env(.example)、原根 package.json 的应用部分
│  │                          #   包名 @milk-transfer/miniapp；微信开发者工具改为打开 apps/miniapp（project.config.json 均相对路径，无障碍）
│  └─ admin/                  # 新建：@milk-transfer/admin
├─ packages/shared/           # 新建：@milk-transfer/shared，包名导出 database.ts 全部类型 + 别名
├─ supabase/  docs/           # 原地不动
└─ README.md  AGENTS.md       # 同步更新
```

- **packages/shared 为纯类型包**（database.ts 全是 interface/type，无运行时代码）：以 TS 源码直接分发（`"types": "src/index.ts"`），**无需构建步骤**；git mv `src/types/database.ts` → `packages/shared/src/database.ts`，`apps/miniapp/src/types/database.ts` 变为一行 re-export，miniapp 现有 import 全部不动（零回归）；admin 直接依赖 shared。两端约定 `import type` 引用。
- 根 package.json 保留 `packageManager: pnpm@10.34.5`；应用级 browserslist/templateInfo 随 miniapp 走；`.gitignore` 的 `.env` 模式覆盖各 app 目录。

## 阶段 2 · 数据库迁移 `supabase/migrations/20260909000001_admin_console.sql`

头部注释按现有规范（服务的 FR / 前置 / 回滚 / 要点）。内容：

- `admins(user_id → auth.users on delete cascade, email, note, created_at)` 白名单表，RLS 允许 admin select 自己的行（登录后身份自检）；
- `public.is_admin()` 函数（security definer、stable、search_path 锁定）供 policy 复用；
- `milk_products`、`plan_templates`：insert/update/delete policy `to authenticated using is_admin()` + 对应 grant（policy 是门禁、grant 表意图，沿用现有注释风格）；
- `articles`：**顺带修复 G1 规格缺口**——drop 重建 `articles_public_read` 为 `review_status='approved'` 才公开可见（存量行默认 approved，无回归）；新增 admin 全量 select + update policy；`analytics_events` 不动（保持 insert-only，看板走服务端）；
- 文件尾注释写明首个管理员引导：Supabase Dashboard 建邮箱用户 → `insert into admins(user_id, email) values (…)`。

## 阶段 3 · Edge Function `supabase/functions/admin-stats/index.ts`

照抄 wechat-login 既有模式（头部部署注释 / esm.sh 导入 / secrets 注入）：取调用者 JWT → admin client 查 `admins` 校验身份（非 admin 403）→ service_role 聚合：用户总数、进行中计划数、近 7/30 天事件按 name 汇总、关键事件（app_launch/plan_created/feed_recorded）按日序列、文章阅读 Top → JSON 返回。**service_role 只存在于服务端**。

## 阶段 4 · apps/admin 实现（Vite + React 18 + TS + antd 5 + TanStack Router + Query）

```
apps/admin/
  package.json / vite.config.ts（含 @tanstack/router-plugin/vite）/ tsconfig.json / eslint.config.js（flat config）/ index.html / README.md
  src/
    main.tsx（QueryClient + createRouter + AuthGuard beforeLoad 重定向）
    lib/supabase.ts        # createClient<Database>，VITE_SUPABASE_URL/ANON_KEY（apps/admin/.env，example 入库）
    services/              # milk / article / template / stats 四个 service
                          # 沿用主应用"单例对象 + async 方法，error 即 throw"模式；页面禁止直接 import supabase
    routes/                # TanStack Router 文件路由：
      __root.tsx
      login.tsx            # 邮箱密码登录；非 admin 账号登录后提示无权限
      _auth.tsx            # 登录守卫布局（antd Layout 侧边栏）
      _auth/dashboard.tsx  # 看板：Statistic 卡 + recharts 按日趋势 + 事件明细表（数据走 admin-stats）
      _auth/milk.tsx       # 奶粉库：表格 + brand/段位/蛋白类型/状态筛选 + 新建/编辑 Drawer + 上下架 + CSV 导入（模板下载、papaparse 校验、批量 upsert）
      _auth/articles.tsx   # 文章：列表 + review_status 筛选 + 新建/编辑（TextArea）+ 审核流转（approved/rejected）
      _auth/templates.tsx  # 转奶模板：列表 + days jsonb 结构化行编辑器（ratio/label）+ version 递增 + enabled/is_default
    components/            # 少量共享件（PageHeader、StatusTag 等）
  测试：CSV 解析/字段映射等纯逻辑 vitest（apps/admin/src/**/*.test.ts）
```

依赖：react/react-dom/antd/@ant-design/icons、@tanstack/react-router、@tanstack/react-query、@supabase/supabase-js、recharts、papaparse、dayjs；dev：vite、@vitejs/plugin-react、@tanstack/router-plugin、typescript、eslint(flat)、vitest。

## 阶段 5 · 文档同步

README（monorepo 结构 + 各 app 启动方式）、AGENTS.md（目录表按新路径重写、质量门命令不变、admin 分层规则并入）、spec B-milk-products §3 与 G-content §3 运营载体由"Supabase 表编辑（M2 最小方案）"更新为"管理后台"。

## 明确不做（防蔓延）

用户/角色体系（admins 单表白名单够用）、富文本编辑器、预警阈值配置页（配置表尚未落库）、条码补录队列（FR-B4 属 M4）。

## 验证

1. 阶段 1 后立即跑质量门（pnpm install → 根 typecheck/lint/test）确认迁移零回归，再继续；
2. 全部完成后：根质量门全绿 + `pnpm dev:weapp` 构建回归（小程序行为不变）+ `pnpm dev:admin` 手动走查：登录（非 admin 拒绝）→ 奶粉库 CRUD/CSV 导入 → 文章审核 → 模板编辑 → 看板加载（无本地 Supabase 实例时 RLS 部分以 SQL 审查代替并标注人工验证步骤）。