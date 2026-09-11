# 00 · 语义与术语基线（Glossary & Semantics）

| 元素 | 内容 |
|---|---|
| 文档状态 | 草案（v2.0-draft3 建立） |
| 定位 | **全项目唯一的术语与系统语义来源**。设计任何新功能前先查本文；概念缺失时，先在本文定义并过评审，再写 FR——防止同义异名与口径漂移 |
| 冲突规则 | 其他文档与本文不一致时，以本文为准并回改 |

## 1. 领域术语

| 术语 | 定义 | 备注 |
|---|---|---|
| 转奶 | 从一种配方奶粉渐进过渡到另一种（含同品牌换段位） | 全程通常 7–14 天 |
| 新奶 / 旧奶 | 计划中 `to_product` / `from_product` 的方向性称谓 | 回退期间以"当前目标比例"表述，方向定义不变 |
| 混合法 | 新旧奶粉同瓶按比例混冲，逐日调整比例 | 默认模板见 FR-C2 |
| 隔顿法 | 逐顿替换为新奶，逐步增加新奶顿数 | 跨品牌/涉及水解配方时的默认方法 |
| 段位 | 1 段 0–6 月 / 2 段 6–12 月 / 3 段 12–36 月（4 段为 3 岁+ 儿童成长奶粉，库内标注但不驱动提示） | 换段时机提示见 FR-A4 |
| 蛋白类型 | 整蛋白 / 部分水解 / 深度水解 / 氨基酸 | `milk_products.protein_type`，驱动方法默认与安全提示强度 |
| 特医奶粉 | 特殊医学用途婴儿配方食品（国食注字 TY） | 库内条目必须带"遵医嘱"标记 |
| 国食注字 YP / TY | 普通婴儿配方注册号 / 特医配方注册号 | YP=普通婴配，TY=特医 |
| 纯奶期 / 辅食期 | 0–6 月龄（奶为唯一/主要营养来源）/ 6 月龄起添加辅食 | 决定奶量参考口径（FR-F3）与 E1 奶量规则基数 |
| 计划日 Dn | D1 = `start_date` 所在喂养日，Dn 为第 n 个喂养日 | 跨日切点自动滚动 |
| 任务卡 | 展示"今天（当前喂养日）该怎么做"的卡片 | FR-C3 |
| 回退 | 异常/预警时退回上一稳定节奏，默认观察 3 天 | FR-C5 |
| 按计划 / 偏离计划 | 记录配方与当日计划配方一致 / 不一致（系统自动判定，用户无需标注） | FR-D5 |
| 基线 | 计划开始前 3 个喂养日的症状打卡与奶量数据 | 预警规则的对照物，见 §4 与 FR-E1 |
| 适应度 | 症状 + 奶量的综合观察信号（绿/黄/红） | 本产品的观察概念，不构成医学结论 |
| 预警级别 | red（建议就医）/ yellow（建议回退观察）/ green（正常） | 呈现三重传达：颜色 + 图标 + 文字（NFR-6） |
| 喂养日 / 顿次 / 同顿匹配 | 见 §2 时间语义 | |
| 奶量参考 | 按月龄分档的每日总奶量参考区间 | FR-F3，配置化 |
| 复盘报告 | 计划终态生成的数据总结 | FR-F2，可作为就医沟通材料 |
| AI 场景 | AI 能力的独立配置单元：`chat` 问答 / `poop` 便便 / `bottle` 奶瓶 / `can` 奶粉罐 | `ai_configs.scene`，场景间模型/提示词/配额互不影响（FR-K1） |
| AI 网关 | 后端 `app/api/ai.py` 的统一模型调用层 | 密钥唯一驻留地（后端环境变量）；配额、护栏、降级都在此层（FR-K1） |
| 提示词版本 | 某场景 system prompt 的一次审核单元 | `pending → approved / rejected`；仅 approved 且 enabled 生效（FR-K1/J6） |
| 结构化观察 | 视觉模型输出的固定 schema 字段（颜色/性状/疑似异常/置信度） | AI 不产出预警级别，级别由 FR-E1 规则引擎裁决（FR-K4） |
| 分析即弃 | 拍照默认仅 base64 即时分析、完成即弃不落库 | NFR-2 照片最小化；显式勾选保留仅限 FR-K3 补录 |
| 降级文案 | 模型不可用/超限/出域时的固定引导话术 | 禁止抛裸错误；识别类降级必须回退手填路径（FR-K1） |
| 供应商注册表 | `ai_providers`：供应商名称与端点的事实源，管理端维护 | 密钥不走注册表，按环境变量约定读取（FR-K6） |
| 故障转移 | 主模型调用失败时以场景备用模型自动重试一次 | 仅一次重试；不做自动路由/加权 AB（FR-K7） |
| 密钥加密落库 | 供应商 API Key 以 AES-256-GCM 密文存储（ai_provider_secrets） | 主密钥在环境变量；编辑不回显（仅末 4 位掩码），明文不出后端内存（FR-K6/NFR-2） |
| 管理员角色 | 管理后台固定三角色：`super_admin`（超管）/ `operator`（运营）/ `analyst`（只读分析） | `admins.role`；角色→权限点矩阵固定，不做自定义角色（FR-J8） |
| 权限点 | 管理后台最小授权单元 | `dashboard:read / milk:write / article:write / template:write / ai:config（场景与提示词）/ ai:key（供应商密钥）/ user:read / admin:manage / audit:read`；DB 端 `has_permission()` 统一裁决，默认拒绝（FR-J8） |
| 家庭共享 | 多个正式微信账号围绕同一宝宝档案协作（共同记录/查看） | 成员关系表 `baby_members`；RLS 由 own-policy 扩展为成员判定（FR-H3） |
| 成员角色 | `owner`（档案创建者，每宝宝唯一）/ `editor`（可写）/ `viewer`（只读） | 仅 owner 可管理成员；每宝宝 active 成员 ≤ 5；所有权转移不做（FR-H3） |
| 邀请 | owner 生成的一次性入群凭证（高熵短码，24h 有效，验证失败限速） | 被邀请人须为正式登录账号（游客不可参与）；接受/过期/撤销后立即失效；状态机见 §3（FR-H3） |
| 账号注销 | 级联删除 auth 账号与全部业务数据 | 区别于「退出登录」（仅清本机会话）；FR-H2 |
| 隐私同意留痕 | 登录勾选、建档、绑定手机号等同意行为的记录 | `privacy_consents`：类型 + 协议版本 + 时间，只追加（FR-H2/H5/H6/H7） |
| 手机号绑定 | 微信快捷授权绑定手机号（账号安全用途，非登录方式切换） | 加密存储 + 哈希指纹唯一，展示一律脱敏（`138****5678`）；不做营销触达（FR-H7） |
| 双裁决（应用层优先） | 业务权限由后端应用层为主裁决点，数据库 RLS 为过渡期纵深防御，两套口径一致 | NFR-7：C 端流量唯一经过后端 `/v1`，管理端新能力一律走 `/admin` API；迁移自建数据库后可关闭 RLS 而行为不变（FR-H3/J8） |

## 2. 时间与日历语义（最容易出错的一层）

1. **存储与展示**：数据库一律 `timestamptz`（UTC 存储）；展示按设备本地时区。
2. **喂养日**（产品的"一天"）：日切点默认 **04:00**（配置项）。喂养日 D = [D−1 04:00, D 04:00)。**凌晨 2 点的夜奶归属前一天**。`symptom_logs.log_date`、`transfer_plans.start_date`、全部日聚合统计（图表/复盘/规则评估）均按喂养日计算。
3. **顿次**：喂养日内按时间顺序的自动序号（第 1 顿…第 N 顿），不需要用户选择。
4. **同顿匹配**（快速记奶取"上次同顿奶量"）：在历史记录中找时间点相差 ≤ 90 分钟的最近一条；无匹配用最近一条；再无则进完整表单（FR-D1）。
5. **今天 / 跨天滚动**：任务卡与计划的"今天" = 当前所在喂养日；跨过日切点自动滚动（FR-C3）。
6. **iOS 解析禁令**：禁止裸 `new Date('YYYY-MM-DD HH:mm')`，一律走 `src/utils/date.ts`（NFR-4）。

## 3. 状态机与枚举（统一小写下划线命名）

| 对象 | 状态/枚举 | 规则 |
|---|---|---|
| 转奶计划 | `active / paused / rollback / completed / terminated` | 终态不可逆（重开 = 新建计划）；同宝宝至多一个非终态（DB 部分唯一索引强制） |
| **计划完成判定** | **自动**：最后计划日的下一日切点，若最后计划日存在 ≥ 1 条喂养记录 → 自动 `completed`；**手动**：`active/paused` 下用户标记完成（二次确认，留痕） | 两种均计入北极星；`terminated` 必须选择原因 |
| 预警 | `new → acked → resolved` | `acked` 必填 `acked_at`（已读；红色预警不可跳过）；`resolved` = 同 `rule_code` 连续 3 个喂养日无触发自动关闭，或计划终态时批量关闭；预警只可关闭，不可删除 |
| 文章 | `draft / reviewing / approved / offline` | 仅 `approved` 对客户端可见 |
| 奶粉 SKU | `on / off` | `off` 不再出现在选择器，历史记录引用不受影响 |
| 预警级别 | `red / yellow / green` | 呈现为红/黄/绿 + 图标 + 文字 |
| 家庭邀请 | `pending / accepted / expired / revoked` | 24h 过期；接受幂等；撤销后短码立即失效（FR-H3） |
| 管理员账号 | `active / disabled` | `disabled` 即刻失去全部后台访问（判定随每次请求）；任意时刻 ≥1 个 active 的 `super_admin`（触发器强制，FR-J8/J9） |
| 管理员角色 | `super_admin / operator / analyst` | 固定枚举；存量白名单行迁移默认 `super_admin`（FR-J8） |

## 4. 数据语义约定

- **单位**：奶量 `ml` 正整数；体重以 `g` 存储、`kg` 展示（1 位小数）。
- **空值与降级**：展示层缺失一律显示"暂无"；规则引擎依赖的数据缺失时**显式降级或跳过并记录原因**（`payload.skipped`），禁止静默失败。
- **派生优先**：可由既有字段计算的不落库（如 `current_day` 由 `start_date` + 当前喂养日派生，不存列）。
- **方向性**：新/旧奶只由计划方向定义（§1）；记录不重复存储"新旧"标记，由 `plan_id + product_id + 当日计划` 推导（FR-D5）。
- **数据隔离**：所有用户表 `user_id uuid not null default auth.uid()` + own-policy RLS（03-data-model §2）。
- **中性呈现**：奶粉数据无推荐语、无排名、无优劣结论（产品原则 4 / NFR-1）。
- **成员可见性**：家庭共享数据的读取 = owner 或成员、写入 = owner/editor；判定统一收敛到数据库端成员判定函数，策略变更迁移必须附带越权回归用例（FR-H3）。
- **只追加记录**：`admin_audit_logs`、`privacy_consents` 只可写入与受控读取，无 update/delete 授权；审计日志保留 ≥ 180 天（FR-J11/H2）。
- **敏感个人信息最小出域**：完整手机号不回传客户端（展示一律脱敏）；管理端用户查询不输出明文 openid（FR-H7/J10）。

## 5. 指标口径（唯一来源；采集依赖 FR-H4）

| 指标 | 公式 | 依赖事件 |
|---|---|---|
| 北极星：月完成计划数 | 当月 `status=completed` 的计划数（自动 + 手动） | `plan_completed` |
| 计划创建率 | 当周创建过计划的用户 / 周活（7 日内 ≥1 次 `app_launch`） | `plan_created`、`app_launch` |
| 7 日打卡留存 | 创建计划后第 7 个喂养日（±1）仍有任意记录的用户 / 创建计划用户 | `plan_created`、`feed_recorded`、`symptom_logged` |
| 计划完成率 | 到达最后计划日的计划中 `completed` 占比（剔除 `terminated`） | `plan_completed`、`plan_terminated` |
| 预警响应率 | `level=red` 且 `acked_at − created_at ≤ 24h` 的条数 / red 总条数 | `alert_shown`、`alert_acked` |
| 次日留存 | 新用户（首次 `app_launch`）次日再次 `app_launch` 的占比 | `app_launch(first=1)` |
| 记录成本 | `feed_recorded(source=quick)` 的 `dur_ms` P95 ≤ 10s | `feed_recorded` |
| 分享归因新增 | 首次 `app_launch` 且 `scene=share_plan` 的新用户数 | `app_launch`、`share_card_created` |
| 问卷完成率 | `questionnaire_completed / questionnaire_started` | 同名事件 |
| 推荐采纳率 | 问卷完成后 7 日内 `product_viewed(建议方向)` 或 `plan_created` 的用户占比 | `questionnaire_completed`、`product_viewed`、`plan_created` |

**事件清单**（`analytics_events.name`）：`app_launch(scene, first)`、`plan_created`、`plan_completed`、`plan_terminated`、`plan_rollback_triggered`、`feed_recorded(source, dur_ms)`、`symptom_logged`、`alert_shown(level, rule_code)`、`alert_acked`、`article_read`、`product_viewed`、`product_selected`、`questionnaire_started`、`questionnaire_completed`、`share_card_created`、`ai_used(scene, ok)`、`profile_updated`、`family_invite_created`、`family_invite_accepted`。

**规则**：新增指标先补本表与事件清单，再开发；事件属性变更视同口径变更，走 README 变更记录。

## 6. 变更记录

| 版本 | 日期 | 说明 |
|---|---|---|
| v2.0-draft3 | 2026-09-09 | 评审修复中建立：收拢领域术语、时间语义（喂养日/顿次/同顿匹配）、状态机（含计划完成判定与预警生命周期）、数据语义约定、指标口径与埋点事件清单 |
| v2.0-draft5 | 2026-09-11 | 新增模块 K 术语：AI 场景/AI 网关/提示词版本/结构化观察/分析即弃/降级文案；事件清单新增 `ai_used(scene, ok)` |
| v2.0-draft6 | 2026-09-11 | 新增术语：供应商注册表、故障转移（模块 K 模型接入管理扩展） |
| v2.0-draft8 | 2026-09-12 | 新增用户与权限术语：管理员角色/权限点、家庭共享/成员角色/邀请、账号注销/隐私同意留痕/手机号绑定；§3 新增家庭邀请与管理员账号状态机；§4 新增成员可见性/只追加/最小出域约定；§5 事件清单增补 `profile_updated`、`family_invite_created`、`family_invite_accepted` |
| v2.0-draft9 | 2026-09-12 | 新增术语「双裁决（应用层优先）」：Supabase 定位为过渡形态、后期迁移自建数据库（NFR-7），权限主裁决收敛到后端应用层，RLS 降级为纵深防御 |
