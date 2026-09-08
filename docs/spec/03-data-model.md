# 03 · 数据模型需求

| 元素 | 内容 |
|---|---|
| 文档状态 | 草案（随 v2.0-draft2 拆分） |
| 上游文档 | [README.md](README.md) |
| 关联 | `supabase/migrations/20240523000000_init_schema.sql`（基线）、`.trae/documents/baby-milk-transfer-tech-arch.md`（DDL 细节） |

> 本文档只定义**表级需求与约束**（What），DDL 细节归技术方案（How）。所有用户表遵循：`user_id uuid not null default auth.uid()` + own-policy RLS + 最小 grant（沿用基线迁移的既有模式）。

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
| `users` / `articles` / `favorites` | 保留现有 | users.openid 启用回填（H1）；articles 增加 review_status（内容审核状态，G1） | H1、G1 |

## 2. 关键设计约束

1. **数据隔离**：新表 RLS 一律复用基线模式——`user_id` 默认 `auth.uid()`、own-policy、最小 grant；客户端禁止传入 `user_id`。奶粉库与模板表对客户端只读（anon/authenticated 可查，无写权限）。
2. **计划-记录一致性**：`feed_records.plan_id` 引用 `transfer_plans(id)`，计划删除策略为置空（SET NULL）而非级联——复盘历史不允许因计划操作而丢记录。
3. **模板版本锁定**：`transfer_plans` 记录创建时的 `template_id + template_version`，进行中的计划不受模板后续调整影响（FR-C2 验收要求）。
4. **配置即数据**：预警规则阈值（FR-E1）、奶量参考量（FR-F3）以配置表或 jsonb 配置存储，调整不改代码。
5. **同宝宝唯一进行中计划**：用部分唯一索引（`where status in ('active','paused','rollback')`）在数据库层强制，应用层校验只是兜底。
6. **"日"的统一边界**：全部日级字段与聚合（`start_date`、`log_date`、图表、规则评估、复盘）按**喂养日**计算，日切点默认 04:00（定义见 [00-glossary.md](00-glossary.md) §2），日切点为配置项。
7. **派生字段不落库**：`current_day` 等可由 `start_date` + 当前喂养日推导的值不存列（派生优先原则，00-glossary §4）。
8. **预警生命周期**：`acked_at`/`resolved_at` 随状态机写入（new→acked→resolved，resolved 语义见 00-glossary §3）；预警响应率口径依赖 `acked_at`。

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
