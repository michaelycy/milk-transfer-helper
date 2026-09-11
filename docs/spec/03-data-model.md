# 03 · 数据模型需求

| 元素 | 内容 |
|---|---|
| 文档状态 | 草案（随 v2.0-draft2 拆分） |
| 上游文档 | [README.md](README.md) |
| 关联 | `supabase/migrations/20240523000000_init_schema.sql`（基线）、`.trae/documents/baby-milk-transfer-tech-arch.md`（DDL 细节） |

> 本文档只定义**表级需求与约束**（What），DDL 细节归技术方案（How）。所有用户表遵循：`user_id uuid not null default auth.uid()` + own-policy RLS + 最小 grant（沿用基线迁移的既有模式）。**v2.0-draft9 起（NFR-7）**：该模式仅适用于过渡期存量；新增表遵循 §2.12 可移植性约束——外键指向 `public.users`、无 `auth.*` 引用、权限主裁决在后端应用层（RLS 仅为纵深防御）。

## 1. 表需求总览

| 表 | 用途 | 关键字段与约束 | 服务的 FR |
|---|---|---|---|
| `babies` | 宝宝档案 | nickname, birth_date, gender；软删除可选 | A1–A3 |
| `weight_logs` | 体重记录 | baby_id, weight_g, measured_at；unique(baby_id, measured_at) | A3、F3 |
| `milk_products` | 奶粉库（运营维护，公开只读） | brand, name, stage, protein_type, region, reg_no, ingredients jsonb, status；索引 (brand, stage) | B1–B3 |
| `plan_templates` | 转奶方法模板（可配置，公开只读） | method, name, days jsonb, version, is_default, enabled | C2 |
| `transfer_plans` | 转奶计划 | baby_id, from/to_product_id（或手动品牌快照）, reason, method, template_id+version, start_date（喂养日）, status；约束：同宝宝仅一个非终态（部分唯一索引实现） | C1–C7 |
| `feed_records` | 喂养记录（**重构自 `records`**） | baby_id, plan_id?, plan_day?, product_id?（未收录时 brand_text 兜底）, amount_ml>0, finished, feed_time, note；索引 (user_id, baby_id, feed_time desc) | D1–D5 |
| `symptom_logs` | 每日症状打卡 | baby_id, log_date（**喂养日**，日切点见 00-glossary §2）, stool_count/color/texture, rash, vomit, bloating, crying_level, sleep_quality, note；unique(baby_id, log_date) | D3、E1 |
| `alerts` | 预警留痕 | baby_id, plan_id?, level, rule_code, payload jsonb（含 skipped 降级原因）, status(new/acked/resolved), acked_at, resolved_at | E1/E2 |
| `analytics_events` | 埋点事件（FR-H4，指标唯一数据源） | user_id, name, props jsonb, occurred_at；索引 (name, occurred_at)；客户端仅可插入本人事件（无 select 权限，看板走服务端） | H4 |
| `ai_configs` | AI 场景配置（FR-K1/K7，运营维护，客户端不可直读） | scene（chat/poop/bottle/can，唯一）, provider, model, base_url?（场景级端点覆盖）, temperature, max_tokens, daily_limit_per_user, enabled, **fallback_provider?** **fallback_model?**（备用模型，K7）；**无密钥字段**（密钥仅后端环境变量）；updated_at 触发器 | K1/K7、J6/J7 |
| `ai_prompt_templates` | AI 提示词模板（版本化，审核流） | scene, version, system_prompt, review_status(pending/approved/rejected), review_note?, reviewed_at?, enabled；部分唯一索引：同场景仅一个 enabled；**服务端仅执行 approved 且 enabled 的版本**（NFR-1） | K1、J6 |
| `ai_usage_logs` | AI 调用记账 | user_id, scene, success, tokens, **fallback_used**（默认 false，K7）, created_at；索引 (scene, created_at)；客户端无任何权限（后端 service_role 写入，管理端只读）；含 FR-K8 测试调用（J7 口径说明） | K1/K7/K8、J6/J7 |
| `ai_chat_messages` | 问答会话历史（FR-K5） | user_id, baby_id?, role(user/assistant), content, scene, created_at；own RLS（查/删本人，insert 本人） | K5 |
| `ai_analyses` | 视觉分析结果（FR-K2/K3/K4，**不存照片**） | user_id, baby_id?, scene, result jsonb, confidence, created_at；own RLS（查/删本人） | K2–K4 |
| `ai_providers` | 供应商注册表（FR-K6，配置驱动接入的事实源） | name unique, base_url, note, enabled；本表不存密钥（见 ai_provider_secrets）；种子 zhipu（GLM）/deepseek/openai；删除仅限「停用且无场景引用」（密文级联清理） | K6、J7 |
| `ai_provider_secrets` | 供应商密钥（FR-K6，界面设置、加密落库） | provider_name unique, key_ciphertext（AES-256-GCM，主密钥在环境变量）, key_last4（掩码展示用）, updated_at；**无任何客户端策略/授权**（仅后端 service_role 读写，密文不下发浏览器）；供应商删除级联清理 | K6、J7 |
| `milk_product_submissions` | 识别/扫码未命中补录队列（FR-K3、FR-B4） | user_id, source(ai_can/barcode), payload jsonb, image_path?（私有桶，用户勾选才上传）, status(pending/processed/dismissed), processed_at?；own insert/select；admin 全量读 + 状态流转 | K3、B4、J6 |
| `users` / `articles` / `favorites` | 保留现有 | users：openid 启用回填（H1）、nickname/avatar 激活为真实资料（H6）、phone 以「哈希指纹 + 密文」双字段存储（指纹承担唯一约束，展示一律脱敏，H7）；articles 增加 review_status（内容审核状态，G1） | H1、G1、H6、H7 |
| `baby_members` | 家庭共享成员关系（H3） | baby_id, user_id, role(owner/editor/viewer), status(active/removed), invited_by?；unique(baby_id, user_id)；每宝宝 owner 唯一（部分唯一索引）、active 成员 ≤ 5（触发器强制）；存量 babies 由迁移自动补 owner 行 | H3 |
| `family_invites` | 家庭共享邀请凭证（H3） | baby_id, role(editor/viewer), invite_code（唯一高熵短码，**一次性**：接受即失效）, invited_by, accepted_by?, status(pending/accepted/expired/revoked), expires_at（24h）；创建/撤销仅 owner 可为（RLS 判定）；验证失败限速由服务端承担 | H3 |
| `privacy_consents` | 隐私同意留痕（只追加） | user_id, consent_type(login/baby_profile/phone), policy_version, consented_at；仅 insert（own）+ 可查本人记录，无改/删授权 | H2/H5/H6/H7 |
| `admins`（扩展） | 管理员白名单升级为角色化（J8） | role(super_admin/operator/analyst，存量行迁移默认 super_admin), status(active/disabled)；触发器强制「任意时刻 ≥1 个 active super_admin」「禁止自我停用/降级」；RLS 维持仅 self 可读（不可枚举他人） | J8/J9 |
| `admin_audit_logs` | 管理端操作审计（只追加，J11） | actor_user_id, action, target_type?, target_id?, detail jsonb, ip?, created_at；写入仅 DB 触发器与后端 service_role，读取需 `audit:read` 权限点；无 update/delete 授权；保留 ≥ 180 天，到期清理由维护脚本处理 | J11 |
| `api_logs` | API 运行日志（只追加，J12；技术排障，与 J11 合规审计分表） | request_id, method, path, status, level(info/warn/error), duration_ms, user_id?（→public.users，置空不级联）, message?；中间件异步写入（service_role），无任何客户端策略/授权；保留默认 30 天（API_LOG_RETENTION_DAYS）定时清理；管理端经后端 `/v1/admin/logs` 只读查询；规范见 05-api-guidelines §4 | J12 |

## 2. 关键设计约束

1. **数据隔离**：新表 RLS 一律复用基线模式——`user_id` 默认 `auth.uid()`、own-policy、最小 grant；客户端禁止传入 `user_id`。奶粉库与模板表对客户端只读（anon/authenticated 可查，无写权限）。
2. **计划-记录一致性**：`feed_records.plan_id` 引用 `transfer_plans(id)`，计划删除策略为置空（SET NULL）而非级联——复盘历史不允许因计划操作而丢记录。
3. **模板版本锁定**：`transfer_plans` 记录创建时的 `template_id + template_version`，进行中的计划不受模板后续调整影响（FR-C2 验收要求）。
4. **配置即数据**：预警规则阈值（FR-E1）、奶量参考量（FR-F3）以配置表或 jsonb 配置存储，调整不改代码。
5. **同宝宝唯一进行中计划**：用部分唯一索引（`where status in ('active','paused','rollback')`）在数据库层强制，应用层校验只是兜底。
6. **"日"的统一边界**：全部日级字段与聚合（`start_date`、`log_date`、图表、规则评估、复盘）按**喂养日**计算，日切点默认 04:00（定义见 [00-glossary.md](00-glossary.md) §2），日切点为配置项。
7. **派生字段不落库**：`current_day` 等可由 `start_date` + 当前喂养日推导的值不存列（派生优先原则，00-glossary §4）。
8. **预警生命周期**：`acked_at`/`resolved_at` 随状态机写入（new→acked→resolved，resolved 语义见 00-glossary §3）；预警响应率口径依赖 `acked_at`。
9. **成员可见性判定（H3）**：家庭共享相关 RLS 统一经数据库端成员判定函数（security definer）实现，业务表读策略 = own OR 成员、写策略 = owner/editor；成员各自的个人数据（收藏/埋点/AI 会话）仍为 own-policy 不共享；跨成员展示记录人身份仅经专用只读通道披露昵称/头像最小字段，不放宽 `users` 表整体读权限；存量 babies 由迁移自动补 owner 成员行，迁移须附越权回归自测用例。
10. **权限判定函数化（J8）**：管理端 RLS 与后端接口统一走 `has_permission(action)`（security definer，读 `admins.role` + 固定角色权限矩阵）；`is_admin()` 保留为兼容包装，新增策略/接口不得再直调 `is_admin()`。
11. **只追加与最小出域（J11/H7）**：`admin_audit_logs` / `privacy_consents` 无 update/delete 授权；手机号完整值不出后端（客户端只见脱敏展示），管理端查询不输出明文 openid。
12. **可移植性（NFR-7，v2.0-draft9）**：后期迁移自建数据库，Supabase 为过渡形态。新增表一律普通 Postgres DDL：不引用 `auth.*`、不用 Supabase 专有能力，新增用户外键一律指向 `public.users`（用户主数据、身份事实源）；业务权限**主裁决在后端应用层**（双裁决口径一致），RLS 降级为纵深防御、可整体关闭而不改变行为；既有 `auth.users` 外键存量保持不动，迁移窗口统一处理。

## 3. 迁移策略（records → feed_records）

- 通过增量迁移改名并加列；**禁止修改历史迁移文件**（NFR-5）。
- 历史数据无 baby_id 时：自动创建默认宝宝档案「宝宝」并回填，保证非空约束成立。
- 历史 `milk_brand` 自由文本迁入 `brand_text` 兜底字段，**不做脏数据强行匹配奶粉库**；后续用户编辑记录时可选择关联 `milk_products`。
- 迁移前后行数一致性需在迁移脚本内校验（count 比对，不一致即失败回滚）。
- 匿名 → 微信登录的数据迁移（FR-H1）：按 auth user 合并，迁移幂等可重试，失败不落库，灰度放量。

## 4. 迁移文件规范

- 路径 `supabase/migrations/`，命名 `YYYYMMDDHHMMSS_<slug>.sql`；
- 每个迁移文件头部注释说明：服务的 FR、前置要求、回滚方式（或说明不可回滚及原因）；
- 涉及 RLS/policy/grant 的变更必须在同一文件内完整成套，不留中间态。
