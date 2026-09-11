-- ============================================================
-- 存量库表 COMMENT ON 中文注释（v2.0-draft11，长期维护性专项）
--
-- 服务的 FR：NFR-5 可维护性（库内自注释：字段含义/口径/枚举值在数据库内可直查，
--            不依赖翻代码或文档）；与 docs/spec/03-data-model.md 口径一致
-- 前置要求：20240523000000 ~ 20260911210000 全部迁移已应用
-- 回滚方式：无需回滚（纯注释，不改任何数据/结构/权限）
--
-- 约束：普通 Postgres 语法（COMMENT ON），无 auth.* 引用，自建 PostgreSQL 可原样平迁
-- ============================================================

-- ---------- users：用户主数据（NFR-7：身份事实源） ----------
comment on table public.users is '用户主数据：与认证账号一对一（id 即认证用户 id），C 端资料与微信 openid 回填（FR-H1/H6/H7）';
comment on column public.users.id is '用户唯一标识：与认证系统账号一一对应；本库所有业务表 user_id 的最终指向';
comment on column public.users.openid is '微信 openid（微信登录后回填，FR-H1）；唯一';
comment on column public.users.nickname is '用户昵称（个人中心展示，FR-H6）；NULL 表示未激活过资料';
comment on column public.users.avatar is '用户头像 URL（FR-H6）；NULL 表示未设置';
comment on column public.users.created_at is '建档时间（认证账号首次创建时由触发器自动建档）';

-- ---------- babies：宝宝档案（A1–A3） ----------
comment on table public.babies is '宝宝档案（FR-A1~A3）：转奶记录/计划/打卡的归属主体；每用户可建多个（FR-A2 多宝宝切换）';
comment on column public.babies.id is '宝宝唯一标识（UUID）';
comment on column public.babies.user_id is '所属用户：默认取当前会话用户，RLS own-policy 隔离；客户端禁止传入';
comment on column public.babies.nickname is '宝宝昵称/小名（默认「宝宝」）';
comment on column public.babies.birth_date is '出生日期：月龄计算（AI 上下文/段位提示 FR-A4）的基准';
comment on column public.babies.gender is '性别：male/female/unknown（默认 unknown）';
comment on column public.babies.created_at is '建档时间';
comment on column public.babies.updated_at is '最后更新时间（updated_at 触发器维护）';

-- ---------- weight_logs：体重记录（A3 / F3） ----------
comment on table public.weight_logs is '体重记录（FR-A3）：适应度观察的体格指标；同宝宝同日唯一';
comment on column public.weight_logs.id is '记录唯一标识（UUID）';
comment on column public.weight_logs.user_id is '所属用户：默认取当前会话用户，RLS own-policy 隔离';
comment on column public.weight_logs.baby_id is '所属宝宝（删除宝宝级联删体重记录）';
comment on column public.weight_logs.weight_g is '体重（克）：统一最小单位，展示层再换算 kg；必须 > 0';
comment on column public.weight_logs.measured_at is '测量日期（按天，非时刻）；unique(baby_id, measured_at) 同日一条';
comment on column public.weight_logs.created_at is '记录时间';

-- ---------- milk_products：奶粉库（B1，运营维护、客户端只读） ----------
comment on table public.milk_products is '奶粉库（FR-B1~B4）：运营侧维护的事实数据，客户端只读（仅 on_shelf 可见）；AI 识别匹配（FR-K3）的数据源';
comment on column public.milk_products.id is '产品唯一标识（UUID）';
comment on column public.milk_products.brand is '品牌名（如「飞鹤」）；与 name/stage/region 组成 SKU 业务键（CSV 导入 upsert 依赖）';
comment on column public.milk_products.name is '产品系列名（如「星飞帆」）';
comment on column public.milk_products.stage is '段位：1=0-6月 2=6-12月 3=12-36月 4=儿童粉；段位转换时机提示（FR-A4）依据';
comment on column public.milk_products.protein_type is '蛋白类型：intact 整蛋白 / partially_hydrolyzed 部分水解 / extensively_hydrolyzed 深度水解 / amino_acid 氨基酸；转奶方式选择的关键字段（FR-B1）';
comment on column public.milk_products.region is '版本地：domestic 国行 / overseas 海外';
comment on column public.milk_products.reg_no is '国食注字注册号（国行奶粉的配方注册证号，可空）';
comment on column public.milk_products.ingredients is '成分信息（jsonb：蛋白质/脂肪/碳水化合物等结构化数据，FR-B3 对比用）';
comment on column public.milk_products.status is '上架状态：on_shelf 在售（客户端可见）/ off_shelf 下架';
comment on column public.milk_products.updated_at is '最后更新时间（触发器维护；FR-B1 验收要求每条数据有运营侧更新时间）';
comment on column public.milk_products.mix_ratio is '参考冲调比例（按罐体标注，如「30g/240ml」；可空）';
comment on column public.milk_products.price_range is '参考价格区间（非实时报价，如「300-350 元」；可空）';

-- ---------- plan_templates：转奶方法模板（C2，运营可配置、客户端只读） ----------
comment on table public.plan_templates is '转奶方法模板（FR-C2）：逐日节奏的配置化事实源（混合法/隔顿法）；带版本号，进行中计划锁定创建时版本';
comment on column public.plan_templates.id is '模板唯一标识（UUID）';
comment on column public.plan_templates.method is '转奶方法：mixed 混合法（同顿按比例混合）/ interval 隔顿法（按顿替换）';
comment on column public.plan_templates.name is '模板展示名（如「混合法（7 天）」）';
comment on column public.plan_templates.days is '逐日节奏（jsonb 数组）：[{ratio: 当日新奶比例, label: 任务卡文案}, ...]，天数=数组长度';
comment on column public.plan_templates.version is '模板版本号：改节奏即升版本；transfer_plans.template_version 锁定引用';
comment on column public.plan_templates.is_default is '是否该方法的默认模板（创建向导首选）';
comment on column public.plan_templates.enabled is '启用状态：false 对客户端不可见（仅管理员可读）';
comment on column public.plan_templates.created_at is '创建时间';

-- ---------- transfer_plans：转奶计划（C1–C7） ----------
comment on table public.transfer_plans is '转奶计划（FR-C1~C7，核心模块）：一次转奶的完整生命周期（active→paused/rollback→completed/terminated）';
comment on column public.transfer_plans.id is '计划唯一标识（UUID）';
comment on column public.transfer_plans.user_id is '所属用户：默认取当前会话用户，RLS own-policy 隔离';
comment on column public.transfer_plans.baby_id is '所属宝宝；同宝宝同时仅一个非终态计划（uq_babies_active_plan 部分唯一索引强制）';
comment on column public.transfer_plans.from_product_id is '转出奶粉（milk_products 外键；库外品牌为 NULL，用 from_brand_text 兜底）';
comment on column public.transfer_plans.to_product_id is '转入奶粉（milk_products 外键；库外品牌为 NULL，用 to_brand_text 兜底）';
comment on column public.transfer_plans.from_brand_text is '转出品牌文本快照（不依赖奶粉库，复盘时原样展示）';
comment on column public.transfer_plans.to_brand_text is '转入品牌文本快照（AI 上下文「当前配方」取此字段）';
comment on column public.transfer_plans.reason is '转奶原因：stage 段位转换 / brand 品牌更换 / medical 医学需要 / other 其他';
comment on column public.transfer_plans.method is '转奶方法：mixed 混合法 / interval 隔顿法（与模板 method 一致）';
comment on column public.transfer_plans.template_id is '创建时引用的模板；删除模板置 NULL（SET NULL），计划不受影响';
comment on column public.transfer_plans.template_version is '创建时锁定的模板版本：模板后续调整不影响进行中计划（FR-C2 验收）';
comment on column public.transfer_plans.start_date is '计划开始日期（第 1 个喂养日）；current_day 等派生值由此推导，不落库（03 §2.7）';
comment on column public.transfer_plans.status is '计划状态：active 进行中 / paused 暂停 / rollback 回退中 / completed 完成 / terminated 终止（状态机见 00-glossary §3）';
comment on column public.transfer_plans.terminate_reason is '终止原因说明（status=terminated 时填写）';
comment on column public.transfer_plans.rollback_count is '回退次数（FR-C5）：判定转奶不顺的统计口径';
comment on column public.transfer_plans.created_at is '创建时间';
comment on column public.transfer_plans.updated_at is '最后更新时间（触发器维护）';

-- ---------- feed_records：喂养记录（D1–D5；重构自 records 表） ----------
comment on table public.feed_records is '喂养记录（FR-D1~D5）：每顿奶的事实数据；与计划联动（plan_id/plan_day）支撑进度与复盘';
comment on column public.feed_records.id is '记录唯一标识（UUID）';
comment on column public.feed_records.user_id is '所属用户：默认取当前会话用户，RLS own-policy 隔离';
comment on column public.feed_records.milk_brand is '【遗留字段】v1 品牌自由文本：已由 brand_text 承接（20250909000000 迁移），新代码禁止读写';
comment on column public.feed_records.feed_amount is '本次奶量（毫升），必须 > 0';
comment on column public.feed_records.feed_time is '喂奶时刻（timestamptz）；列表按此倒序，日聚合按喂养日（04:00 切点）归日';
comment on column public.feed_records.note is '备注（可空）';
comment on column public.feed_records.created_at is '记录创建时间';
comment on column public.feed_records.baby_id is '所属宝宝（v2 迁移回填；删除宝宝级联删记录）';
comment on column public.feed_records.plan_id is '关联转奶计划（可空=计划外喂奶）；删除计划置 NULL，记录保留（03 §2.2）';
comment on column public.feed_records.plan_day is '计划第几日（1 起）：与 plan_id 配对支撑逐日任务卡进度（FR-C3/D5）';
comment on column public.feed_records.product_id is '关联奶粉库产品（可空=未收录品牌）';
comment on column public.feed_records.brand_text is '品牌文本兜底（产品未收录/未关联时展示用；历史 milk_brand 已迁入）';
comment on column public.feed_records.finish_state is '喝完状态：finished 喝完 / partial 剩一部分 / refused 拒奶（适应度观察信号）';

-- ---------- symptom_logs：每日症状打卡（D3 / E1） ----------
comment on table public.symptom_logs is '每日症状打卡（FR-D3）：适应度规则引擎（FR-E1）的输入；同宝宝同喂养日唯一';
comment on column public.symptom_logs.id is '打卡唯一标识（UUID）';
comment on column public.symptom_logs.user_id is '所属用户：默认取当前会话用户，RLS own-policy 隔离';
comment on column public.symptom_logs.baby_id is '所属宝宝；unique(baby_id, log_date) 每宝宝每日一条';
comment on column public.symptom_logs.log_date is '打卡日期（喂养日口径，04:00 切点归日，00-glossary §2）';
comment on column public.symptom_logs.stool_count is '当日大便次数（默认 0）';
comment on column public.symptom_logs.stool_texture is '大便性状（自由观察词，AI 便便评估预填口径见 FR-D3/K4）';
comment on column public.symptom_logs.stool_color is '大便颜色（观察值，如 golden/green；打卡卡图选择）';
comment on column public.symptom_logs.has_rash is '当日是否有皮疹（适应度信号之一）';
comment on column public.symptom_logs.has_vomit is '当日是否呕吐';
comment on column public.symptom_logs.has_bloating is '当日是否胀气/腹胀';
comment on column public.symptom_logs.has_fever is '当日是否发热';
comment on column public.symptom_logs.crying_level is '哭闹程度：normal 正常 / fussy 烦躁 / crying_a_lot 哭闹不止';
comment on column public.symptom_logs.sleep_quality is '睡眠质量：normal 正常 / poor 差';
comment on column public.symptom_logs.note is '备注（可空）';
comment on column public.symptom_logs.created_at is '打卡时间';

-- ---------- alerts：预警留痕（E1/E2） ----------
comment on table public.alerts is '预警留痕（FR-E1/E2）：规则引擎产出的红/黄/绿分级预警，只增不改内容；生命周期 new→acked→resolved';
comment on column public.alerts.id is '预警唯一标识（UUID）';
comment on column public.alerts.user_id is '所属用户：默认取当前会话用户，RLS own-policy 隔离（不可删，delete 策略未授予）';
comment on column public.alerts.baby_id is '所属宝宝';
comment on column public.alerts.plan_id is '关联计划（可空=非计划期预警）；删除计划置 NULL';
comment on column public.alerts.level is '预警级别：red 红（建议就医）/ yellow 黄（加强观察）/ green 绿（正常）';
comment on column public.alerts.rule_code is '命中规则编码（FR-E1 规则引擎的事实键，如 stool_diarrhea_2d）';
comment on column public.alerts.payload is '预警详情（jsonb：触发上下文、降级原因 skipped 等）';
comment on column public.alerts.status is '处理状态：new 未读 / acked 已确认 / resolved 已消除（状态机见 00-glossary §3）';
comment on column public.alerts.acked_at is '确认时间（预警响应率口径依赖此字段）';
comment on column public.alerts.resolved_at is '消除时间';
comment on column public.alerts.created_at is '产生时间';

-- ---------- analytics_events：埋点事件（H4） ----------
comment on table public.analytics_events is '埋点事件（FR-H4）：产品指标的唯一数据源；客户端仅可插入本人事件、无查询权限（看板走服务端）';
comment on column public.analytics_events.id is '事件唯一标识（UUID）';
comment on column public.analytics_events.user_id is '发生用户：默认取当前会话用户；insert-only（03 §2）';
comment on column public.analytics_events.name is '事件名（事件清单与口径见 00-glossary §5）';
comment on column public.analytics_events.props is '事件属性（jsonb，键值随事件定义）';
comment on column public.analytics_events.occurred_at is '发生时间（客户端时钟不可信时以后端写入时间为准做口径说明）';

-- ---------- articles：知识文章（G1，运营维护） ----------
comment on table public.articles is '知识文章（FR-G1/G2）：运营侧维护、顾问审核后对客户端可见（review_status=approved）';
comment on column public.articles.id is '文章唯一标识（UUID）';
comment on column public.articles.title is '标题';
comment on column public.articles.content is '正文（纯文本；不做富文本，见模块 J §4）';
comment on column public.articles.category is '分类：转奶指南 / 奶粉知识 / 常见问题（对齐小程序知识页 TAB）';
comment on column public.articles.author is '作者/来源署名（可空）';
comment on column public.articles.read_count is '阅读计数：客户端无写权限，经 increment_read_count() RPC 原子自增';
comment on column public.articles.created_at is '创建时间';
comment on column public.articles.review_status is '审核状态：approved 审核通过（客户端可见）/ 其他状态仅管理员可见（G1 验收）';

-- ---------- favorites：收藏（用户自有） ----------
comment on table public.favorites is '文章收藏：unique(user_id, article_id) 不可重复收藏';
comment on column public.favorites.id is '收藏唯一标识（UUID）';
comment on column public.favorites.user_id is '所属用户：默认取当前会话用户，RLS own-policy 隔离';
comment on column public.favorites.article_id is '收藏的文章（删除文章级联删收藏）';
comment on column public.favorites.created_at is '收藏时间';

-- ---------- admins：管理员白名单（J1/J8） ----------
comment on table public.admins is '管理员白名单（FR-J1，角色化扩展见 FR-J8）：运营身份 = 认证邮箱账号 + 本表行；RLS 仅可读自己的行';
comment on column public.admins.user_id is '管理员用户 id（主键，认证账号）';
comment on column public.admins.email is '管理员邮箱（登录账号；后端鉴权与 FR-J9 管理页展示用）';
comment on column public.admins.note is '备注（如「首个管理员」）';
comment on column public.admins.created_at is '入组时间';

-- ---------- ai_configs：AI 场景配置（K1/K7，运营维护、客户端不可直读） ----------
comment on table public.ai_configs is 'AI 场景配置（FR-K1/K7）：chat/poop/bottle/can 四场景的模型路由、参数与每日限额；经后端网关读取，客户端不可直连本表';
comment on column public.ai_configs.id is '配置唯一标识（UUID）';
comment on column public.ai_configs.scene is '场景：chat 问答 / poop 便便评估 / bottle 奶瓶识别 / can 奶粉罐识别；唯一';
comment on column public.ai_configs.provider is '模型供应商名（ai_providers.name；供应商停用则场景按停用降级，FR-K6）';
comment on column public.ai_configs.model is '模型名（如 glm-4-flash）；行级探针支持 ''*'' 只验连通性（FR-K8）';
comment on column public.ai_configs.base_url is '场景级端点覆盖（可空=用注册表/内置默认端点）';
comment on column public.ai_configs.temperature is '采样温度（0~2，默认 0.30）';
comment on column public.ai_configs.max_tokens is '单次生成 token 上限（1~8192）';
comment on column public.ai_configs.daily_limit_per_user is '每用户每日调用上限（0=停用；配额按中国时区自然日，FR-K1）';
comment on column public.ai_configs.enabled is '场景启用开关：false 时端点走降级文案（FR-K1）';
comment on column public.ai_configs.note is '运营备注';
comment on column public.ai_configs.created_at is '创建时间';
comment on column public.ai_configs.updated_at is '最后更新时间（触发器维护；配置热更新依赖此值）';
comment on column public.ai_configs.fallback_provider is '备用供应商（FR-K7 故障转移：主调用失败重试一次）；NULL=不配置备用';
comment on column public.ai_configs.fallback_model is '备用模型名（与 fallback_provider 成对配置）';

-- ---------- ai_prompt_templates：提示词模板（版本化审核流） ----------
comment on table public.ai_prompt_templates is 'AI 提示词模板（NFR-1）：版本化 + 审核流（pending→approved/rejected）；服务端仅执行 approved 且 enabled 的版本';
comment on column public.ai_prompt_templates.id is '版本唯一标识（UUID）';
comment on column public.ai_prompt_templates.scene is '适用场景（chat/poop/bottle/can）；同场景多版本并存，唯一启用一条';
comment on column public.ai_prompt_templates.version is '版本号（同场景内递增）';
comment on column public.ai_prompt_templates.system_prompt is '系统提示词正文（支持 {baby_nickname} 等插值变量，FR-K5）';
comment on column public.ai_prompt_templates.review_status is '审核状态：pending 待审 / approved 通过（可执行）/ rejected 驳回';
comment on column public.ai_prompt_templates.review_note is '审核意见（驳回原因等）';
comment on column public.ai_prompt_templates.reviewed_at is '审核时间';
comment on column public.ai_prompt_templates.enabled is '启用开关：同场景仅一条 enabled（部分唯一索引）；与 approved 同时满足才可执行';
comment on column public.ai_prompt_templates.created_at is '创建时间';

-- ---------- ai_usage_logs：AI 调用记账（K1/K7/K8） ----------
comment on table public.ai_usage_logs is 'AI 调用记账（FR-K1/K7/K8）：配额判定与用量概览的数据源；客户端无任何权限（service_role 写入）';
comment on column public.ai_usage_logs.id is '记账唯一标识（UUID）';
comment on column public.ai_usage_logs.user_id is '发起用户（service_role 写入；探针调用记管理员 id）';
comment on column public.ai_usage_logs.scene is '场景（chat/poop/bottle/can）；连通性探针记 ''test''（FR-K8 口径）';
comment on column public.ai_usage_logs.success is '本次调用是否成功（失败调用同样留痕用于排障）';
comment on column public.ai_usage_logs.tokens is '消耗 token 数（护栏拦截/出域拦截为 0）';
comment on column public.ai_usage_logs.created_at is '调用时间（配额按中国时区自然日聚合）';
comment on column public.ai_usage_logs.fallback_used is '是否启用了备用模型（FR-K7 故障转移发生标记）';

-- ---------- ai_chat_messages：问答会话历史（K5） ----------
comment on table public.ai_chat_messages is 'AI 问答会话历史（FR-K5）：用户与助手消息成对落库；own RLS（查/删本人）';
comment on column public.ai_chat_messages.id is '消息唯一标识（UUID）';
comment on column public.ai_chat_messages.user_id is '所属用户：默认取当前会话用户，RLS own-policy 隔离';
comment on column public.ai_chat_messages.baby_id is '提问时关联的宝宝上下文（可空）';
comment on column public.ai_chat_messages.role is '消息角色：user 用户提问 / assistant 助手回答';
comment on column public.ai_chat_messages.scene is '来源场景（当前固定 chat，预留视觉场景追问扩展）';
comment on column public.ai_chat_messages.content is '消息正文（已经输出护栏处理的最终文案）';
comment on column public.ai_chat_messages.created_at is '消息时间';

-- ---------- ai_analyses：视觉分析结果（K2–K4，不存照片） ----------
comment on table public.ai_analyses is 'AI 视觉分析留痕（FR-K2/K3/K4）：只存结构化结果，不存照片（NFR-2 照片最小化）；own RLS（查/删本人）';
comment on column public.ai_analyses.id is '分析唯一标识（UUID）';
comment on column public.ai_analyses.user_id is '所属用户：默认取当前会话用户，RLS own-policy 隔离';
comment on column public.ai_analyses.baby_id is '关联宝宝（可空）';
comment on column public.ai_analyses.scene is '识别场景：poop 便便 / bottle 奶瓶 / can 奶粉罐';
comment on column public.ai_analyses.result is '结构化识别结果（jsonb：raw 原始输出 + 按场景规整字段，见后端 VISION_SCHEMAS）';
comment on column public.ai_analyses.confidence is '模型自报置信度（0~1）；低于阈值时客户端引导人工填写';
comment on column public.ai_analyses.created_at is '分析时间';

-- ---------- milk_product_submissions：补录队列（K3/B4/J6） ----------
comment on table public.milk_product_submissions is '奶粉补录队列（FR-K3/FR-B4）：AI 识别未命中时用户提交的候选；own insert/select + 管理员流转（FR-J6）';
comment on column public.milk_product_submissions.id is '提交唯一标识（UUID）';
comment on column public.milk_product_submissions.user_id is '提交用户：own RLS（可查本人提交、不可改他人）';
comment on column public.milk_product_submissions.source is '来源：ai_can 拍奶粉罐未命中 / barcode 扫码（FR-B4 预留）';
comment on column public.milk_product_submissions.payload is '提交内容（jsonb：识别结果 recognized 等，供管理员「转奶粉库」预填）';
comment on column public.milk_product_submissions.image_path is '补充照片路径（私有桶 ai-submissions；用户主动勾选才上传，NFR-2）';
comment on column public.milk_product_submissions.status is '处理状态：pending 待处理 / processed 已入库 / dismissed 已忽略';
comment on column public.milk_product_submissions.created_at is '提交时间';
comment on column public.milk_product_submissions.processed_at is '处理完成时间（状态流转时写入）';

-- ---------- ai_providers：供应商注册表（K6，配置驱动接入的事实源） ----------
comment on table public.ai_providers is 'AI 供应商注册表（FR-K6）：新增供应商零改代码；删除保护（停用且无场景引用）由触发器强制';
comment on column public.ai_providers.id is '注册唯一标识（UUID）';
comment on column public.ai_providers.name is '供应商名（唯一）：ai_configs.provider 的引用键；环境变量约定 AI_<大写名>_API_KEY';
comment on column public.ai_providers.base_url is 'API 端点（OpenAI 兼容协议根地址）';
comment on column public.ai_providers.note is '备注';
comment on column public.ai_providers.enabled is '启用状态：false 时引用它的场景按停用降级（FR-K6 验收）';
comment on column public.ai_providers.created_at is '创建时间';
comment on column public.ai_providers.updated_at is '最后更新时间（触发器维护）';

-- ---------- ai_provider_secrets：供应商密钥（加密落库，客户端零访问） ----------
comment on table public.ai_provider_secrets is '供应商密钥存储（FR-K6/NFR-2）：AES-256-GCM 密文；无任何客户端策略与授权，密文/明文永不出后端';
comment on column public.ai_provider_secrets.id is '行唯一标识（UUID）';
comment on column public.ai_provider_secrets.provider_name is '供应商名（唯一，ai_providers.name）；供应商删除时级联清理本行';
comment on column public.ai_provider_secrets.key_ciphertext is 'API Key 密文（AES-256-GCM，主密钥在环境变量 AI_KEY_MASTER_SECRET，不落库）';
comment on column public.ai_provider_secrets.key_last4 is '末 4 位掩码（管理端展示「已配置 · ****9876」用，不泄露密钥）';
comment on column public.ai_provider_secrets.updated_at is '设置/更新时间（触发器维护）';
