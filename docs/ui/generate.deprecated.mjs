#!/usr/bin/env node
/**
 * 生成 docs/ui/ui.pen —「婴儿转奶助手」现有页面 UI 设计
 * 设计基座：@taroify/core ^1.0.6（组件规格取自 node_modules/@taroify/core 各组件 _variables.scss，$hd=2，稿内为逻辑 pt）
 * 主题：--primary-color 覆盖为 PRD 主色 #FF6B35（默认 #1989FA）
 * 格式：Pencil (pen.dev) 开放 .pen JSON 格式
 * 页面映射：
 *   01 首页            src/pages/index/index.tsx
 *   02 转奶记录·列表    src/pages/records/index.tsx (currentView=0)
 *   03 转奶记录·图表    src/pages/records/index.tsx (currentView=1, echarts)
 *   04 添加转奶记录     src/pages/records/index.tsx AtFloatLayout → Taroify Popup
 *   05 育儿知识        src/pages/articles/index.tsx
 *   06 文章详情        src/pages/articles/detail.tsx
 *   07 我的            src/pages/profile/index.tsx
 */
import { readFileSync, writeFileSync } from 'node:fs'

const OUT = new URL('./ui.pen', import.meta.url).pathname

/* ---------------- Taroify 设计 tokens（逻辑 pt） ---------------- */
const C = {
  primary: '#FF6B35', primaryLight: '#FF9A62', primaryWeak: '#FFF1EA',
  info: '#2DB7F5', infoWeak: '#E8F7FE',
  success: '#07C160', warning: '#FF976A', danger: '#EE0A24',
  orangeDark: '#ED6A0C', orangeLight: '#FFFBE8',
  blue: '#1989FA', blueWeak: '#E8F3FE',
  text: '#323233', text2: '#969799', text3: '#C8C9CC',
  border: '#EBEDF0', active: '#F2F3F5', bg: '#F7F8FA', surface: '#FFFFFF',
  link: '#576B95', white: '#FFFFFF',
}
// Taroify 官方渐变方向均为 to right
const GRAD_BRAND = {
  type: 'gradient', gradientType: 'linear', rotation: 90,
  colors: [{ color: C.primaryLight, position: 0 }, { color: C.primary, position: 1 }],
}
const GRAD_TEAL = {
  type: 'gradient', gradientType: 'linear', rotation: 90,
  colors: [{ color: '#6FDBD4', position: 0 }, { color: '#3DBEB5', position: 1 }],
}

const VARIABLES = {
  'primary-color': { type: 'color', value: C.primary },
  'primary-color-light': { type: 'color', value: C.primaryLight },
  'primary-color-weak': { type: 'color', value: C.primaryWeak },
  'info-color': { type: 'color', value: C.info },
  'success-color': { type: 'color', value: C.success },
  'warning-color': { type: 'color', value: C.warning },
  'danger-color': { type: 'color', value: C.danger },
  'orange-dark': { type: 'color', value: C.orangeDark },
  'orange-light': { type: 'color', value: C.orangeLight },
  'text-color': { type: 'color', value: C.text },
  'text-color-2': { type: 'color', value: C.text2 },
  'text-color-3': { type: 'color', value: C.text3 },
  'border-color': { type: 'color', value: C.border },
  'active-color': { type: 'color', value: C.active },
  'background-color': { type: 'color', value: C.bg },
  'background-color-2': { type: 'color', value: C.surface },
  'link-color': { type: 'color', value: C.link },
  'gray-1': { type: 'color', value: '#F7F8FA' },
  'gray-2': { type: 'color', value: '#F2F3F5' },
  'gray-3': { type: 'color', value: '#EBEDF0' },
  'gray-5': { type: 'color', value: '#C8C9CC' },
  'gray-6': { type: 'color', value: '#969799' },
  'gray-7': { type: 'color', value: '#646566' },
  'gray-8': { type: 'color', value: '#323233' },
  'radius-sm': { type: 'number', value: 2 },
  'radius-md': { type: 'number', value: 4 },
  'radius-lg': { type: 'number', value: 8 },
  'navbar-height': { type: 'number', value: 46 },
  'tabbar-height': { type: 'number', value: 50 },
  'button-height-medium': { type: 'number', value: 44 },
  'button-height-large': { type: 'number', value: 50 },
}

/* ---------------- 帮助函数 ---------------- */
const usedIds = new Set()
function N(node, base) {
  node.name = node.name ?? base
  let id = base, i = 2
  while (usedIds.has(id)) id = `${base}-${i++}`
  usedIds.add(id)
  node.id = id
  return node
}
const frame = (o = {}, base = 'Frame') => N({ type: 'frame', ...o }, base)
const text = (content, o = {}, base = 'Text') =>
  N({ type: 'text', content, fill: C.text, fontSize: 14, ...o }, base)
const rect = (o = {}, base = 'Rect') => N({ type: 'rectangle', ...o }, base)
const ellipse = (o = {}, base = 'Ellipse') => N({ type: 'ellipse', ...o }, base)
const icon = (name, size, color, o = {}, base = name) =>
  N({ type: 'icon', library: 'lucide', icon: name, width: size, height: size, fill: color, ...o }, `ic-${base}`)
const path = (d, viewBox, o = {}, base = 'Path') =>
  N({ type: 'path', geometry: d, viewBox, ...o }, base)

const row = (children, o = {}, base = 'Row') => frame({ layout: 'horizontal', ...o, children }, base)
const col = (children, o = {}, base = 'Col') => frame({ layout: 'vertical', ...o, children }, base)

/* ---------------- Taroify 基础组件 ---------------- */
// hairline 分割线（1pt #EBEDF0）
const hairline = (base) => rect({ width: 'fill_container', height: 1, fill: C.border }, base)

// Taroify NavBar：46pt，白底，底部 hairline，标题 16/500，左右图标主色
function navBar(title, base, { back = false, rightIcon = null, light = false } = {}) {
  const iconColor = light ? C.white : C.primary
  const kids = [
    frame({ width: 44, height: 46, layout: 'horizontal', justifyContent: 'center', alignItems: 'center', children: back ? [icon('chevron-left', 18, iconColor, {}, 'back')] : [] }, `${base}-left`),
    text(title, { fontSize: 16, fontWeight: '500', fill: light ? C.white : C.text, textGrowth: 'fixed-width', width: 'fill_container', textAlign: 'center' }, `${base}-title`),
    frame({ width: 44, height: 46, layout: 'horizontal', justifyContent: 'center', alignItems: 'center', children: rightIcon ? [icon(rightIcon, 18, iconColor, {}, 'nav-right')] : [] }, `${base}-right`),
  ]
  return frame({
    width: 'fill_container', height: 46, layout: 'horizontal', alignItems: 'center', padding: [0, 0],
    fill: light ? null : C.surface,
    stroke: light ? null : C.border, strokeWidth: light ? null : { top: 0, right: 0, bottom: 1, left: 0 },
    children: kids,
  }, base)
}

// 系统状态栏（非 Taroify，系统 chrome）
function statusBar(color = C.text, base = 'statusbar') {
  return row([
    text('9:41', { fontSize: 15, fontWeight: '600', fill: color }, `${base}-time`),
    row([
      icon('signal', 13, color, {}, 'signal'),
      icon('wifi', 13, color, {}, 'wifi'),
      icon('battery-full', 19, color, {}, 'battery'),
    ], { gap: 5, alignItems: 'center' }, `${base}-icons`),
  ], { width: 'fill_container', height: 44, padding: [12, 24, 0, 24], justifyContent: 'space_between', alignItems: 'center' }, base)
}

const TABS = [
  { label: '首页', icon: 'house' },
  { label: '记录', icon: 'chart-column' },
  { label: '知识', icon: 'book-open' },
  { label: '我的', icon: 'user' },
]
// Taroify Tabbar：50pt + 安全区 34，图标 22，文字 12，选中主色，未选中 gray-7
function tabBar(active, base) {
  const items = TABS.map((t, i) => {
    const on = i === active
    return col([
      icon(t.icon, 22, on ? C.primary : '#646566', {}, `tab-${t.label}`),
      text(t.label, { fontSize: 12, fill: on ? C.primary : '#646566', fontWeight: on ? '500' : '400' }, `tab-label-${t.label}`),
    ], { width: 'fill_container', alignItems: 'center', gap: 2 }, `${base}-item-${t.label}`)
  })
  return frame({
    width: 'fill_container', height: 84, layout: 'horizontal', fill: C.surface, padding: [7, 4, 0, 4],
    stroke: C.border, strokeWidth: { top: 1, right: 0, bottom: 0, left: 0 },
    children: [...items, rect({ name: `${base}-indicator`, layoutPosition: 'absolute', x: 120, y: 76, width: 134, height: 5, cornerRadius: 3, fill: '#3232332E' }, `${base}-indicator`)],
  }, base)
}

// 页面骨架：状态栏 + NavBar + 内容区 (+ Tabbar)
function screen(name, base, { x, nav, tab = null, padV = 12, padTop = null, gap = 10, bg = C.bg, light = false, navBack = false, navRight = null }) {
  const content = col([], { width: 'fill_container', height: 'fill_container', padding: [padTop ?? padV, 16, padV, 16], gap, clip: true }, `${base}-content`)
  const kids = [statusBar(light ? C.white : C.text, `${base}-statusbar`), navBar(nav, `${base}-nav`, { light, back: navBack, rightIcon: navRight }), content]
  if (tab !== null) kids.push(tabBar(tab, `${base}-tabbar`))
  const root = frame({ name, x, y: 0, width: 375, height: 812, layout: 'vertical', fill: bg, clip: true, children: kids }, `${base}-root`)
  return { root, content }
}

// Taroify CellGroup inset：白底 radius 8 + hairline 描边
const insetGroup = (children, o = {}, base = 'CellGroup') =>
  frame({ fill: C.surface, cornerRadius: 8, stroke: C.border, strokeWidth: 1, layout: 'vertical', ...o, children }, base)

// CellGroup 组标题：14 gray-6
const groupTitle = (title, base) =>
  text(title, { fontSize: 14, fill: C.text2, width: 'fill_container', textGrowth: 'fixed-width', ...{ } }, base)

// Taroify Tag：medium padding 2/6，radius 2（rounded → pill）
function tag(label, kind, base, { rounded = true, plain = false } = {}) {
  const map = {
    primary: { fg: plain ? C.primary : C.white, bg: plain ? C.surface : C.primary, bd: C.primary },
    info: { fg: plain ? C.info : C.white, bg: plain ? C.surface : C.info, bd: C.info },
    success: { fg: plain ? C.success : C.white, bg: plain ? C.surface : C.success, bd: C.success },
    warning: { fg: plain ? C.warning : C.white, bg: plain ? C.surface : C.warning, bd: C.warning },
    danger: { fg: plain ? C.danger : C.white, bg: plain ? C.surface : C.danger, bd: C.danger },
    gray: { fg: plain ? C.text2 : C.white, bg: plain ? C.surface : C.text2, bd: C.text2 },
  }[kind]
  return frame({
    padding: [2, 6], cornerRadius: rounded ? 999 : 2,
    fill: plain ? C.surface : map.bg,
    stroke: map.bd, strokeWidth: 1,
    children: [text(label, { fontSize: 12, lineHeight: 1.35, fill: map.fg }, `${base}-t`)],
  }, base)
}

// Taroify Button：medium 44 / large 50 / small 32，shape=round → pill
function button(label, base, { height = 44, block = false, kind = 'primary', shape = 'round', fontSize = 14, leadIcon = null } = {}) {
  const solid = kind !== 'outlined'
  const w = block ? 'fill_container' : undefined
  const kids = [
    ...(leadIcon ? [icon(leadIcon, fontSize + 1, solid ? C.white : C.primary, {}, `${base}-ic`)] : []),
    text(label, { fontSize, fontWeight: '500', fill: solid ? C.white : C.primary }, `${base}-t`),
  ]
  return frame({
    width: w, height, padding: block ? [0, 16] : [0, height >= 44 ? 20 : 12], cornerRadius: shape === 'round' ? 999 : 2,
    fill: solid ? C.primary : C.surface,
    stroke: solid ? null : C.primary, strokeWidth: solid ? null : 1,
    layout: 'horizontal', justifyContent: 'center', alignItems: 'center', gap: 3,
  }, base)
}

// Taroify FloatingBubble：48pt，主色，initial gap 24，悬于 Tabbar 上方
function floatingBubble(base) {
  return frame({
    layoutPosition: 'absolute', x: 303, y: 656, width: 48, height: 48, cornerRadius: 24,
    fill: C.primary, layout: 'horizontal', justifyContent: 'center', alignItems: 'center',
    children: [icon('plus', 24, C.white, {}, 'bubble-plus')],
  }, base)
}

/* ---------------- 业务组件 ---------------- */
// 记录条目 = Taroify Cell（自定义左侧图标 + brief + value + 右箭头）
function recordCell({ brand, time, amount, base }) {
  return row([
    frame({ width: 36, height: 36, cornerRadius: 18, fill: C.primaryWeak, layout: 'horizontal', justifyContent: 'center', alignItems: 'center', children: [icon('milk', 18, C.primary, {}, 'milk')] }, `${base}-icon`),
    col([
      text(brand, { fontSize: 14, fontWeight: '500', lineHeight: 1.4 }, `${base}-title`),
      text(time, { fontSize: 12, fill: C.text2, lineHeight: 1.4 }, `${base}-brief`),
    ], { width: 'fill_container', gap: 2 }, `${base}-body`),
    text(amount, { fontSize: 14, fontWeight: '500', fill: C.primary }, `${base}-value`),
    icon('chevron-right', 16, C.text3, {}, `${base}-arrow`),
  ], { width: 'fill_container', padding: [10, 16], gap: 10, alignItems: 'center' }, base)
}

// 图文文章条目 = Taroify Cell 定制（缩略图 + 两行标题 + Tag/摘要）
function articleCell({ title, meta, tagLabel, tagKind, iconName, thumbBg, thumbFg, base }) {
  return row([
    frame({ width: 76, height: 57, cornerRadius: 4, fill: thumbBg, layout: 'horizontal', justifyContent: 'center', alignItems: 'center', children: [icon(iconName, 24, thumbFg, {}, 'thumb')] }, `${base}-thumb`),
    col([
      text(title, { fontSize: 14, fontWeight: '500', lineHeight: 1.45, textGrowth: 'fixed-width', width: 'fill_container' }, `${base}-title`),
      row([tag(tagLabel, tagKind, `${base}-tag`), text(meta, { fontSize: 12, fill: C.text3 }, `${base}-meta`)], { width: 'fill_container', gap: 8, alignItems: 'center' }, `${base}-metarow`),
    ], { width: 'fill_container', height: 57, gap: 6, justifyContent: 'space_between' }, `${base}-body`),
  ], { width: 'fill_container', padding: 12, gap: 12 }, base)
}

/* ---------------- 01 首页 ---------------- */
function screenHome(x) {
  const { root, content } = screen('01 首页 · Home', 'home', { x, nav: '婴儿转奶助手', tab: 0, gap: 10 })

  // 运营横幅（渐变 + Tag + Button small round）
  const hero = frame({
    name: 'home-hero', width: 'fill_container', height: 160, cornerRadius: 8, fill: GRAD_BRAND,
    layout: 'vertical', padding: [16, 16], gap: 7, clip: true,
    children: [
      ellipse({ name: 'home-hero-deco1', layoutPosition: 'absolute', x: 286, y: -34, width: 120, height: 120, fill: '#FFFFFF14' }),
      ellipse({ name: 'home-hero-deco2', layoutPosition: 'absolute', x: 232, y: 74, width: 86, height: 86, fill: '#FFFFFF12' }),
      frame({
        name: 'home-hero-milkwrap', layoutPosition: 'absolute', x: 307, y: 16, width: 40, height: 40, cornerRadius: 20,
        fill: '#FFFFFF26', layout: 'horizontal', justifyContent: 'center', alignItems: 'center',
        children: [icon('milk', 22, C.white, {}, 'hero-milk')],
      }),
      frame({
        name: 'home-hero-tag', children: [text('宝宝转奶 · 第 3 天', { fontSize: 10, fill: C.white }, 'home-hero-tagtext')],
        padding: [2, 6], cornerRadius: 2, fill: '#FFFFFF1F', stroke: '#FFFFFF59', strokeWidth: 1,
      }),
      text('记录宝宝成长的每一天', { fontSize: 18, fontWeight: '600', fill: C.white }, 'home-hero-title'),
      text('科学转奶 · 温柔过渡', { fontSize: 12, fill: '#FFFFFFE0' }, 'home-hero-sub'),
      button('立即记录', 'home-hero-cta', { height: 32, fontSize: 12, leadIcon: 'plus' }),
    ],
  }, 'home-hero')
  content.children.push(hero)

  // 统计 Grid（CellGroup inset + 大数字）
  const stat = (num, label, base) => col([
    text(num, { fontSize: 20, fontWeight: '600', lineHeight: 1.2 }, `${base}-num`),
    text(label, { fontSize: 12, fill: C.text2 }, `${base}-label`),
  ], { width: 'fill_container', alignItems: 'center', gap: 2 }, base)
  content.children.push(insetGroup([
    row([
      stat('6 次', '本周转奶次数', 'home-stat-1'),
      rect({ name: 'home-stat-div', width: 1, height: 32, fill: C.border }),
      stat('启赋 3段', '当前奶粉品牌', 'home-stat-2'),
    ], { width: 'fill_container', padding: [12, 8] }, 'home-stats-row'),
  ], {}, 'home-stats'))

  content.children.push(row([
    groupTitle('最近记录', 'home-gt1'),
    row([text('全部记录', { fontSize: 12, fill: C.primary }, 'home-more-t'), icon('chevron-right', 12, C.primary, {}, 'home-more-ic')], { gap: 2, alignItems: 'center' }, 'home-more'),
  ], { width: 'fill_container', justifyContent: 'space_between', alignItems: 'center', padding: [6, 0, 0, 0] }, 'home-sec1-head'))
  content.children.push(insetGroup([
    recordCell({ brand: '启赋蕴淳 3段', time: '今天 14:30 · 转奶第3天', amount: '210 ml', base: 'home-rec-1' }),
    hairline('home-div1'),
    recordCell({ brand: '爱他美卓萃 1段', time: '昨天 20:15 · 转奶第2天', amount: '230 ml', base: 'home-rec-2' }),
  ], {}, 'home-records'))

  content.children.push(groupTitle('推荐文章', 'home-gt2'))
  content.children.push(insetGroup([
    articleCell({
      title: '转奶期宝宝拒绝新奶粉？5 个技巧轻松过渡', meta: '8.6k 阅读 · 2天前', tagLabel: '转奶指南', tagKind: 'primary',
      iconName: 'baby', thumbBg: '#E8F7FE', thumbFg: C.info, base: 'home-art-1',
    }),
    hairline('home-div2'),
    articleCell({
      title: '一篇看懂奶粉段位怎么划分、怎么转', meta: '6.2k 阅读 · 5天前', tagLabel: '奶粉知识', tagKind: 'info',
      iconName: 'milk', thumbBg: C.primaryWeak, thumbFg: C.primary, base: 'home-art-2',
    }),
  ], {}, 'home-articles'))
  return root
}

/* ---------------- 02 记录 · 列表模式 ---------------- */
// Taroify Tabs（type=line）：44pt，文字 14，选中加粗深色 + 40×3 主色下划线
function taroTabs(activeIdx, labels, base) {
  const items = labels.map((label, i) => {
    const on = i === activeIdx
    return col([
      text(label, { fontSize: 14, fontWeight: on ? '500' : '400', fill: on ? C.text : '#646566' }, `${base}-t${i}`),
      rect({ name: `${base}-line${i}`, width: 40, height: 3, cornerRadius: 1.5, fill: on ? C.primary : '#00000000' }),
    ], { alignItems: 'center', gap: 3 }, `${base}-tab${i}`)
  })
  return row(items, { width: 'fill_container', height: 44, justifyContent: 'space_between', padding: [0, 24], alignItems: 'center', fill: C.surface }, base)
}

function timelineEntry({ time, brand, note, tagLabel, tagKind, amount, last, base }) {
  return row([
    col([
      text(time, { fontSize: 12, fontWeight: '500' }, `${base}-time`),
      ellipse({ name: `${base}-dot`, width: 8, height: 8, fill: C.primary }),
      rect({ name: `${base}-line`, width: 2, height: last ? 10 : 'fill_container', fill: C.border, cornerRadius: 1 }),
    ], { width: 44, height: 'fill_container', alignItems: 'center', gap: 4 }, `${base}-left`),
    col([
      row([
        text(brand, { fontSize: 14, fontWeight: '500', textGrowth: 'fixed-width', width: 'fill_container' }, `${base}-brand`),
        text(amount, { fontSize: 14, fontWeight: '600', fill: C.primary }, `${base}-amount`),
      ], { width: 'fill_container', gap: 8, alignItems: 'center' }, `${base}-row1`),
      row([
        tag(tagLabel, tagKind, `${base}-tag`),
        text(note, { fontSize: 12, fill: C.text2, textGrowth: 'fixed-width', width: 'fill_container' }, `${base}-note`),
        icon('pencil', 14, C.text3, {}, `${base}-edit`),
        icon('trash-2', 14, C.text3, {}, `${base}-del`),
      ], { width: 'fill_container', gap: 8, alignItems: 'center' }, `${base}-row2`),
    ], { width: 'fill_container', gap: 6 }, `${base}-card`),
  ], { width: 'fill_container' }, base)
}

function screenRecordsList(x) {
  const { root, content } = screen('02 转奶记录 · 列表', 'reclist', { x, nav: '转奶记录', tab: 1 })
  content.children.push(taroTabs(0, ['列表模式', '图表模式'], 'reclist-tabs'))
  content.children.push(groupTitle('今天 · 9月8日 · 3 次', 'reclist-g1'))
  content.children.push(insetGroup([
    timelineEntry({ time: '14:30', brand: '启赋蕴淳 3段', note: '比例 7:3，接受良好', tagLabel: '第3天', tagKind: 'primary', amount: '210 ml', base: 'reclist-e1' }),
    hairline('reclist-d1'),
    timelineEntry({ time: '10:05', brand: '启赋蕴淳 3段', note: '白天奶量正常', tagLabel: '第3天', tagKind: 'primary', amount: '195 ml', base: 'reclist-e2' }),
    hairline('reclist-d2'),
    timelineEntry({ time: '07:40', brand: '爱他美卓萃 1段', note: '晨奶，旧奶粉收尾', tagLabel: '旧奶粉', tagKind: 'warning', amount: '120 ml', base: 'reclist-e3' }),
  ], { padding: [12, 12] }, 'reclist-today'))
  content.children.push(groupTitle('昨天 · 9月7日 · 3 次', 'reclist-g2'))
  content.children.push(insetGroup([
    timelineEntry({ time: '20:15', brand: '爱他美卓萃 1段', note: '大便正常，无胀气', tagLabel: '第2天', tagKind: 'primary', amount: '230 ml', base: 'reclist-e4' }),
    hairline('reclist-d3'),
    timelineEntry({ time: '14:20', brand: '爱他美卓萃 1段', note: '午奶，接受良好', tagLabel: '第2天', tagKind: 'primary', amount: '205 ml', base: 'reclist-e5' }),
  ], { padding: [12, 12] }, 'reclist-yesterday'))
  content.children.push(floatingBubble('reclist-fab'))
  return root
}

/* ---------------- 03 记录 · 图表模式 ---------------- */
function smoothPath(pts) {
  if (pts.length < 2) return ''
  let d = `M ${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C ${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

function screenRecordsChart(x) {
  const { root, content } = screen('03 转奶记录 · 图表', 'recchart', { x, nav: '转奶记录', tab: 1 })
  content.children.push(taroTabs(1, ['列表模式', '图表模式'], 'recchart-tabs'))

  const kpi = (num, label, base, color = C.text) => col([
    text(num, { fontSize: 18, fontWeight: '600', fill: color, lineHeight: 1.2 }, `${base}-num`),
    text(label, { fontSize: 12, fill: C.text2 }, `${base}-label`),
  ], { width: 'fill_container', alignItems: 'center', gap: 2 }, base)
  content.children.push(insetGroup([
    row([
      kpi('218 ml', '日均奶量', 'recchart-k1'),
      kpi('18 条', '本周记录', 'recchart-k2'),
      kpi('第 3 天', '转奶进度 / 共7天', 'recchart-k3', C.primary),
    ], { width: 'fill_container', padding: [12, 8] }, 'recchart-kpis'),
  ], {}, 'recchart-kpicard'))

  const W = 343, H = 190, x0 = 14, dx = 52.5
  const yFor = ml => 170 - (ml - 140) * (150 / 120)
  const oMl = [175, 190, 185, 205, 215, 210, 225]
  const oPts = oMl.map((ml, i) => [x0 + i * dx, yFor(ml)])
  const tPts = [[x0 + 4 * dx, yFor(195)], [x0 + 5 * dx, yFor(200)], [x0 + 6 * dx, yFor(198)]]
  const lineO = smoothPath(oPts)
  const lineT = smoothPath(tPts)
  const areaO = `${lineO} L ${(x0 + 6 * dx).toFixed(1)},170 L ${x0},170 Z`

  const chartKids = []
  for (const ml of [260, 220, 180, 140]) {
    const y = yFor(ml)
    chartKids.push(rect({ name: `recchart-grid-${ml}`, x: 12, y, width: 319, height: 1, fill: ml === 140 ? C.border : '#F2F3F5' }))
    chartKids.push(text(String(ml), { fontSize: 10, fill: C.text3, x: 0, y: y - 5 }, `recchart-yl-${ml}`))
  }
  const dates = ['9/2', '9/3', '9/4', '9/5', '9/6', '9/7', '9/8']
  dates.forEach((d, i) => chartKids.push(text(d, { fontSize: 10, fill: C.text3, x: x0 + i * dx - 9, y: 174 }, `recchart-xl-${i}`)))
  chartKids.push(path(areaO, [0, 0, W, H], { name: 'recchart-area', fill: '#FF6B3514' }))
  chartKids.push(path(lineT, [0, 0, W, H], { name: 'recchart-line-teal', stroke: C.info, strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' }))
  chartKids.push(path(lineO, [0, 0, W, H], { name: 'recchart-line-orange', stroke: C.primary, strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' }))
  for (const [px, py] of oPts) chartKids.push(ellipse({ name: 'recchart-pt', x: px - 3.5, y: py - 3.5, width: 7, height: 7, fill: C.primary, stroke: C.surface, strokeWidth: 1.5 }))
  for (const [px, py] of tPts) chartKids.push(ellipse({ name: 'recchart-pt-t', x: px - 3, y: py - 3, width: 6, height: 6, fill: C.info, stroke: C.surface, strokeWidth: 1.5 }))

  content.children.push(insetGroup([
    row([
      text('喂养量趋势（近 7 天）', { fontSize: 14, fontWeight: '500' }, 'recchart-ctitle'),
      row([
        ellipse({ name: 'recchart-lg1', width: 8, height: 8, fill: C.primary }),
        text('启赋 3段', { fontSize: 10, fill: C.text2 }, 'recchart-lgt1'),
        ellipse({ name: 'recchart-lg2', width: 8, height: 8, fill: C.info }),
        text('爱他美 1段', { fontSize: 10, fill: C.text2 }, 'recchart-lgt2'),
      ], { gap: 5, alignItems: 'center' }, 'recchart-legend'),
    ], { width: 'fill_container', justifyContent: 'space_between', alignItems: 'center' }, 'recchart-chead'),
    frame({ name: 'recchart-plot', width: 'fill_container', height: H + 8, layout: 'none', clip: true, children: chartKids, context: '实现：echarts 折线图（项目已依赖 echarts 5），主色/辅色与图例一致' }, 'recchart-plotwrap'),
    col([
      row([
        rect({ name: 'recchart-tl-o', width: 218, height: 6, cornerRadius: 3, fill: C.primary }),
        rect({ name: 'recchart-tl-t', width: 93, height: 6, cornerRadius: 3, fill: C.info }),
      ], { width: 'fill_container', gap: 4 }, 'recchart-tlbar'),
      row([
        text('9/2 起使用启赋', { fontSize: 10, fill: C.text3 }, 'recchart-tl-l1'),
        text('9/6 起混合过渡', { fontSize: 10, fill: C.text3 }, 'recchart-tl-l2'),
      ], { width: 'fill_container', justifyContent: 'space_between' }, 'recchart-tllabels'),
    ], { width: 'fill_container', gap: 6 }, 'recchart-timeline'),
  ], { padding: [14, 16], gap: 10 }, 'recchart-chartcard'))
  content.children.push(floatingBubble('recchart-fab'))
  return root
}

/* ---------------- 04 添加转奶记录（Popup） ---------------- */
function screenAddSheet(x) {
  const { root, content } = screen('04 添加转奶记录', 'addsheet', { x, nav: '转奶记录', tab: 1 })
  for (let i = 0; i < 3; i++) {
    content.children.push(rect({ name: `addsheet-ghost-${i}`, width: 'fill_container', height: 64, cornerRadius: 8, fill: C.surface, stroke: C.border, strokeWidth: 1 }))
  }
  root.children.push(rect({ name: 'addsheet-backdrop', layoutPosition: 'absolute', x: 0, y: 0, width: 375, height: 812, fill: '#000000B3' }))

  // Taroify Field 行：label 14 + 值 14 + 右侧单位/箭头
  const fieldRow = (label, value, base, { leadUnit = null, arrow = 'arrow-down', placeholder = false } = {}) =>
    row([
      text(label, { fontSize: 14, fill: C.text }, `${base}-label`),
      text(value, { fontSize: 14, fill: placeholder ? C.text3 : C.text, textGrowth: 'fixed-width', width: 'fill_container', textAlign: 'right' }, `${base}-value`),
      ...(leadUnit ? [text(leadUnit, { fontSize: 14, fill: C.text2 }, `${base}-unit`)] : []),
      icon(arrow, 16, C.text3, {}, `${base}-arrow`),
    ], { width: 'fill_container', height: 48, padding: [0, 16], gap: 8, alignItems: 'center' }, base)

  const sheet = col([
    text('添加转奶记录', { fontSize: 16, fontWeight: '500', width: 'fill_container', textGrowth: 'fixed-width', textAlign: 'center' }, 'addsheet-title'),
    insetGroup([
      fieldRow('奶粉品牌', '启赋蕴淳 3段', 'addsheet-f-brand', { arrow: 'pencil' }),
      hairline('addsheet-d1'),
      fieldRow('喂养量 (ml)', '210', 'addsheet-f-amount', { leadUnit: 'ml', arrow: 'pencil' }),
      hairline('addsheet-d2'),
      fieldRow('喂养日期', '2026-09-08', 'addsheet-f-date'),
      hairline('addsheet-d3'),
      fieldRow('喂养时间', '14:30', 'addsheet-f-time'),
      hairline('addsheet-d4'),
      fieldRow('备注', '转奶第 3 天，比例 7:3', 'addsheet-f-note', { arrow: 'pencil' }),
    ], {}, 'addsheet-form'),
    row([
      ...['150', '180', '210', '240'].map((v, i) =>
        frame({ width: 'fill_container', layout: 'horizontal', justifyContent: 'center', children: [tag(v, i === 2 ? 'primary' : 'gray', `addsheet-chip-${v}`, { plain: i !== 2 })] }, `addsheet-chipw-${v}`)),
    ], { width: 'fill_container', padding: [0, 4] }, 'addsheet-chips'),
    button('保存记录', 'addsheet-submit', { height: 50, block: true, fontSize: 16 }),
    rect({ name: 'addsheet-indicator', width: 134, height: 5, cornerRadius: 3, fill: '#3232332E' }),
  ], {
    layoutPosition: 'absolute', x: 0, y: 368, width: 375, height: 444, fill: C.surface,
    cornerRadius: [16, 16, 0, 0], padding: [14, 16, 8, 16], gap: 12,
    children: undefined,
  }, 'addsheet-sheet')
  // Taroify Popup close icon：22pt gray-5，右上 16
  sheet.children.push(icon('x', 22, C.text3, { layoutPosition: 'absolute', x: 337, y: 14 }, 'addsheet-close'))
  root.children.push(sheet)
  return root
}

/* ---------------- 05 育儿知识 ---------------- */
function screenArticles(x) {
  const { root, content } = screen('05 育儿知识 · Articles', 'articles', { x, nav: '育儿知识', tab: 2, gap: 10, padTop: 4 })
  // Taroify Search：白容器 pad 10/12，输入区 gray-1 圆角 pill 高 34
  content.children.push(row([
    frame({
      width: 'fill_container', height: 34, cornerRadius: 999, fill: C.bg, padding: [0, 12], gap: 6,
      layout: 'horizontal', alignItems: 'center',
      children: [icon('search', 15, C.text2, {}, 'art-search-ic'), text('搜索转奶技巧、奶粉知识', { fontSize: 14, fill: C.text3 }, 'art-search-ph')],
    }, 'art-search-field'),
  ], { width: 'fill_container', padding: [4, 12, 6, 12], fill: C.surface }, 'art-search'))

  content.children.push(taroTabs(0, ['全部', '转奶指南', '奶粉知识', '常见问题'], 'art-tabs'))

  content.children.push(insetGroup([
    articleCell({
      title: '转奶期宝宝拒绝新奶粉？5 个技巧轻松过渡', meta: '8.6k 阅读 · 2天前', tagLabel: '转奶指南', tagKind: 'primary',
      iconName: 'baby', thumbBg: '#E8F7FE', thumbFg: C.info, base: 'art-a1',
    }),
    hairline('art-d1'),
    articleCell({
      title: '一篇看懂奶粉段位怎么划分、怎么转', meta: '6.2k 阅读 · 5天前', tagLabel: '奶粉知识', tagKind: 'info',
      iconName: 'milk', thumbBg: C.primaryWeak, thumbFg: C.primary, base: 'art-a2',
    }),
    hairline('art-d2'),
    articleCell({
      title: '转奶后腹泻或便秘？先排查这 4 个原因', meta: '1.2w 阅读 · 1周前', tagLabel: '常见问题', tagKind: 'warning',
      iconName: 'circle-alert', thumbBg: '#FFFBE8', thumbFg: C.orangeDark, base: 'art-a3',
    }),
    hairline('art-d3'),
    articleCell({
      title: '冲调水温与比例：新手爸妈最容易做错的 6 件事', meta: '9.8k 阅读 · 3天前', tagLabel: '奶粉知识', tagKind: 'info',
      iconName: 'lightbulb', thumbBg: '#E8F3FE', thumbFg: C.blue, base: 'art-a4',
    }),
  ], {}, 'art-list'))
  return root
}

/* ---------------- 06 文章详情 ---------------- */
function screenArticleDetail(x) {
  const { root, content } = screen('06 文章详情 · Detail', 'detail', { x, nav: '文章详情', padV: 16, gap: 14, bg: C.surface, navBack: true, navRight: 'share-2' })

  content.children.push(text('转奶期宝宝拒绝新奶粉？5 个技巧轻松过渡', { fontSize: 20, fontWeight: '600', lineHeight: 1.4, textGrowth: 'fixed-width', width: 'fill_container' }, 'detail-h1'))
  content.children.push(row([
    frame({
      width: 34, height: 34, cornerRadius: 17, fill: GRAD_BRAND, layout: 'horizontal', justifyContent: 'center', alignItems: 'center',
      children: [text('李', { fontSize: 13, fontWeight: '500', fill: C.white }, 'detail-avatar-t')],
    }, 'detail-avatar'),
    col([
      text('营养师 李婷', { fontSize: 14, fontWeight: '500' }, 'detail-author'),
      text('2026-09-06 发布 · 阅读 8,624', { fontSize: 12, fill: C.text2 }, 'detail-meta'),
    ], { width: 'fill_container', gap: 2 }, 'detail-authcol'),
    button('+ 关注', 'detail-follow', { height: 28, fontSize: 12, kind: 'outlined' }),
  ], { width: 'fill_container', gap: 10, alignItems: 'center' }, 'detail-byline'))

  content.children.push(frame({
    name: 'detail-figure', width: 'fill_container', height: 160, cornerRadius: 8, fill: C.bg,
    layout: 'horizontal', justifyContent: 'center', alignItems: 'center',
    context: '正文配图占位：新旧奶粉混合冲调示意（实现时替换为真实图片）',
    children: [icon('image', 28, C.text3, {}, 'detail-figure-ic')],
  }, 'detail-figurewrap'))

  content.children.push(text('很多新手爸妈一发现宝宝不愿意喝新奶粉，就立刻断定"宝宝不爱这个牌子"，其实更常见的原因是味道和口感发生了变化。宝宝需要 5～7 天的味觉适应期，循序渐进才是关键。', {
    fontSize: 15, lineHeight: 1.8, fill: '#323233', textGrowth: 'fixed-width', width: 'fill_container',
  }, 'detail-p1'))

  content.children.push(row([
    rect({ name: 'detail-h2-bar', width: 3, height: 14, cornerRadius: 1.5, fill: C.primary }),
    text('技巧 1：新旧奶粉混合过渡', { fontSize: 16, fontWeight: '500' }, 'detail-h2'),
  ], { width: 'fill_container', gap: 8, alignItems: 'center' }, 'detail-h2row'))

  content.children.push(frame({
    name: 'detail-tip', width: 'fill_container', cornerRadius: 4, fill: C.orangeLight,
    layout: 'horizontal', padding: 12, gap: 10,
    children: [
      icon('lightbulb', 18, C.orangeDark, {}, 'detail-tip-ic'),
      text('混合比例从 1:4 开始（新奶粉 1 份、旧奶粉 4 份），每 1～2 天提高一档，观察大便和情绪无异常再继续加量。', {
        fontSize: 13, lineHeight: 1.7, fill: C.orangeDark, textGrowth: 'fixed-width', width: 'fill_container',
      }, 'detail-tip-text'),
    ],
  }, 'detail-tipcard'))

  content.children.push(text('第一天到第三天，按 1:4 的比例将新旧奶粉混合；如果宝宝接受良好，第四天可以过渡到 1:2……全程大约需要一周时间，切勿操之过急。', {
    fontSize: 15, lineHeight: 1.8, fill: '#323233', textGrowth: 'fixed-width', width: 'fill_container',
  }, 'detail-p2'))

  // 底部操作栏（详情页无 Tabbar）
  content.children.push(frame({ name: 'detail-spacer', width: 'fill_container', height: 70 }, 'detail-spacer'))
  root.children.push(frame({
    name: 'detail-actionbar', layoutPosition: 'absolute', x: 0, y: 728, width: 375, height: 84, fill: C.surface,
    stroke: C.border, strokeWidth: { top: 1, right: 0, bottom: 0, left: 0 },
    layout: 'horizontal', padding: [8, 20, 0, 20], justifyContent: 'space_between', alignItems: 'center',
    children: [
      row([
        col([icon('star', 20, C.warning, {}, 'detail-fav-ic'), text('收藏', { fontSize: 10, fill: '#646566' }, 'detail-fav-t')], { alignItems: 'center', gap: 2 }, 'detail-fav'),
        col([icon('share-2', 20, '#646566', {}, 'detail-share-ic'), text('分享', { fontSize: 10, fill: '#646566' }, 'detail-share-t')], { alignItems: 'center', gap: 2 }, 'detail-sharebtn'),
      ], { gap: 28 }, 'detail-actions'),
      button('下一篇', 'detail-next', { height: 40, fontSize: 14, leadIcon: 'arrow-right' }),
      rect({ name: 'detail-indicator', layoutPosition: 'absolute', x: 120, y: 76, width: 134, height: 5, cornerRadius: 3, fill: '#3232332E' }),
    ],
  }, 'detail-bar'))
  return root
}

/* ---------------- 07 我的 ---------------- */
function screenProfile(x) {
  const { root, content } = screen('07 我的 · Profile', 'profile', { x, nav: '我的', tab: 3, padV: 14, padTop: 100, gap: 12, light: true })
  // 顶部渐变头部置于底层（覆盖状态栏+导航背后）
  root.children.unshift(frame({
    name: 'profile-header', layoutPosition: 'absolute', x: 0, y: 0, width: 375, height: 230, fill: GRAD_BRAND, clip: true,
    children: [
      ellipse({ name: 'profile-deco1', layoutPosition: 'absolute', x: 276, y: -42, width: 140, height: 140, fill: '#FFFFFF14' }),
      ellipse({ name: 'profile-deco2', layoutPosition: 'absolute', x: -40, y: 148, width: 110, height: 110, fill: '#FFFFFF10' }),
    ],
  }, 'profile-header'))

  content.children.push(row([
    frame({
      width: 56, height: 56, cornerRadius: 28, fill: '#FFFFFF40', stroke: '#FFFFFFB3', strokeWidth: 2,
      layout: 'horizontal', justifyContent: 'center', alignItems: 'center',
      children: [icon('baby', 28, C.white, {}, 'profile-avatar-ic')],
    }, 'profile-avatar'),
    col([
      text('豆豆妈妈', { fontSize: 18, fontWeight: '600', fill: C.white }, 'profile-nick'),
      text('ID: 8f3a2c1b · 宝宝 8 个月', { fontSize: 12, fill: '#FFFFFFD9' }, 'profile-uid'),
    ], { width: 'fill_container', gap: 3 }, 'profile-usercol'),
    icon('chevron-right', 18, '#FFFFFFB3', {}, 'profile-userchev'),
  ], { width: 'fill_container', gap: 12, alignItems: 'center' }, 'profile-user'))

  const stat = (num, label, base) => col([
    text(num, { fontSize: 20, fontWeight: '600', lineHeight: 1.2 }, `${base}-n`),
    text(label, { fontSize: 12, fill: C.text2 }, `${base}-l`),
  ], { width: 'fill_container', alignItems: 'center', gap: 2 }, base)
  content.children.push(insetGroup([
    row([
      stat('28', '记录总数', 'profile-s1'),
      stat('14', '坚持天数', 'profile-s2'),
      stat('6', '收藏文章', 'profile-s3'),
    ], { width: 'fill_container', padding: [12, 8] }, 'profile-stats-row'),
  ], {}, 'profile-statscard'))

  const menuItem = (label, ic, fg, bgc, base) => row([
    frame({ width: 28, height: 28, cornerRadius: 8, fill: bgc, layout: 'horizontal', justifyContent: 'center', alignItems: 'center', children: [icon(ic, 16, fg, {}, `${base}-ic`)] }, `${base}-icwrap`),
    text(label, { fontSize: 14, textGrowth: 'fixed-width', width: 'fill_container' }, `${base}-label`),
    icon('chevron-right', 16, C.text3, {}, `${base}-chev`),
  ], { width: 'fill_container', height: 50, padding: [0, 16], gap: 10, alignItems: 'center' }, base)
  content.children.push(insetGroup([
    menuItem('我的收藏', 'star', C.primary, C.primaryWeak, 'profile-m1'),
    hairline('profile-div1'),
    menuItem('关于我们', 'info', C.info, C.infoWeak, 'profile-m2'),
    hairline('profile-div2'),
    menuItem('设置', 'settings', C.blue, C.blueWeak, 'profile-m3'),
  ], {}, 'profile-menu'))

  content.children.push(col([
    text('婴儿转奶助手 v1.0.0', { fontSize: 12, fill: C.text3 }, 'profile-ver'),
    text('给宝宝更温柔的转奶体验', { fontSize: 12, fill: '#C8C9CC' }, 'profile-slogan'),
  ], { width: 'fill_container', alignItems: 'center', gap: 3 }, 'profile-footer'))
  return root
}

/* ---------------- 08 设计规范 ---------------- */
function screenSpec(x) {
  const swatch = (name, hex, base) => col([
    rect({ name: `${base}-sw`, width: 76, height: 44, cornerRadius: 4, fill: hex, stroke: C.border, strokeWidth: 1 }),
    text(name, { fontSize: 11, fontWeight: '500' }, `${base}-n`),
    text(hex, { fontSize: 10, fill: C.text2 }, `${base}-hex`),
  ], { gap: 4 }, base)
  const typeRow = (sample, spec, base, o = {}) => row([
    text(sample, { fontSize: o.fontSize ?? 16, fontWeight: o.fontWeight ?? '400', fill: C.text, textGrowth: 'fixed-width', width: 300 }, `${base}-s`),
    text(spec, { fontSize: 11, fill: C.text2 }, `${base}-spec`),
  ], { width: 'fill_container', justifyContent: 'space_between', alignItems: 'center' }, base)

  return frame({
    name: '08 设计规范 · Taroify Tokens', x, y: 0, width: 640, height: 812, fill: C.surface, cornerRadius: 8,
    stroke: C.border, strokeWidth: 1, layout: 'vertical', padding: 28, gap: 16, clip: true,
    children: [
      col([
        text('婴儿转奶助手 · 设计规范', { fontSize: 20, fontWeight: '600' }, 'spec-h'),
        text('基座 @taroify/core 1.0.6 · 主题 --primary-color: #FF6B35（默认 #1989FA）· tokens 与 @taroify/core/styles/_variables.scss 同名（$hd=2）', { fontSize: 12, fill: C.text2, textGrowth: 'fixed-width', width: 'fill_container', lineHeight: 1.5 }, 'spec-sub'),
      ], { gap: 6 }, 'spec-head'),

      text('色彩 Colors（CSS 变量）', { fontSize: 14, fontWeight: '500' }, 'spec-c-title'),
      col([
        row([
          swatch('primary-color', C.primary, 'spec-c1'), swatch('primary-light*', C.primaryLight, 'spec-c2'),
          swatch('info-color', C.info, 'spec-c3'), swatch('success-color', C.success, 'spec-c4'),
        ], { gap: 14 }, 'spec-crow1'),
        row([
          swatch('warning-color', C.warning, 'spec-c5'), swatch('danger-color', C.danger, 'spec-c6'),
          swatch('orange-dark', C.orangeDark, 'spec-c7'), swatch('orange-light', C.orangeLight, 'spec-c8'),
        ], { gap: 14 }, 'spec-crow2'),
        row([
          swatch('text-color', C.text, 'spec-c9'), swatch('text-color-2', C.text2, 'spec-c10'),
          swatch('text-color-3', C.text3, 'spec-c11'), swatch('border-color', C.border, 'spec-c12'),
        ], { gap: 14 }, 'spec-crow3'),
        row([
          swatch('active-color', C.active, 'spec-c13'), swatch('background-color', C.bg, 'spec-c14'),
          swatch('link-color', C.link, 'spec-c15'), swatch('blue(默认主色)', C.blue, 'spec-c16'),
        ], { gap: 14 }, 'spec-crow4'),
      ], { gap: 10 }, 'spec-colors'),

      text('字体 Typography（$hd=2 后的逻辑值）', { fontSize: 14, fontWeight: '500' }, 'spec-t-title'),
      col([
        typeRow('展示数字 / 大标题', '18-20 / 600（展示级扩展）', 'spec-ty0', { fontSize: 20, fontWeight: '600' }),
        typeRow('页面标题 font-size-lg', '16 / 500 · line-height 22', 'spec-ty1', { fontSize: 16, fontWeight: '500' }),
        typeRow('正文 font-size-md', '14 / 400 · line-height 20', 'spec-ty2', { fontSize: 14 }),
        typeRow('辅助 font-size-sm', '12 / 400 · line-height 18', 'spec-ty3', { fontSize: 12, fill: C.text2 }),
        typeRow('极小 font-size-xs', '10 / 400 · line-height 14', 'spec-ty4', { fontSize: 10, fill: C.text2 }),
      ], { gap: 8 }, 'spec-types'),

      text('组件 Components', { fontSize: 14, fontWeight: '500' }, 'spec-b-title'),
      col([
        row([
          button('主按钮 medium', 'spec-btn1', { height: 44, fontSize: 14 }),
          button('次按钮 outlined', 'spec-btn2', { height: 44, fontSize: 14, kind: 'outlined' }),
          button('小按钮 small', 'spec-btn3', { height: 32, fontSize: 12 }),
          frame({ width: 48, height: 48, cornerRadius: 24, fill: C.primary, layout: 'horizontal', justifyContent: 'center', alignItems: 'center', children: [icon('plus', 24, C.white, {}, 'spec-fab-ic')] }, 'spec-fab'),
        ], { gap: 14, alignItems: 'center' }, 'spec-btnrow'),
        row([
          tag('Tag primary', 'primary', 'spec-tag1'), tag('Tag info', 'info', 'spec-tag2'),
          tag('Tag warning', 'warning', 'spec-tag3'), tag('Tag danger', 'danger', 'spec-tag4'),
          tag('Plain gray', 'gray', 'spec-tag5', { plain: true }),
        ], { gap: 10 }, 'spec-tagsrow'),
        row([
          frame({ width: 180, height: 34, cornerRadius: 999, fill: C.bg, padding: [0, 12], gap: 6, layout: 'horizontal', alignItems: 'center', children: [icon('search', 15, C.text2, {}, 'spec-sch-ic'), text('Search 搜索', { fontSize: 14, fill: C.text3 }, 'spec-sch-t')] }, 'spec-search'),
          frame({ width: 160, height: 44, layout: 'horizontal', justifyContent: 'space_between', padding: [0, 24], alignItems: 'center', fill: C.surface, children: [
            text('Tab', { fontSize: 14, fill: '#646566' }, 'spec-tab-t0'),
            col([text('Tab active', { fontSize: 14, fontWeight: '500' }, 'spec-tab-t1'), rect({ name: 'spec-tab-line', width: 40, height: 3, cornerRadius: 1.5, fill: C.primary })], { alignItems: 'center', gap: 3 }, 'spec-tab1'),
          ] }, 'spec-tabs'),
          frame({ width: 120, height: 44, cornerRadius: 8, fill: C.surface, stroke: C.border, strokeWidth: 1, layout: 'horizontal', alignItems: 'center', padding: [0, 16], gap: 8, children: [text('Cell 单元格', { fontSize: 14, fill: C.text }, 'spec-cell-t'), icon('chevron-right', 16, C.text3, {}, 'spec-cell-ic')] }, 'spec-cell'),
        ], { gap: 14, alignItems: 'center' }, 'spec-row3'),
      ], { gap: 12 }, 'spec-comps'),

      text('圆角 & 尺寸（$hd=2）', { fontSize: 14, fontWeight: '500' }, 'spec-r-title'),
      row([
        rect({ name: 'spec-r2', width: 68, height: 44, cornerRadius: 2, fill: C.bg, stroke: C.border, strokeWidth: 1 }),
        rect({ name: 'spec-r4', width: 68, height: 44, cornerRadius: 4, fill: C.bg, stroke: C.border, strokeWidth: 1 }),
        rect({ name: 'spec-r8', width: 68, height: 44, cornerRadius: 8, fill: C.bg, stroke: C.border, strokeWidth: 1 }),
        col([
          text('radius-sm 2 · 按钮 / Tag 默认', { fontSize: 11, fill: C.text2 }, 'spec-rn1'),
          text('radius-md 4 · 缩略图 / 提示卡', { fontSize: 11, fill: C.text2 }, 'spec-rn2'),
          text('radius-lg 8 · CellGroup inset 卡片', { fontSize: 11, fill: C.text2 }, 'spec-rn3'),
          text('max 999 · round 按钮 / 搜索框 / 悬浮球', { fontSize: 11, fill: C.text2 }, 'spec-rn4'),
          text('NavBar 46 · Tabbar 50 · Cell 44 · Button 32/44/50 · Popup 圆角 16', { fontSize: 11, fill: C.text2 }, 'spec-rn5'),
        ], { gap: 5 }, 'spec-rn'),
      ], { gap: 14, alignItems: 'center' }, 'spec-radius'),
    ],
  }, 'spec-root')
}

/* ---------------- 画布说明（画板下方 caption） ---------------- */
const CAPTIONS = [
  ['01 首页 — Taroify: NavBar · Button(small round) · CellGroup · Cell · Tag · Tabbar', 0],
  ['02 转奶记录·列表 — Tabs · Cell · Tag(warning) · FloatingBubble · Tabbar', 455],
  ['03 转奶记录·图表 — Tabs · Grid · echarts 折线 · FloatingBubble', 910],
  ['04 添加转奶记录 — Backdrop(70%) · Popup(rounded 16) · Field · Tag · Button(large)', 1365],
  ['05 育儿知识 — Search(round) · Tabs · Cell · Tag', 1820],
  ['06 文章详情 — NavBar(back/share) · Button(outlined/medium) · NoticeBar 风格提示卡', 2275],
  ['07 我的 — 渐变头部 · CellGroup · Cell(图标菜单) · Tabbar', 2730],
  ['08 设计规范 — 与 @taroify/core/styles/_variables.scss 同名 tokens', 3185],
]

/* ---------------- 文档组装 ---------------- */
const original = JSON.parse(readFileSync(OUT, 'utf8'))
const doc = {
  version: original.version,
  fileToken: original.fileToken,
  variables: VARIABLES,
  children: [
    screenHome(0),
    screenRecordsList(455),
    screenRecordsChart(910),
    screenAddSheet(1365),
    screenArticles(1820),
    screenArticleDetail(2275),
    screenProfile(2730),
    screenSpec(3185),
    ...CAPTIONS.map(([label, cx], i) =>
      text(label, { x: cx, y: 826, fontSize: 12, fill: C.text2, name: `caption-${i + 1}` }, `caption-${i + 1}`)),
    N({
      type: 'note', name: 'README · 交接说明', x: 3185, y: -170, width: 640, fontSize: 12, fill: C.text2,
      content: [
        '「婴儿转奶助手」UI 设计 — 现有 5 个页面（7 个画板），设计基座 @taroify/core ^1.0.6（已安装，替换现有 taro-ui）。',
        '组件映射：Tabbar/NavBar/Search/Tabs/Cell/CellGroup/Tag/Button/Popup/Field/FloatingBubble/Empty/Divider；图标设计稿为 Lucide 线性稿，实现时用 @taroify/icons 同名替换。',
        '主题：--primary-color: #FF6B35（PRD 主色），tokens 与 @taroify/core/styles/_variables.scss 同名，注意 $hd=2（稿内数值即逻辑 pt）。',
        '页面 → 代码：01 首页 src/pages/index/index.tsx；02/03/04 转奶记录 src/pages/records/index.tsx；05 育儿知识 src/pages/articles/index.tsx；06 文章详情 src/pages/articles/detail.tsx；07 我的 src/pages/profile/index.tsx。',
        '设计依据 PRD 4.1：主色 #FF6B35、辅助色 #4ECDC4（=info 青 #2DB7F5 语义位）、卡片式布局、按钮 ≥44px。',
      ].join('\n'),
    }, 'readme-note'),
  ],
}

/* ---------------- 校验 ---------------- */
const errors = []
const ICON_WHITELIST = new Set(['signal', 'wifi', 'battery-full', 'chevron-left', 'chevron-right', 'chevron-down', 'arrow-down', 'arrow-right', 'house', 'chart-column', 'book-open', 'user', 'search', 'milk', 'baby', 'plus', 'x', 'pencil', 'trash-2', 'star', 'share-2', 'clock', 'calendar', 'lightbulb', 'image', 'circle-alert', 'info', 'settings'])
const ENTITY_PROPS = new Set(['type', 'id', 'name', 'context', 'reusable', 'theme', 'enabled', 'opacity', 'flipX', 'flipY', 'layoutPosition', 'metadata', 'rotation', 'x', 'y', 'width', 'height', 'fill', 'stroke', 'strokeWidth', 'effect', 'blendMode', 'clip', 'cornerRadius', 'layout', 'gap', 'padding', 'justifyContent', 'alignItems', 'children', 'placeholder', 'slot', 'geometry', 'viewBox', 'fillRule', 'innerRadius', 'startAngle', 'sweepAngle', 'polygonCount', 'icon', 'library', 'weight', 'strokeLinecap', 'strokeLinejoin', 'ref', 'descendants', 'content', 'scriptUri', 'inputs',
  'fontSize', 'fontWeight', 'lineHeight', 'textAlign', 'textAlignVertical', 'textGrowth', 'letterSpacing', 'fontStyle', 'underline', 'strikethrough', 'href', 'fontFamily'])

function walk(node, parentLayout) {
  if (!node.id || node.id.includes('/')) errors.push(`bad id: ${node.id}`)
  for (const k of Object.keys(node)) {
    if (k === 'children') continue
    if (!ENTITY_PROPS.has(k)) errors.push(`${node.id}: unknown property '${k}'`)
  }
  if (node.type === 'text') {
    if (!node.fill) errors.push(`${node.id}: text without fill`)
    if ((node.textGrowth ?? 'auto') === 'fixed-width' && node.width === undefined) errors.push(`${node.id}: fixed-width text without width`)
    if (node.width === '100%') errors.push(`${node.id}: width 100% rejected`)
  }
  if (node.type === 'icon' && !ICON_WHITELIST.has(node.icon)) errors.push(`${node.id}: icon not in whitelist '${node.icon}'`)
  if (node.fill && typeof node.fill === 'object' && !Array.isArray(node.fill) && node.fill.type === 'gradient') {
    if (!Array.isArray(node.fill.colors) || node.fill.colors.some(c => typeof c.color !== 'string' || typeof c.position !== 'number')) errors.push(`${node.id}: bad gradient`)
    if (!['linear', 'radial', 'angular'].includes(node.fill.gradientType)) errors.push(`${node.id}: bad gradientType`)
  }
  if (node.type === 'frame' && node.layout !== undefined && !['none', 'vertical', 'horizontal'].includes(node.layout)) errors.push(`${node.id}: bad layout`)
  if (node.type === 'path' && !node.viewBox) errors.push(`${node.id}: path without viewBox`)
  const pl = node.layout ?? 'none'
  for (const ch of node.children ?? []) {
    if ((pl === 'vertical' || pl === 'horizontal') && ch.layoutPosition !== 'absolute' && ch.x !== undefined) errors.push(`${ch.id}: x set on flex child (ignored)`)
    walk(ch, pl)
  }
}
doc.children.forEach(c => walk(c, 'none'))

const idList = []
;(function collect(n) { idList.push(n.id); (n.children ?? []).forEach(collect) })(doc)
const dup = idList.filter((v, i) => idList.indexOf(v) !== i)
if (dup.length) errors.push(`duplicate ids: ${dup.join(',')}`)

if (errors.length) {
  console.error('VALIDATION FAILED:')
  for (const e of errors) console.error(' -', e)
  process.exit(1)
}

writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n')
console.log(`OK wrote ${OUT}`)
console.log(`nodes: ${idList.length}, size: ${(JSON.stringify(doc).length / 1024).toFixed(1)} KB`)
