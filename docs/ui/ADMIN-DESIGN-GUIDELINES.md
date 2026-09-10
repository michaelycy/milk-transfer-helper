# 管理端 UI 设计一致性规范（admin.pen 工作流）

> 适用范围：**仅管理后台**（`apps/admin`，antd 5 桌面 Web）。小程序设计遵循同目录 [DESIGN-GUIDELINES.md](DESIGN-GUIDELINES.md)，两者**不互相复用 token**；品牌色（primary）跨端延续，其余体系各随其设计基座。
> 设计基座：**antd 5**（`ConfigProvider` theme token）。本文件 token 与 antd 5 默认值同名对齐，实现时经 theme 注入，画稿内数值即逻辑 px。
> 唯一事实源：`docs/ui/admin.pen`（只允许通过 Pencil MCP `execute` 修改）。

## 1. 硬性规则（违反 = 审计不通过）

1. **单一写入通道**：只经 MCP `execute` 修改画布。
2. **禁止手搓数值**：字号、圆角、控件高度、间距必须取自下表 token；antd 派生色（hover/active）在实现层由 antd 算法生成，画稿只用基础 token。
3. **文本必须有 `fill`**（Pencil 文本默认无色）；换行文本必须 `textGrowth:"fixed-width"` + 显式宽度。
4. **每个节点必须有可读 `name`**；画板根节点命名 `A-NN 页面名`。
5. **画稿图标只用 lucide 库**；实现时映射 `@ant-design/icons` 同义图标（见 §5 对照表）。
6. **新增/修改画板后必须跑审计**：`node docs/ui/audit.mjs admin.pen`——裁剪/零尺寸、文本漏 fill、超字阶必须清零（有意出血在节点 `context` 注明）。

## 2. Token 速查（逻辑 px，来源 antd 5 默认值）

| 类别 | 值 |
|---|---|
| 品牌 | primary `#FF6B35`（theme.colorPrimary，跨端延续）· primary-weak `#FFF1EA`（浅底标签/选中态） |
| 状态色 | success `#52C41A` · warning `#FAAD14` · error `#FF4D4F` · info `#1677FF`（antd 默认，弱底可用各自 10% 透明 `#xxxxxx1A`） |
| 灰阶 | text `#262626` · text-secondary `#595959` · text-tertiary `#8C8C8C` · disabled `#BFBFBF` · border `#D9D9D9` · split `#F0F0F0` · bg-layout `#F5F5F5` · container `#FFFFFF` · sider `#262626`（深色侧栏，文字用 `#FFFFFF`/`#BFBFBF`） |
| 字号 | 12（辅助/表头说明）· 14（正文默认）· 16（小标题/按钮强调）· 20（页面标题 heading4）· 24（看板指标数字 heading3） |
| 字重 | 400 常规 · 500 中等（强调/表头）· 600 粗（页面标题/指标数字） |
| 圆角 | 6（控件 borderRadius：输入框/按钮/下拉）· 8（卡片 borderRadiusLG：Card/Drawer/Modal） |
| 控件高度 | 输入框/按钮/选择器 32 · 大按钮 40 · 顶栏 64 · 侧栏宽 200 · 表格行 47（middle 尺寸）· 表头行 47 |
| 间距 | 8 基数网格：8 / 16 / 24（页面与卡片内边距 24，卡片间距 16，控件间 8） |
| 画板 | 1440×900 桌面视口，根 frame `layout:"vertical"`、`clip:true`、bg `#F5F5F5` |

## 3. 布局引擎已知坑（与 ui.pen 同源，.pen ≠ CSS flexbox）

| 坑 | 规避 |
|---|---|
| `fit_content` 父 + 全 `fill_container` 子 = 循环依赖塌缩 | 父容器显式给宽（画板 1440、侧栏 200、内容区显式宽） |
| flex 子元素上的 `x/y` 被忽略 | 绝对定位必须 `layoutPosition:"absolute"` |
| `clip:true` 容器裁剪 absolute 兄弟 | 浮层（Modal/遮罩）放在**画板根**，不放内容区 |
| 文本无 `fill` 不可见；`fixed-width` 必须显式宽度 | 文本一律走 `T()` 辅助（默认 fill；换行走 `TW()` 带宽度） |
| 不支持 `gap:0` 回写、`minWidth`、`stretch` | 用具体值或分离节点实现 |

## 4. 标准工作流（模块 J：需求 → UI → 代码）

```
0. 需求先行：FR-J* 已入 docs/spec/modules/J-admin-console.md + README 状态总表，§5 画板对照表登记画板号
1. 画板骨架：根 frame 1440×900（A-05 弹窗态以 A-04 为底 + 根级遮罩/Modal）
2. 组件拼装：只从 §2 TOKEN 取值，按 §5 antd 组件对照落位，禁止新造数值
3. 自检：node docs/ui/audit.mjs admin.pen → 结构问题清零
4. 复核：导出 PNG（渲染管线就绪建议 ≥60s 后导出）逐张目检
5. 回链：画板 context 标注 FR 与 antd 组件；J-admin-console.md §5 更新状态
6. 代码：按画板实现；样式只用 antd token/主题（不引入自定义裸数值）
```

## 5. 画稿元素 ↔ antd 组件对照（实现映射）

| 画板元素 | antd 5 组件 / 实现 | lucide（画稿）→ @ant-design/icons |
|---|---|---|
| 侧栏 logo 区 | 橙色圆角块（28×28，radius 6）+ 双行文字（转奶日记/管理后台），下方 10% 白分隔线；实现用文字「奶」logo 块（antd 无 milk 图标，不为此单引依赖） | `milk`（白色 16）→ 文字「奶」logo 块 |
| 侧边导航 | `Layout.Sider` + `Menu` | `layout-dashboard` → DashboardOutlined；`package` → ShopOutlined；`file-text` → FileTextOutlined；`calendar-clock` → ScheduleOutlined |
| 顶栏 | `Layout.Header` + `Button` | `log-out` → LogoutOutlined |
| 数据表格 | `Table`（size=middle，rowKey） | — |
| 筛选栏 | `Input.Search` / `Select` / `Segmented` | `search` → SearchOutlined |
| 新建/编辑 | `Drawer` + `Form` | `plus` → PlusOutlined |
| CSV 导入 | `Modal` + `Upload.Dragger` + `Alert` | `upload` → UploadOutlined |
| 审核流转 | `Tag` + `Popconfirm` + `Button` | — |
| 模板节奏编辑 | `Form.List` 行编辑器 | — |
| 趋势图 | `recharts` LineChart | `trending-up` → 装饰用 |
| 提示/确认 | `message` / `Modal.confirm` | `circle-alert` → ExclamationCircleOutlined |
