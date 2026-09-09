/**
 * 通知适配器测试：本地 http 服务器抓请求，验证钉钉加签 query、飞书 sign 字段、
 * 消息正文包含胜者、未配置渠道静默跳过。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { notifyRaceFinished, renderRaceText, type NotifyConfig } from '../src/notify.ts'
import { createHmac } from 'node:crypto'

let server: Server
let lastDing: { url: string; body: Record<string, unknown> } | null = null
let lastFeishu: { body: Record<string, unknown> } | null = null
let port = 0

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const body = JSON.parse(raw || '{}')
      if (req.url?.includes('ding')) lastDing = { url: req.url ?? '', body }
      else lastFeishu = { body }
      res.setHeader('content-type', 'application/json')
      res.end('{"errcode":0}')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as { port: number }).port
})

const SECRET = 'SECtest'
const SUMMARY = {
  runId: 'atest',
  task: '修复登录超时',
  autoWinner: 'alpha',
  mergedMember: 'alpha',
  members: [
    { name: 'alpha', verdict: '通过', durationMs: 4200 },
    { name: 'beta', verdict: '未通过', durationMs: 5100 },
  ],
}

describe('notifyRaceFinished', () => {
  it('钉钉：加签参数 + actionCard 正文含胜者', async () => {
    const cfg: NotifyConfig = {
      dingtalk: { webhook: `http://127.0.0.1:${port}/ding?access_token=x`, secret: SECRET },
    }
    const r = await notifyRaceFinished(cfg, SUMMARY)
    expect(r.dingtalk).toBe('sent')
    expect(lastDing).not.toBeNull()
    const u = new URL(lastDing!.url, 'http://127.0.0.1')
    expect(u.searchParams.get('timestamp')).toMatch(/^\d+$/)
    expect(u.searchParams.get('sign')).toMatch(/^[A-Za-z0-9+/=]+$/)
    // 签名可复算
    const ts = u.searchParams.get('timestamp')!
    const expectSign = createHmac('sha256', `${ts}\n${SECRET}`).update('').digest('base64')
    expect(u.searchParams.get('sign')).toBe(expectSign)
    const card = (lastDing!.body as { actionCard: { text: string } }).actionCard
    expect(card.text).toContain('alpha')
    expect(card.text).toContain('修复登录超时')
    expect(card.text).toContain('已合并')
  })

  it('飞书：sign 字段 = HMAC(secret, "ts\\nsecret")，正文含未通过队员', async () => {
    const cfg: NotifyConfig = { feishu: { webhook: `http://127.0.0.1:${port}/feishu`, secret: SECRET } }
    const r = await notifyRaceFinished(cfg, SUMMARY)
    expect(r.feishu).toBe('sent')
    expect(lastFeishu).not.toBeNull()
    const body = lastFeishu!.body as { timestamp: string; sign: string; content: { text: string } }
    const expectSign = createHmac('sha256', `${body.timestamp}\n${SECRET}`).update('').digest('base64')
    expect(body.sign).toBe(expectSign)
    expect(body.content.text).toContain('beta：未通过')
  })

  it('未配置的渠道 skipped，不抛错', async () => {
    const r = await notifyRaceFinished({}, SUMMARY)
    expect(r.dingtalk).toBe('skipped')
    expect(r.feishu).toBe('skipped')
  })
})

describe('renderRaceText', () => {
  it('无人合格时输出人工裁决提示', () => {
    const text = renderRaceText({ ...SUMMARY, autoWinner: null, mergedMember: null })
    expect(text).toContain('交人工裁决')
  })
})
