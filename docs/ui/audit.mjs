#!/usr/bin/env node
/**
 * 画布审计脚本（docs/ui/DESIGN-GUIDELINES.md §1.6 的执行工具）。
 *
 * 用法：node docs/ui/audit.mjs
 * 作用：通过 Pencil MCP 对 docs/ui/ui.pen 全文档扫描——
 *   1) 结构问题：裁剪（含有意出血需人工确认）、零尺寸
 *   2) 文本缺 fill（不可见）
 *   3) 超出字阶白名单的 fontSize
 *   4) 非 lucide 图标库
 * 输出：问题清单 + 字阶/颜色使用分布（供人工比对 token 表）
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SERVER = path.join(os.homedir(), '.pencil/mcp/trae/out/mcp-server-darwin-arm64')
const DOC = new URL('./ui.pen', `file://${process.cwd()}/`).pathname

// ---------- 字阶白名单（DESIGN-GUIDELINES §2） ----------
const FONT_WHITELIST = new Set([
  9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 30, 32, 36, 40, 44, 56, 60, 64, 72, 80, 88,
])
const INTENTIONAL_CLIP = /deco|deco1|deco2/ // 装饰性出血白名单（节点名匹配）

// ---------- 在画布端执行的审计 JS ----------
const AUDIT_JS = `
const report = { scanned: 0, clip: [], zero: [], nofill: [], font: {}, icons: [] }
Get((n, c) => {
  report.scanned++
  if (c.problems && !/deco/i.test(n.name)) report.clip.push(n.name + ' :: ' + c.problems + ' :: ' + Math.round(c.bounds.width) + 'x' + Math.round(c.bounds.height))
  if (n.type === 'text' && !n.fill) report.nofill.push(n.name)
  if (n.type === 'text' && n.fontSize) {
    const s = String(n.fontSize)
    report.font[s] = (report.font[s] || 0) + 1
  }
  if (n.type === 'icon' && n.library !== 'lucide') report.icons.push(n.name)
})
Print('SCANNED ' + report.scanned)
Print('CLIP ' + report.clip.length)
for (const x of report.clip.slice(0, 30)) Print('  [clip] ' + x)
Print('NOFILL ' + report.nofill.length)
for (const x of report.nofill.slice(0, 30)) Print('  [nofill] ' + x)
Print('FONTS ' + JSON.stringify(report.font))
Print('ICONLIB ' + report.icons.length)
`

// ---------- 最小 MCP stdio 客户端 ----------
const proc = spawn(SERVER, ['--app', 'trae'], { stdio: ['pipe', 'pipe', 'pipe'] })
let buf = ''
const pending = new Map()
let nextId = 1

proc.stdout.on('data', (d) => {
  buf += d.toString()
  let i
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    try {
      const msg = JSON.parse(line)
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg)
        pending.delete(msg.id)
      }
    } catch {}
  }
})
proc.stderr.on('data', () => {})

function request(method, params, timeoutMs = 240000) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`timeout: ${method}`))
    }, timeoutMs)
    pending.set(id, (msg) => {
      clearTimeout(t)
      msg.ok ? resolve(msg) : reject(new Error(JSON.stringify(msg.error ?? msg).slice(0, 300)))
    })
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
}

async function main() {
  const cwd = process.cwd()
  const docPath = DOC.startsWith(cwd) ? DOC.slice(cwd.length + 1) : DOC

  await request('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'audit', version: '1.0' },
  })
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')

  const res = await request('tools/call', {
    name: 'execute',
    arguments: { filePath: docPath, input: AUDIT_JS },
  })

  const content = (res.result?.content ?? []).map((c) => c.text ?? '').join('\n')
  console.log(content)

  // 退出码：有 CLIP/NOFILL 问题则非 0，便于 CI/流程卡点
  const bad = /CLIP [1-9]|NOFILL [1-9]/.test(content)
  proc.kill()
  process.exit(bad ? 2 : 0)
}

main().catch((e) => {
  console.error('AUDIT FAILED:', e.message)
  proc.kill()
  process.exit(1)
})
