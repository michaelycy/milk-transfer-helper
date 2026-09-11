-- ============================================================
-- AI 助手（模块 K）：场景配置 / 提示词版本 / 用量记账 / 会话历史 / 分析结果 / 补录队列
--
-- 服务的 FR：K1（配置与安全网关）、K2/K3（视觉识别落库与补录）、K4（结构化观察留痕）、K5（会话历史）、J6（管理端配置载体）
-- 前置要求：已应用 20240523000000_init_schema.sql、20250909000000_v2_feeding_plan_schema.sql、
--           20260909120000_admin_console.sql（本文件复用其中的 public.is_admin() 与 public.touch_updated_at()）
-- 回滚方式：按逆序 drop 本文件对象（见文件尾部注释）。
--
-- 要点：
--   1. 供应商密钥永不落库：ai_configs 不设密钥字段，密钥只存后端环境变量（NFR-2）。
--   2. ai_configs / ai_prompt_templates / ai_usage_logs 对客户端无任何授权：
--      小程序经后端 /v1/ai/* 访问（service_role），管理端经 RLS is_admin() 读写。
--   3. ai_chat_messages / ai_analyses 为用户数据：own-policy RLS（03 §2），注销级联删除。
--   4. 照片最小化（NFR-2）：不设照片列；FR-K3 补录照片存私有桶 ai-submissions（路径含 user_id），
--      仅在用户显式勾选时上传；分析即弃为默认。
--   5. 提示词审核流（NFR-1）：部分唯一索引保证同场景仅一个启用版本；服务端仅执行
--      review_status='approved' 且 enabled=true 的版本（应用层强制，见 app/api/ai.py）。
-- ============================================================

-- ---------- 场景配置（FR-K1，管理端 FR-J6 维护） ----------
create table if not exists public.ai_configs (
  id uuid primary key default gen_random_uuid(),
  scene varchar(20) not null unique check (scene in ('chat','poop','bottle','can')),
  provider varchar(30) not null default 'zhipu',
  model varchar(80) not null,
  base_url varchar(200),
  temperature numeric(3,2) not null default 0.30 check (temperature >= 0 and temperature <= 2),
  max_tokens int not null default 1024 check (max_tokens between 1 and 8192),
  daily_limit_per_user int not null default 10 check (daily_limit_per_user between 0 and 1000),
  enabled boolean not null default false,
  note varchar(200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists ai_configs_touch_updated_at on public.ai_configs;
create trigger ai_configs_touch_updated_at
  before update on public.ai_configs
  for each row execute function public.touch_updated_at();

-- ---------- 提示词模板（版本化 + 审核流，FR-K1/J6） ----------
create table if not exists public.ai_prompt_templates (
  id uuid primary key default gen_random_uuid(),
  scene varchar(20) not null check (scene in ('chat','poop','bottle','can')),
  version int not null default 1,
  system_prompt text not null,
  review_status varchar(20) not null default 'pending' check (review_status in ('pending','approved','rejected')),
  review_note varchar(300),
  reviewed_at timestamptz,
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_prompt_templates_scene on public.ai_prompt_templates (scene, version desc);

-- 同场景仅一个启用版本（J6 验收：启用新版自动停用旧版由应用层保证，唯一性由本索引兜底）
create unique index if not exists uq_ai_prompt_enabled_per_scene
  on public.ai_prompt_templates (scene) where enabled;

-- ---------- 用量记账（FR-K1，服务端写入，管理端只读） ----------
create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  scene varchar(20) not null,
  success boolean not null default true,
  tokens int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_scene_time on public.ai_usage_logs (scene, created_at);
create index if not exists idx_ai_usage_user_time on public.ai_usage_logs (user_id, scene, created_at);

-- ---------- 会话历史（FR-K5，own RLS） ----------
create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  baby_id uuid references public.babies(id) on delete set null,
  role varchar(10) not null check (role in ('user','assistant')),
  scene varchar(20) not null default 'chat',
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_chat_user_time on public.ai_chat_messages (user_id, created_at);

-- ---------- 视觉分析结果（FR-K2/K3/K4，不存照片） ----------
create table if not exists public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  baby_id uuid references public.babies(id) on delete set null,
  scene varchar(20) not null check (scene in ('poop','bottle','can')),
  result jsonb not null,
  confidence numeric(3,2) check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_analyses_user_time on public.ai_analyses (user_id, created_at);

-- ---------- 奶粉库补录队列（FR-K3 / FR-B4 / FR-J6） ----------
create table if not exists public.milk_product_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  source varchar(20) not null default 'ai_can' check (source in ('ai_can','barcode')),
  payload jsonb not null,
  image_path text,
  status varchar(20) not null default 'pending' check (status in ('pending','processed','dismissed')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_mps_status on public.milk_product_submissions (status, created_at);

-- ---------- 私有存储桶（FR-K3 补录照片，用户勾选才上传；路径约定 {user_id}/…） ----------
insert into storage.buckets (id, name, public)
values ('ai-submissions', 'ai-submissions', false)
on conflict (id) do nothing;

-- ---------- RLS ----------
alter table public.ai_configs enable row level security;
alter table public.ai_prompt_templates enable row level security;
alter table public.ai_usage_logs enable row level security;
alter table public.ai_chat_messages enable row level security;
alter table public.ai_analyses enable row level security;
alter table public.milk_product_submissions enable row level security;

-- 配置/提示词/用量：客户端无策略（无任何授权）；管理端只读 + 配置可写（J6）
create policy "ai_configs_admin_all" on public.ai_configs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "ai_prompts_admin_all" on public.ai_prompt_templates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "ai_usage_admin_read" on public.ai_usage_logs
  for select to authenticated using (public.is_admin());

-- 会话/分析：own-policy（03 §2）
create policy "ai_chat_own_select" on public.ai_chat_messages
  for select to authenticated using (auth.uid() = user_id);
create policy "ai_chat_own_insert" on public.ai_chat_messages
  for insert to authenticated with check (auth.uid() = user_id);
create policy "ai_chat_own_delete" on public.ai_chat_messages
  for delete to authenticated using (auth.uid() = user_id);

create policy "ai_analyses_own_select" on public.ai_analyses
  for select to authenticated using (auth.uid() = user_id);
create policy "ai_analyses_own_insert" on public.ai_analyses
  for insert to authenticated with check (auth.uid() = user_id);
create policy "ai_analyses_own_delete" on public.ai_analyses
  for delete to authenticated using (auth.uid() = user_id);

-- 补录队列：用户可插入/查看本人提交；管理员全量读 + 状态流转
create policy "mps_own_select" on public.milk_product_submissions
  for select to authenticated using (auth.uid() = user_id or public.is_admin());
create policy "mps_own_insert" on public.milk_product_submissions
  for insert to authenticated with check (auth.uid() = user_id);
create policy "mps_admin_update" on public.milk_product_submissions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- 最小授权（policy 是门禁，grant 只表意图） ----------
revoke all on public.ai_configs, public.ai_prompt_templates, public.ai_usage_logs,
  public.ai_chat_messages, public.ai_analyses, public.milk_product_submissions
  from anon, authenticated;

grant select, insert, update, delete on public.ai_configs to authenticated;
grant select, insert, update, delete on public.ai_prompt_templates to authenticated;
grant select on public.ai_usage_logs to authenticated;
grant select, insert, delete on public.ai_chat_messages to authenticated;
grant select, insert, delete on public.ai_analyses to authenticated;
grant select, insert, update on public.milk_product_submissions to authenticated;

-- Storage：ai-submissions 私有桶 —— 用户仅可读写自己 user_id/ 前缀；管理员可读（补录处理）
create policy "ai_submissions_own_write" on storage.objects
  for insert to authenticated with check (bucket_id = 'ai-submissions' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "ai_submissions_own_read" on storage.objects
  for select to authenticated using (bucket_id = 'ai-submissions' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------- 种子数据：四场景默认配置（默认关闭，由运营在 J6 配置并启用） ----------
insert into public.ai_configs (scene, provider, model, temperature, max_tokens, daily_limit_per_user, enabled, note)
values
  ('chat',   'zhipu', 'glm-4-flash',   0.60, 1024, 20, false, '限定域问答；出域与高危词由网关护栏处理'),
  ('poop',   'zhipu', 'glm-4v-flash',  0.20,  512,  3, false, '仅输出结构化观察，预警由 FR-E1 规则引擎判定'),
  ('bottle', 'zhipu', 'glm-4v-flash',  0.20,  256,  5, false, '识别奶量仅预填表单，不自动提交'),
  ('can',    'zhipu', 'glm-4v-flash',  0.20,  512,  5, false, '识别结果与奶粉库匹配，未命中走补录队列')
on conflict (scene) do nothing;

-- 版本唯一（J6 新建版本 max+1 的并发兜底）
create unique index if not exists uq_ai_prompt_scene_version
  on public.ai_prompt_templates (scene, version);

-- ---------- 提示词种子（FR-K1/K5：预置草稿，默认 pending 未启用） ----------
-- NFR-1：预置文案仅为顾问审核提供底稿；须经管理端审核（approved）并启用后方可生效。
-- 预置行在界面上完全可编辑：可「依此新建」修改为新版本，走同一审核流。
insert into public.ai_prompt_templates (scene, version, system_prompt, review_status, enabled)
values
  ('chat', 1,
   '你是「转奶日记」的喂养助手，只回答转奶方法、奶粉知识与喂养观察问题。' ||
   '当前宝宝：{baby_nickname}（{baby_age_months} 月龄），配方：{current_formula}，计划：{plan_day_label}。' ||
   '回答需结合上述上下文、具体可执行、保守稳妥；出现血便、持续发热、频繁呕吐、精神差等情况时提醒及时就医。' ||
   '禁止给出诊断结论、药物名称与剂量建议；超出转奶/奶粉/喂养范围的问题请引导至「知识」栏目或就医。',
   'pending', false),
  ('poop', 1,
   '你是婴儿便便观察助手。仅对图片输出客观、中性的结构化观察，不做任何医学判断。' ||
   '颜色限定：金黄/绿色/黑色/带血丝之一；性状限定：正常/稀软/稀水样/便秘之一；' ||
   '疑似异常仅描述可见特征（黏液、血丝、奶瓣等）；note 为不超过 60 字的中文中性描述，' ||
   '禁止使用诊断、疗效、用药相关表述。',
   'pending', false),
  ('bottle', 1,
   '你是奶瓶刻度识别助手。识别瓶身液面刻度对应的奶量毫升数，' ||
   '仅输出 JSON：{"volume_ml": 整数, "confidence": 0 到 1}。' ||
   '刻度模糊、液面不可见或非奶瓶图片时输出 {"volume_ml": -1, "confidence": 0}，不要猜测。',
   'pending', false),
  ('can', 1,
   '你是奶粉罐识别助手。识别罐体正面的品牌、系列名与适用段位，' ||
   '仅输出 JSON：{"brand": "品牌", "series": "系列名或 null", "stage": 1 到 4 或 null, "confidence": 0 到 1}。' ||
   '无法辨认时对应字段给 null；不要输出价格、推荐或任何评价性内容。',
   'pending', false)
on conflict do nothing;

-- ---------- 回滚（不可自动执行，供人工回退参考） ----------
-- drop policy "ai_submissions_own_read" on storage.objects;
-- drop policy "ai_submissions_own_write" on storage.objects;
-- delete from storage.buckets where id = 'ai-submissions';
-- drop table public.milk_product_submissions;
-- drop table public.ai_analyses;
-- drop table public.ai_chat_messages;
-- drop table public.ai_usage_logs;
-- drop table public.ai_prompt_templates;
-- drop table public.ai_configs;
