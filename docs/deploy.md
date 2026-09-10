# 部署指南（管理后台 + Supabase）

架构：`apps/admin` 构建产物为纯静态 SPA，发布到 **Vercel**；数据层在 **Supabase 云端**（数据库 / Auth / Edge Functions）。无服务器、无容器。小程序不受本部署影响（直连 Supabase 域名）。

## 流水线

```
PR        → CI（typecheck / lint / test / 双端构建）
push master → Deploy（质量门 → admin-stats 函数发布 → Vercel 构建 + 生产发布）
```

- 工作流：`.github/workflows/ci.yml`、`.github/workflows/deploy.yml`
- SPA 路由回退：`apps/admin/vercel.json`（所有路径 rewrite 到 `index.html`，防刷新 404）
- Vercel 每次部署都是不可变构建，回滚 = Deployments 页一键 Rollback

## 一次性准备

### 1. GitHub Secrets（仓库 Settings → Secrets and variables → Actions）

| Secret | 必填 | 说明 |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | **生产** Supabase 项目 URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | 生产项目 anon key（公开客户端凭据，安全边界在 RLS） |
| `VERCEL_TOKEN` | ✅ | Vercel → Account Settings → Tokens 创建 |
| `SUPABASE_ACCESS_TOKEN` | 推荐 | Supabase → Account → Access Tokens（用于 CI 发布 admin-stats 函数） |
| `SUPABASE_PROJECT_REF` | 推荐 | 生产项目 ref（项目 URL 的 `https://xxx.supabase.co` 中 `xxx`） |
| `SUPABASE_DB_URL` | ✅ 备份 | 生产库连接串（Dashboard → Connect → **Session pooler**，形如 `postgresql://postgres.<ref>:<密码>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require`；GitHub Actions 无 IPv6，不能用直连地址） |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | ✅ 备份 | Cloudflare R2（免费 10GB）：创建 API 令牌与存储桶后取得 |
| `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | 可选 | 首次自动建项目后，从 `apps/admin/.vercel/project.json` 或 Vercel 项目设置里取，固定项目绑定 |

### 2. Supabase 环境

- **双项目**：新建 dev 项目，现有项目作 prod；新迁移先 dev 后 prod（SQL Editor 手动执行，稳定后再改 CI `supabase db push` 自动化）；
- **Auth 加固**（生产项目 Dashboard → Authentication）：
  - Providers → Email：**关闭 Enable Signup**（管理员由 Dashboard 手工创建；小程序匿名登录不受影响）；
  - URL Configuration → Site URL：填管理后台最终域名；
- **Edge Function**：`wechat-login` 只需手动部署一次（带 `--no-verify-jwt`）：`supabase functions deploy wechat-login --no-verify-jwt`，并用 `supabase secrets set WECHAT_APPID=… WECHAT_SECRET=…` 配置；`admin-stats` 由 Deploy 流水线自动发布，无需平台注入 secrets（`SUPABASE_URL` 等平台自动提供）。

### 3. 首次部署

1. 把上述 secrets 配齐，合并 PR 到 `master`；
2. Deploy 工作流首次运行会在 Vercel 自动创建项目（名为 `admin`），并在 Summary 里给出生产 URL；
3.（可选）把 `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` 补为 secrets，固定后续部署的项目绑定；
4.（可选）Vercel 项目 → Settings → Domains 绑定自定义域名（自动 HTTPS）；Vercel → Deployment Protection 可加一层访问保护（内部工具推荐开启 Pre-production 部署保护即可）。

## 数据库备份（免费方案，已落地）

`.github/workflows/backup.yml`：每日北京时间 02:00（`0 18 * * *` UTC）自动执行——

1. `pg_dump`（docker 固定 postgres:17 客户端）导出 **public schema**（业务数据：用户/宝宝/记录/计划/奶粉库/文章等），gzip 压缩；
2. `rclone` 上传到 **Cloudflare R2** 私有桶（免费 10GB 额度）`<bucket>/postgres/`；
3. 自动清理 30 天前的旧备份（滚动保留）。

任何一步失败都会红叉并触发 GitHub 邮件告警（备份绝不静默跳过）。配置好 secrets 后可手动 `workflow_dispatch` 跑一次验证。

**恢复方式**：

```bash
gunzip -c milk-transfer-<时间戳>.sql.gz | psql "<目标库连接串>"
```

注意事项：
- 备份范围是 **public schema（业务数据）**；`auth.users`（登录账号，属 Supabase 托管的 auth schema）不在内——管理员账号需按迁移文件尾注重建（就一两个），用户匿名身份由小程序端登录自然重建；
- 恢复到已有数据的项目前先评估冲突（建议在空项目/新项目演练一次）；
- R2 建议开启对象锁定或定期把月度备份再下载一份异地留存，防桶级误删。

## 明确不做

- 服务器 / Docker / Nginx / K8s（静态 SPA 无此需要）；
- Supabase Branching（付费预览库，当前规模无收益）；
- 自建账号体系 / WAF（安全边界 = Supabase Auth + `admins` 白名单 + RLS `is_admin()`，`service_role` 仅存在于 Edge Function 服务端）。

## 回滚

- **站点**：Vercel → Deployments → 上一个稳定版本 → Promote to Production；
- **Edge Function**：回滚 = 从历史 commit 重新发布（`npx supabase functions deploy admin-stats --project-ref …`）；
- **数据库**：迁移不可回滚的部分依赖备份恢复（见上），因此迁移务必先 dev 后 prod。
