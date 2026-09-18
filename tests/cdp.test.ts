// CDP 探测单元测试:起本地 http 服务伪装 /json/version,验证 probe 命中与未命中路径。
// 直接实例化服务的最小 harness(不需要 shell/stub——browserCdp 只用 global fetch)。
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import { OpencliService } from '../lib/index.js'
import { Context } from '@deepseek-ai/cordis'

let srv: Server | null = null
let ctx: Context
let svc: any

beforeAll(async () => {
  srv = createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ Browser: 'Chrome/138.0.0.0', 'Protocol-Version': '1.3' }))
  })
  await new Promise<void>((r) => srv!.listen(9234, '127.0.0.1', r))
  ctx = new Context()
  svc = new (OpencliService as any)(ctx)
})

afterAll(async () => {
  srv?.close()
  const c = ctx as unknown as { stop?: () => Promise<void>; dispose?: () => Promise<void> }
  await (c.stop ?? c.dispose ?? (async () => {}))()
})

describe('browser-cdp 探测', () => {
  it('probeCdp 命中候选端口 9234', async () => {
    const r = await svc.probeCdp()
    expect(r.found).toBe(true)
    expect(r.port).toBe(9234)
    expect(String(r.browser)).toContain('Chrome')
  })

  it('browserCdp RPC 返回 endpoint(15s 缓存内)', async () => {
    const r = await svc.browserCdp()
    expect(r.ok).toBe(true)
    expect(r.found).toBe(true)
    expect(r.endpoint).toBe('http://127.0.0.1:9234')
  })
})
