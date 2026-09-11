# 转奶日记 · 需求文档索引（Spec Index）

> 本目录是产品需求的**唯一事实来源**。采用「索引 + 全局文档 + 模块文档」结构：需求按模块拆分独立维护，本文是它们的注册中心——任何 FR 的状态以本目录 README 的状态总表为准。

| 项目 | 内容 |
|---|---|
| 文档版本 | v2.0-draft12 |
| 文档状态 | 草案（待评审） |
| 最后更新 | 2026-09-12 |
| 取代 | `docs/PRD.md`（已删除）、`.trae/documents/baby-milk-transfer-prd.md`（v1，仅存档） |

## 变更记录

| 版本 | 日期 | 变更说明 |
|---|---|---|
| v2.0-draft13 | 2026-09-12 | FR-H3/H6/H7 页面落地收口：draft12 声明的 user 分包中设置/收藏/账号与安全/家庭共享四页此前为空文件（运行时 React createElement 警告的根因），本次按 V2-18/19/20 画板实现——设置（头像昵称填写能力 + 聚合入口 + 退出）、收藏（favorites 通道列表/取消）、账号与安全（手机号绑定单独同意弹层/换绑/解绑 + 注销二次确认）、家庭共享（成员名册/邀请短码弹层/分享卡片/角色调整/移除退出）；service 层补收藏通道与成员改角色，埋点补 profile_updated/family_invite_created/accepted |
| v1.0 | 2024-05 | 初版 PRD（记录 CRUD + 文章） |
| v2.0-draft1 | 2026-09-08 | 围绕三大问题重构需求，形成四大闭环与模块化需求编号 |
| v2.0-draft2 | 2026-09-09 | 按模块拆分为独立文档并建立本索引；新增 UI 设计画板对照（docs/ui/ui.pen V2 系列） |
| v2.0-draft3 | 2026-09-09 | 闭环评审修复：建立 00-glossary 语义基线（喂养日/顿次/状态机/指标口径与事件清单）；新增 FR-A4 段位时机提示、FR-H4 埋点基建；定义计划完成判定与预警生命周期；修正 D5/D2/F1 的里程碑依赖矛盾；H2 增加数据导出；评审规则与 UI 画板解耦 |
| v2.0-draft4 | 2026-09-09 | 新增模块 J 管理后台（FR-J1~J5，运营载体由 Supabase 表编辑升级为 apps/admin）；UI 设计文件新增 docs/ui/admin.pen |
| v2.0-draft5 | 2026-09-11 | 新增模块 K AI 助手（FR-K1~K5：配置网关/拍奶瓶记奶/拍奶粉罐识别/便便拍照评估/限定域问答）+ FR-J6 AI 配置管理；NFR-2 照片条款修订为「照片最小化」；02-roadmap「AI 答疑」移出不做清单挂 M4 |
| v2.0-draft6 | 2026-09-11 | 模块 K 扩展模型接入管理：FR-K6 供应商注册表（配置驱动新增供应商）/ FR-K7 备用模型与故障转移 / FR-K8 连通性自检；管理端新增 FR-J7 模型接入管理页（admin.pen A-09 已生成）；小程序侧无改动 |
| v2.0-draft7 | 2026-09-11 | 供应商密钥界面化（FR-K6/J7 扩展 + NFR-2 修订）：管理端可设置 API Key，AES-256-GCM 加密落库（ai_provider_secrets，主密钥在环境变量），编辑不回显仅掩码；网关密钥解析 = 库内密文 > 环境变量兜底 |
| v2.0-draft8 | 2026-09-12 | 用户模块与权限体系规划：模块 H 新增 FR-H6 用户资料与个人中心完善、FR-H7 手机号绑定与账号安全，FR-H3 家庭共享由 P3 意图升级为成员角色详细设计（P3→P2，挂 M4）；模块 J 新增 FR-J8 管理员角色与权限（RBAC）、FR-J9 管理员账号管理、FR-J10 用户查询、FR-J11 操作审计日志（J 模块原「不做用户/角色体系」裁定作废）；路线图新增 M5 账户与权限强化；数据模型（03）新增 baby_members/family_invites/privacy_consents/admin_audit_logs 及 admins 角色化；glossary 新增用户与权限术语、3 个埋点事件 |
| v2.0-draft9 | 2026-09-12 | 平台可迁移性约束（架构输入：Supabase 为过渡形态，后期迁移自建数据库与认证）：新增 NFR-7——授权「双裁决、应用层优先」（主裁决收敛到 FastAPI，RLS 降级为纵深防御、迁移后可关闭），禁新增 Supabase 专有依赖，`public.users` 定位为用户主数据（新增外键不再指向 `auth.users`），存量直连路径过渡期不动、迁移窗口统一收口；FR-H3/J8 裁决分层措辞对齐；glossary 新增「双裁决」术语；数据模型新增 §2.12 可移植性约束；路线图新增迁移风险并扩充 M5 DoD |
| v2.0-draft10 | 2026-09-12 | 评审确认（用户拍板）：FR-H3/H6/H7、FR-J8~J11 置为「已评审」；家庭共享每宝宝成员上限确认为 ≤5；UI 设计启动，管理端 A-10~A-12 先行（小程序 V2-18~V2-20 随后） |
| v2.0-draft12 | 2026-09-12 | 用户与权限体系落地：A-10~A-12 与 V2-18~V2-20 画板已生成（audit 清零 + 画布目检；PNG 导出待渲染管线修复）；FR-H3/H6/H7/J8~J11 代码实现完成——迁移 20260912120000（admins 角色化 + has_permission/is_baby_member + baby_members/family_invites/privacy_consents/admin_audit_logs + 成员可见性 RLS + 最后超管/成员上限触发器 + 存量回填）、20260912130000（审计触发器）；后端统一鉴权依赖升级（require_admin_permission + J9/J10/J11 + 家庭接受/注销/资料/手机号接口 + data 网关宝宝域写判定）；管理端权限渲染 + 管理员管理/用户查询/审计页；小程序 user 分包（设置/收藏/关于/隐私/安全/家庭共享/邀请接受）+ 登录同意留痕；相关 FR 状态置「开发中」 |
| v2.0-draft11 | 2026-09-12 | 接口语义化与运行日志专项：新增 [05-api-guidelines.md](05-api-guidelines.md) 接口命名与演进规范（/v1/auth、/v1/db、/v1/ai、/v1/admin 四层路径契约 + 响应信封 + 运行日志规范；存量端点按规范迁移：/auth→/v1/auth、数据网关→/v1/db/tables/{table}/*、管理端 AI→/v1/admin/ai/*）；模块 J 新增 FR-J12 API 运行日志与排查查询（`api_logs` 表 + 请求日志中间件 + 管理端日志查询页，M5 包含范围扩为 J8–J12）；数据模型（03）新增 api_logs；存量库表补齐 COMMENT ON 中文注释 |

---

## 1. 目录结构与阅读顺序

```
docs/spec/
  README.md            ← 本文件：索引、规范、全量需求状态总表
  00-glossary.md       ← 语义与术语基线：领域术语、喂养日/顿次、状态机、指标口径与事件清单（设计功能前必读）
  01-overview.md       ← 背景、三大问题、定位、画像、原则、指标、四大闭环、用户旅程
  02-roadmap.md        ← 里程碑（M0–M4）、范围管理（不做清单）、风险对策
  03-data-model.md     ← 数据模型需求、迁移策略、RLS 规范
  04-nfr.md            ← 非功能需求（医学安全合规、隐私、性能、可维护性…）
  05-api-guidelines.md ← 接口命名与演进规范（路径分层契约、响应信封、运行日志、迁移约束）
  modules/
    A-baby-profile.md    宝宝档案          (FR-A1~A3)
    B-milk-products.md   奶粉库            (FR-B1~B4)
    C-transfer-plan.md   转奶计划引擎      (FR-C1~C7)  ★ 核心模块
    D-feeding-records.md 喂养与症状记录    (FR-D1~D5)
    E-observation.md     观察与预警        (FR-E1~E3)
    F-review-stats.md    统计与复盘        (FR-F1~F3)
    G-content.md         内容与知识        (FR-G1~G3)
    H-account.md         账户与基础        (FR-H0~H7)
    I-reminders.md       提醒              (FR-I1~I3)
    J-admin-console.md   管理后台          (FR-J1~J12)
    K-ai-assistant.md    AI 助手           (FR-K1~K8)
  99-appendix.md       ← 术语表、需求追溯矩阵、旧文档关系
```

**阅读顺序建议**
- 新成员了解产品：`00 → 01 → 02 → 99`，再按兴趣读模块；
- 设计/开发某功能：本 README 状态总表 → `00`（术语与语义）→ 对应模块文档 → `03`（数据）→ `04`（NFR）→ UI 画板；
- 评审排期：`02-roadmap.md` + README 状态总表。

## 2. 维护规范

1. **需求编号唯一且稳定**：功能需求 `FR-<模块字母><序号>`（如 `FR-C3`），非功能需求 `NFR-<序号>`。编号只增不改不复用；废弃时保留编号、状态改「已废弃」并在模块文档注明去向。
2. **状态机**：`草案 → 已评审 → 开发中 → 已上线 → 已废弃`。状态变更须同步本 README 状态总表和模块文档头部，并登记变更记录。
3. **优先级定义**：`P0` 本里程碑必须；`P1` 本里程碑应有（可延期一周内）；`P2` 下一里程碑候选；`P3` 远期观察项，仅记录意图不承诺。
4. **完整性要求**：每条 FR 必须含——描述、可测试的验收标准、优先级、依赖、所属闭环。**UI 画板对照在对应里程碑的设计阶段补齐**（未补齐时标注【未生成】），不阻塞评审——防止评审流程与 UI 产出节奏互相锁死。
5. **职责边界**：本目录回答 What / Why；How（接口、组件、SQL 细节）归 `.trae/documents/baby-milk-transfer-tech-arch.md`，冲突时以本目录评审结论为准并回改技术文档。
6. **评审入口**：里程碑启动前，其覆盖的 FR 必须全部为「已评审」状态（例外：FR-H0 技术债修复，阻塞一切，允许先行）。
7. **术语统一**：全部文档用词与口径以 [00-glossary.md](00-glossary.md) 为准；新概念先入 glossary 并过评审，再写 FR。

## 3. 全量需求状态总表

> 维护规则：FR 状态变更只改此表 + 模块文档头部，不许只改一处。

| FR | 名称 | 模块 | 优先级 | 状态 | 里程碑 | 文档 |
|---|---|---|---|---|---|---|
| FR-H0 | 技术债修复（页面层对齐认证/服务层） | H 账户 | P0 | 已评审（例外先行） | M0 | [modules/H-account.md](modules/H-account.md) |
| FR-A1 | 创建/编辑宝宝档案 | A 档案 | P0 | 草案 | M1 | [modules/A-baby-profile.md](modules/A-baby-profile.md) |
| FR-A2 | 多宝宝切换 | A 档案 | P1 | 草案 | M1 | [modules/A-baby-profile.md](modules/A-baby-profile.md) |
| FR-A3 | 体重记录 | A 档案 | P1 | 草案 | M1 | [modules/A-baby-profile.md](modules/A-baby-profile.md) |
| FR-A4 | 段位转换时机提示 | A 档案 | P1 | 草案 | M2 | [modules/A-baby-profile.md](modules/A-baby-profile.md) |
| FR-D1 | 三秒快速记奶 | D 记录 | P0 | 草案 | M1 | [modules/D-feeding-records.md](modules/D-feeding-records.md) |
| FR-D2 | 完整记录 | D 记录 | P0 | 草案 | M1 | [modules/D-feeding-records.md](modules/D-feeding-records.md) |
| FR-D3 | 症状打卡 | D 记录 | P0 | 草案 | M1 | [modules/D-feeding-records.md](modules/D-feeding-records.md) |
| FR-D4 | 记录编辑与删除 | D 记录 | P1 | 草案 | M1 | [modules/D-feeding-records.md](modules/D-feeding-records.md) |
| FR-D5 | 记录-计划联动 | D 记录 | P0 | 草案 | M2 | [modules/D-feeding-records.md](modules/D-feeding-records.md) |
| FR-E1 | 症状信号规则引擎（可配置） | E 观察 | P0 | 草案 | M1 | [modules/E-observation.md](modules/E-observation.md) |
| FR-E2 | 分级预警（红/黄/绿） | E 观察 | P0 | 草案 | M1 | [modules/E-observation.md](modules/E-observation.md) |
| FR-E3 | 适应度小结 | E 观察 | P1 | 草案 | M1 | [modules/E-observation.md](modules/E-observation.md) |
| FR-F1 | 趋势图表升级 | F 复盘 | P1 | 草案 | M1 | [modules/F-review-stats.md](modules/F-review-stats.md) |
| FR-F2 | 计划复盘报告 + 分享卡 | F 复盘 | P1 | 草案 | M2 | [modules/F-review-stats.md](modules/F-review-stats.md) |
| FR-F3 | 奶量参考对照 | F 复盘 | P1 | 草案 | M1 | [modules/F-review-stats.md](modules/F-review-stats.md) |
| FR-H1 | 微信登录与数据迁移 | H 账户 | P0 | 草案 | M1 | [modules/H-account.md](modules/H-account.md) |
| FR-H2 | 隐私中心与注销 | H 账户 | P1 | 草案 | M1 | [modules/H-account.md](modules/H-account.md) |
| FR-G1 | 知识分类重构 | G 内容 | P1 | 草案 | M1 | [modules/G-content.md](modules/G-content.md) |
| FR-G2 | 避坑与合规专栏 | G 内容 | P1 | 草案 | M2 | [modules/G-content.md](modules/G-content.md) |
| FR-B1 | 奶粉数据规范与首批导入 | B 奶粉库 | P0 | 草案 | M2 | [modules/B-milk-products.md](modules/B-milk-products.md) |
| FR-B2 | 搜索与筛选 | B 奶粉库 | P1 | 草案 | M2 | [modules/B-milk-products.md](modules/B-milk-products.md) |
| FR-C1 | 计划创建向导 | C 计划 | P0 | 草案 | M2 | [modules/C-transfer-plan.md](modules/C-transfer-plan.md) |
| FR-C2 | 方法模板库（可配置） | C 计划 | P0 | 草案 | M2 | [modules/C-transfer-plan.md](modules/C-transfer-plan.md) |
| FR-C3 | 逐日任务卡 | C 计划 | P0 | 草案 | M2 | [modules/C-transfer-plan.md](modules/C-transfer-plan.md) |
| FR-C4 | 计划状态机 | C 计划 | P0 | 草案 | M2 | [modules/C-transfer-plan.md](modules/C-transfer-plan.md) |
| FR-C5 | 回退方案 | C 计划 | P0 | 草案 | M2 | [modules/C-transfer-plan.md](modules/C-transfer-plan.md) |
| FR-C6 | 安全规则拦截 | C 计划 | P0 | 草案 | M2 | [modules/C-transfer-plan.md](modules/C-transfer-plan.md) |
| FR-C7 | 计划时间轴 | C 计划 | P1 | 草案 | M2 | [modules/C-transfer-plan.md](modules/C-transfer-plan.md) |
| FR-I1 | 计划节点提醒 | I 提醒 | P1 | 草案 | M2 | [modules/I-reminders.md](modules/I-reminders.md) |
| FR-B3 | 奶粉对比 | B 奶粉库 | P2 | 草案 | M3 | [modules/B-milk-products.md](modules/B-milk-products.md) |
| FR-G3 | 选奶问卷 | G 内容 | P2 | 草案 | M3 | [modules/G-content.md](modules/G-content.md) |
| FR-I2 | 喂奶提醒（可选） | I 提醒 | P2 | 草案 | M3 | [modules/I-reminders.md](modules/I-reminders.md) |
| FR-I3 | 漏记提醒 | I 提醒 | P2 | 草案 | M3 | [modules/I-reminders.md](modules/I-reminders.md) |
| FR-B4 | 条码扫描录入 | B 奶粉库 | P3 | 草案 | — | [modules/B-milk-products.md](modules/B-milk-products.md) |
| FR-H3 | 家庭共享（成员与角色权限） | H 账户 | P2 | 开发中 | M4 | [modules/H-account.md](modules/H-account.md) |
| FR-H4 | 埋点与分析基建 | H 账户 | P0 | 草案 | M1 | [modules/H-account.md](modules/H-account.md) |
| FR-H5 | 开屏页与全局未登录态 | H 账户 | P0 | 草案 | M1 | [modules/H-account.md](modules/H-account.md) |
| FR-H6 | 用户资料与个人中心完善 | H 账户 | P1 | 开发中 | M5 | [modules/H-account.md](modules/H-account.md) |
| FR-H7 | 手机号绑定与账号安全 | H 账户 | P2 | 开发中 | M5 | [modules/H-account.md](modules/H-account.md) |
| FR-J1 | 管理员认证与白名单 | J 管理后台 | P0 | 草案 | M2 | [modules/J-admin-console.md](modules/J-admin-console.md) |
| FR-J2 | 奶粉库管理（含 CSV 导入） | J 管理后台 | P0 | 草案 | M2 | [modules/J-admin-console.md](modules/J-admin-console.md) |
| FR-J3 | 文章管理与审核流 | J 管理后台 | P1 | 草案 | M2 | [modules/J-admin-console.md](modules/J-admin-console.md) |
| FR-J4 | 转奶模板管理 | J 管理后台 | P1 | 草案 | M2 | [modules/J-admin-console.md](modules/J-admin-console.md) |
| FR-J5 | 数据看板 | J 管理后台 | P2 | 草案 | M2 | [modules/J-admin-console.md](modules/J-admin-console.md) |
| FR-K1 | AI 配置与安全网关 | K AI 助手 | P0 | 草案 | M4 | [modules/K-ai-assistant.md](modules/K-ai-assistant.md) |
| FR-K2 | 拍奶瓶快速记奶 | K AI 助手 | P1 | 草案 | M4 | [modules/K-ai-assistant.md](modules/K-ai-assistant.md) |
| FR-K3 | 拍奶粉罐识别 | K AI 助手 | P1 | 草案 | M4 | [modules/K-ai-assistant.md](modules/K-ai-assistant.md) |
| FR-K4 | 便便拍照评估 | K AI 助手 | P2 | 草案 | M4 | [modules/K-ai-assistant.md](modules/K-ai-assistant.md) |
| FR-K5 | 限定域问答 | K AI 助手 | P2 | 草案 | M4 | [modules/K-ai-assistant.md](modules/K-ai-assistant.md) |
| FR-J6 | AI 配置管理 | J 管理后台 | P1 | 草案 | M4 | [modules/J-admin-console.md](modules/J-admin-console.md) |
| FR-K6 | 供应商注册表 | K AI 助手 | P1 | 草案 | M4 | [modules/K-ai-assistant.md](modules/K-ai-assistant.md) |
| FR-K7 | 备用模型与故障转移 | K AI 助手 | P2 | 草案 | M4 | [modules/K-ai-assistant.md](modules/K-ai-assistant.md) |
| FR-K8 | 连通性自检 | K AI 助手 | P1 | 草案 | M4 | [modules/K-ai-assistant.md](modules/K-ai-assistant.md) |
| FR-J7 | 模型接入管理 | J 管理后台 | P1 | 草案 | M4 | [modules/J-admin-console.md](modules/J-admin-console.md) |
| FR-J8 | 管理员角色与权限（RBAC） | J 管理后台 | P1 | 开发中 | M5 | [modules/J-admin-console.md](modules/J-admin-console.md) |
| FR-J9 | 管理员账号管理 | J 管理后台 | P1 | 开发中 | M5 | [modules/J-admin-console.md](modules/J-admin-console.md) |
| FR-J10 | 用户查询（管理端） | J 管理后台 | P2 | 开发中 | M5 | [modules/J-admin-console.md](modules/J-admin-console.md) |
| FR-J11 | 操作审计日志 | J 管理后台 | P2 | 开发中 | M5 | [modules/J-admin-console.md](modules/J-admin-console.md) |
| FR-J12 | API 运行日志与排查查询 | J 管理后台 | P1 | 开发中 | M5 | [modules/J-admin-console.md](modules/J-admin-console.md) |

非功能需求：NFR-1 医学安全与内容合规 / NFR-2 隐私与数据合规 / NFR-3 性能 / NFR-4 兼容 / NFR-5 可维护性 / NFR-6 可用性 / NFR-7 可迁移性，统一见 [04-nfr.md](04-nfr.md)。接口契约规范见 [05-api-guidelines.md](05-api-guidelines.md)。

## 4. 关联文档

| 文档 | 关系 |
|---|---|
| `docs/ui/ui.pen`（配套 `docs/ui/audit.mjs` 画布审计、`docs/ui/DESIGN-GUIDELINES.md` 工作流规范） | 小程序 UI 设计图。画板 01–15 为现有页面与状态补全（v1 实现对照）；V2-01–V2-13 为本需求设计稿（**已生成**，画板名以「V2-」开头；其中 V2-12 复用画板 09），由模块文档「UI 画板对照」章节负责映射 |
| `docs/ui/admin.pen`（配套 `docs/ui/ADMIN-DESIGN-GUIDELINES.md` 管理端规范） | 管理后台 UI 设计图（画板 A-01–A-09，对应模块 J；A-01–A-09 已生成） |
| `.trae/documents/baby-milk-transfer-tech-arch.md` | 技术架构，随里程碑更新 |
| `supabase/migrations/` | 数据库基线与增量迁移，规范见 [03-data-model.md](03-data-model.md) |
