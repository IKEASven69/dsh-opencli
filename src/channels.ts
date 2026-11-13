/**
 * 通知渠道平台预设(0.4.6 任务 D):用户只填 webhook/token,格式适配层拼请求。
 *
 * 平台差异(2026-10 现行 API):
 *  - generic:POST JSON {title, body, at}(0.4.5 起的默认通道,保持不变);
 *  - feishu:{"msg_type":"text","content":{"text":"title\nbody"}};
 *  - dingtalk:{"msgtype":"text","text":{"content":"title\nbody"}};加签版 URL 带_TIMESTAMP_
 *      与 sign HMAC-SHA256(base64,urlencode)(secret 由面板/ctl 传,或 URL query 已带);
 *  - wecom:{"msgtype":"text","text":{"content":"title\nbody"}}(@机器人无关键字时需配置关键词,
 *      正文自动以 title 开头即可命中);
 *  - telegram:POST https://api.telegram.org/bot<token>/sendMessage {chat_id, text[, parse_mode]};
 *      chat_id 从 URL query 拆(?chat=),bot token 存储面拆独立字段、send 期回拼官方 path
 *      形态(0.1.4 候选 1 升级:429 retry_after 有界退避在通道层,parse_mode 可选透传)。
 * 加签纪律:secret 不落 state 明文日志,send 失败信息只含状态码不含签名材料。
 * @module dsh-opencli/channels
 */

import { createHmac } from 'node:crypto'

export type PlatformId = 'generic' | 'feishu' | 'dingtalk' | 'wecom' | 'telegram'

/** 从用户填的 URL/配置推断平台(面板下拉已显式选,推断只兜底)。 */
export function platformOf(url: string, explicit?: PlatformId): PlatformId {
  if (explicit !== undefined) return explicit
  if (url.includes('open.feishu.cn') || url.includes('feishu')) return 'feishu'
  if (url.includes('oapi.dingtalk.com')) return 'dingtalk'
  if (url.includes('qyapi.weixin.qq.com')) return 'wecom'
  if (url.includes('api.telegram.org')) return 'telegram'
  return 'generic'
}

/** 钉钉加签:timestamp+secret → sign 参数(URLEncode(base64(hmac-sha256)))。 */
export function dingtalkSign(secret: string, timestamp: number): string {
  const hmac = createHmac('sha256', `${timestamp}\n${secret}`).update('').digest('base64')
  return encodeURIComponent(hmac)
}

/** URL 附带 query 展开成对象(telegram chat_id/钉钉已有 sign 场景)。 */
function queryParams(u: URL): Record<string, string> {
  const o: Record<string, string> = {}
  for (const [k, v] of u.searchParams) o[k] = v
  return o
}

/** telegram 平台适配选项(0.1.4 候选 1:既有预设升级,非新写通道)。 */
export interface TelegramOpts {
  /** bot token:官方设计 token 必在 URL path(TLS 网络面安全);存储面拆独立字段后此处回拼。
   * 未给且 URL 无 bot 段 → 原样透传(既有手拼形态兼容)。 */
  telegramToken?: string
  /** 可选 parse_mode(MarkdownV2/HTML/Markdown;normalize 白名单,这里只透传)。 */
  parseMode?: string
}

/** 单平台请求构造:返回 {url, init} 由调用方 fetch;不识别的平台回 generic 兜底。 */
export function buildPayload(platform: PlatformId, url: string, title: string, body: string, at: string, now = Date.now(), opts?: TelegramOpts): { url: string; init: { method: 'POST'; headers: Record<string, string>; body: string } } {
  const text = `${title}\n${body}`
  switch (platform) {
    case 'feishu':
      return { url, init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ msg_type: 'text', content: { text } }) } }
    case 'dingtalk': {
      // 加签:URL 或面板 secret 提供;两者都没有就不签(机器人端会因安全设置拒绝,错误如实上抛)
      let finalUrl = url
      const u = new URL(url)
      const secret = queryParams(u).secret ?? ''
      if (secret.length > 0) {
        u.searchParams.delete('secret')
        u.searchParams.set('timestamp', String(now))
        u.searchParams.set('sign', dingtalkSign(secret, now))
        finalUrl = u.toString()
      }
      return { url: finalUrl, init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ msgtype: 'text', text: { content: text } }) } }
    }
    case 'wecom':
      return { url, init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ msgtype: 'text', text: { content: text } }) } }
    case 'telegram': {
      // 形态:https://api.telegram.org/bot<token>/sendMessage?chat=<chat_id>
      const u = new URL(url)
      const chat = queryParams(u).chat ?? queryParams(u).chat_id ?? ''
      // token 回拼:归一层把 bot<token> 段拆出独立字段(url 不落 token),send 期重组官方
      // path 形态;无 method 段补官方默认 /sendMessage。错误文案(WebhookChannel/platformOk)
      // 只带状态码与服务器 errmsg,永不回显本 URL。
      const token = opts?.telegramToken ?? ''
      const path = u.pathname.length > 0 && u.pathname !== '/' ? u.pathname : '/sendMessage'
      const target = token.length > 0 ? `${u.origin}/bot${token}${path}${u.search}` : url
      const bodyObj: Record<string, unknown> = { chat_id: chat, text }
      if (opts?.parseMode !== undefined && opts.parseMode.length > 0) bodyObj.parse_mode = opts.parseMode
      return { url: target, init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bodyObj) } }
    }
    default:
      return { url, init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, body, at }) } }
  }
}

/** 平台响应成功判定(各平台 200 语义一致,但错误体在 200 里——按 code/errcode 细判)。 */
export function platformOk(platform: PlatformId, status: number, respBody: string): { ok: boolean; error?: string } {
  if (status !== 200) return { ok: false, error: `HTTP ${status}` }
  if (platform === 'generic') return { ok: true }
  try {
    const j = JSON.parse(respBody) as { code?: unknown; errcode?: unknown; ok?: unknown; errmsg?: string }
    if (platform === 'feishu' && j.code !== undefined && Number(j.code) !== 0) return { ok: false, error: `feishu code ${String(j.code)}: ${j.errmsg ?? ''}` }
    if ((platform === 'dingtalk' || platform === 'wecom') && j.errcode !== undefined && Number(j.errcode) !== 0) return { ok: false, error: `${platform} errcode ${String(j.errcode)}: ${j.errmsg ?? ''}` }
    if (platform === 'telegram' && j.ok !== true) return { ok: false, error: `telegram: ${j.errmsg ?? 'not ok'}` }
    return { ok: true }
  } catch { return { ok: true } } // 200 但非 JSON:generic 兜底语义,视为送达
}
