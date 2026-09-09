# UI 设计一致性规范（ui.pen 工作流）

> 目的：保证多轮迭代、多入口（AI / 人）产出画板时，风格与交互始终一致。
> 设计基座：`@taroify/core ^1.0.6`；设计 token 与 `node_modules/@taroify/core/styles/_variables.scss` 同名（注意 `$hd=2`，稿内数值即逻辑 pt）。
> 唯一事实源：`docs/ui/ui.pen`（只允许通过 Pencil MCP `execute` 修改）。

## 1. 硬性规则（违反 = 审计不通过）

1. **单一写入通道**：只经 MCP `execute` 修改画布（历史离线生成器 generate.mjs 已删除，勿再引入）。
2. **禁止手搓数值**：按钮高、字号、圆角、间距必须取自下表 token；展示级扩展仅允许用于品牌页（开屏/运营横幅），并在画板 `context` 标注。
3. **文本必须有 `fill`**（Pencil 文本默认无色，否则不可见）；换行文本必须 `textGrowth:"fixed-width"` + 显式宽度。
4. **每个节点必须有可读 `name`**；画板根节点命名 `NN 页面名` 或 `V2-NN 页面名`。
5. **图标只用 lucide 库**；实现时用 `@taroify/icons` 同名替换。
6. **新增/修改画板后必须跑审计**：`node docs/ui/audit.mjs`——结构问题（裁剪/零尺寸）、文本漏 fill、超字阶必须清零（有意出血需在节点 `context` 注明）。

## 2. Token 速查（逻辑 pt，来源 `_variables.scss`）

| 类别 | 值 |
|---|---|
| 语义色 | primary `#FF6B35`（主题化）· info `#2DB7F5` · success `#07C160` · warning `#FF976A` · danger `#EE0A24` · link `#576B95` |
| 灰阶 | text `#323233` · text-2 `#969799` · text-3 `#C8C9CC` · border `#EBEDF0` · active `#F2F3F5` · bg `#F7F8FA` · surface `#FFF` |
| 品牌扩展 | primary-light `#FF9A62` · primary-weak `#FFF1EA` · orange-dark `#ED6A0C` · orange-light `#FFFBE8` |
| 字号 | xs 10 / sm 12 / md 14 / lg 16（粗体 = 500）；展示级：20、22、24（品牌页可到 44+） |
| 圆角 | sm 2（按钮/Tag）· md 4（缩略图/提示卡）· lg 8（CellGroup 卡片）· max 999（胶囊）· Popup 顶部 16 |
| 组件高度 | NavBar 46 · Tabbar 50(+34 安全区) · Cell 44 · Button 32/44/50 · FloatingBubble 48 · Dialog 按钮 48 |

## 3. 布局引擎已知坑（.pen ≠ CSS flexbox）

| 坑 | 规避 |
|---|---|
| `fit_content` 父 + 全 `fill_container` 子 = 循环依赖 → 宽高塌缩为 0 | 父容器显式给宽（如 375/343），或至少一个子节点用固定尺寸 |
| flex 子元素上的 `x/y` 被忽略 | 绝对定位必须 `layoutPosition:"absolute"`（画板内浮层：遮罩/弹窗/FAB 均如此） |
| `clip:true` 的容器会裁剪 absolute 兄弟节点 | 浮层（弹窗/遮罩/FAB）放在**画板根**，不放内容区 |
| 文本无 `fill` 不可见；`fixed-width` 必须显式宽度 | 文本一律走 `T()` 辅助（默认 fill+宽度处理） |
| 布局引擎不支持 `gap:0` 回写、`minWidth`、`stretch` | 用具体值或分离节点实现 |

## 4. 标准工作流（需求 → UI → 代码）

```
0. 需求先行：FR 先入 docs/spec（模块文档 + README 状态总表），UI 画板对照表登记画板号
1. 画板骨架：画板根 frame（375×812, vertical, clip, placeholder:true）
2. 组件拼装：只从「已实例化组件 / TOKEN 表取值」，禁止新造数值
3. 自检：node docs/ui/audit.mjs → 清零结构问题
4. 复核：导出 PNG（新画板需等渲染管线就绪，建议 ≥60s 后导出）逐张目检
5. 回链：画板 context/caption 标注 FR 与 Taroify 组件；模块文档 UI 对照表更新状态
6. 代码：按画板实现；样式只引用 scss/CSS 变量（与 token 同名）
```

## 5. 组件化（进行中）

重复元素做成 `reusable` 组件、页面用 `ref` 实例化——**规格数值固化在组件内，改一处全局生效**，从根上消除手搓数值漂移。候选组件：NavBar / TabBar / Cell / CellGroup / Tag / Button / Empty / Field 行 / FloatingBubble / 段落骨架。
> 现状：v1 画板（01–08）与部分 V2 画板仍为散节点，规格审计兜底；新画板一律组件化。
