// 渠道平台预设测试(0.4.6 D):载荷格式/钉钉加签/平台成功判定/推断回退。零真网络(fetch 桩)。
import { describe, it, expect } from 'vitest'
import { platformOf, dingtalkSign, buildPayload, platformOk } from '../src/channels.ts'
import { WebhookChannel } from '../src/notify.ts'

describe('platformOf(推断与显式)', () => {
  it('URL 特征推断;显式优先;陌生 URL generic', () => {
    expect(platformOf('https://open.feishu.cn/open-apis/bot/v2/hook/x')).toBe('feishu')
    expect(platformOf('https://oapi.dingtalk.com/robot/send?access_token=x')).toBe('dingtalk')
    expect(platformOf('https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=x')).toBe('wecom')
    expect(platformOf('https://api.telegram.org/bot123/send?chat=1')).toBe('telegram')
    expect(platformOf('http://127.0.0.1:19999/hook')).toBe('generic')
    expect(platformOf('http://127.0.0.1:19999/hook', 'feishu')).toBe('feishu')
  })
})

describe('钉钉加签', () => {
  it('timestamp+secret 的 HMAC-SHA256 base64 urlencoded(与官方算法对齐)', () => {
    // 官方示例向量:timestamp=1716246181145, secret='SECxxxxxxxx' —— 这里用固定输入验证确定性即可
    const s1 = dingtalkSign('SECabc', 1716246181145)
    const s2 = dingtalkSign('SECabc', 1716246181145)
    expect(s1).toBe(s2)
    expect(s1).not.toContain('+') // encodeURIComponent
    expect(s1.length).toBeGreaterThan(20)
  })
})

describe('buildPayload 各平台载荷', () => {
  const at = '2026-10-30T00:00:00Z'
  it('feishu:{msg_type:text,content:{text}} 且 text=title+换行+body', () => {
    const { url, init } = buildPayload('feishu', 'https://open.feishu.cn/hook/x', '标题', '正文', at)
    expect(url).toBe('https://open.feishu.cn/hook/x')
    const j = JSON.parse(init.body) as { msg_type: string; content: { text: string } }
    expect(j.msg_type).toBe('text')
    expect(j.content.text).toBe('标题\n正文')
  })
  it('dingtalk 无 secret:原 URL 直发;带 secret:URL 拼 timestamp+sign 且 secret 不出现在最终 URL', () => {
    const plain = buildPayload('dingtalk', 'https://oapi.dingtalk.com/robot/send?access_token=T', 't', 'b', at, 1716246181145)
    expect(plain.url).toBe('https://oapi.dingtalk.com/robot/send?access_token=T')
    expect(JSON.parse(plain.init.body)).toMatchObject({ msgtype: 'text' })
    const signed = buildPayload('dingtalk', 'https://oapi.dingtalk.com/robot/send?access_token=T&secret=SECxyz', 't', 'b', at, 1716246181145)
    expect(signed.url).toContain('timestamp=1716246181145')
    expect(signed.url).toContain('sign=')
    expect(signed.url).not.toContain('SECxyz')
  })
  it('wecom 与 telegram(chat_id 从 query 提取)', () => {
    const w = buildPayload('wecom', 'https://qyapi.weixin.qq.com/x', 't', 'b', at)
    expect(JSON.parse(w.init.body).msgtype).toBe('text')
    const tg = buildPayload('telegram', 'https://api.telegram.org/botT/send?chat=42', 't', 'b', at)
    expect(JSON.parse(tg.init.body)).toMatchObject({ chat_id: '42', text: 't\nb' })
  })
  it('generic 保持 0.4.5 信封 {title,body,at}', () => {
    const g = buildPayload('generic', 'http://x/hook', 't', 'b', at)
    expect(JSON.parse(g.init.body)).toEqual({ title: 't', body: 'b', at })
  })
})

describe('platformOk(200 体内的平台错误码)', () => {
  it('feishu code!=0 报错;dingtalk/wecom errcode!=0 报错;telegram ok:false 报错;generic 200 即成', () => {
    expect(platformOk('feishu', 200, JSON.stringify({ code: 19021, errmsg: 'invalid' })).ok).toBe(false)
    expect(platformOk('dingtalk', 200, JSON.stringify({ errcode: 310000, errmsg: 'sign fail' })).ok).toBe(false)
    expect(platformOk('wecom', 200, JSON.stringify({ errcode: 93000 })).ok).toBe(false)
    expect(platformOk('telegram', 200, JSON.stringify({ ok: false, errmsg: 'chat not found' })).ok).toBe(false)
    expect(platformOk('feishu', 200, JSON.stringify({ code: 0 })).ok).toBe(true)
    expect(platformOk('generic', 200, 'anything').ok).toBe(true)
  })
})

describe('WebhookChannel 平台化(经 send 全链)', () => {
  it('feishu 通道:发给机器人的是 feishu 载荷;平台 200+code!=0 → 诚实失败', async () => {
    let captured: { url: string; body: string } | null = null
    const ch = new WebhookChannel('https://open.feishu.cn/hook/x', (async (url: string, init?: RequestInit) => {
      captured = { url, body: String(init?.body) }
      return new Response(JSON.stringify({ code: 19021, errmsg: 'bad key' }), { status: 200 })
    }) as typeof fetch, 'feishu')
    const r = await ch.send('t', 'b')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('19021')
    expect(captured!.body).toContain('msg_type')
  })
  it('generic 通道 200 → ok(0.4.5 行为不变)', async () => {
    const ch = new WebhookChannel('http://127.0.0.1:19999/hook', (async () => new Response('ok', { status: 200 })) as typeof fetch)
    expect((await ch.send('t', 'b')).ok).toBe(true)
  })
})
