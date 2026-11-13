/**
 * 脱敏纯函数层(通知配置面的展示口径,服务端与面板共用):
 * 与 notify.ts 的 SCRUB_RULES 分工——那里洗「发送内容」(query 参数/本机路径/令牌),
 * 这里洗「配置展示」(面板回显/摘要文案)。URL 内嵌凭据类字段(bark device_key、
 * ntfy topic/token、telegram bot token、pushover token/user)一律中间遮蔽只留尾段,
 * 完整凭据与完整 URL path 绝不回显(§九.1 跨通道必答题:存储面走拆解落盘,展示面走遮蔽;
 * notify-test/错误文案不回显纪律的展示面延伸)。
 * 纯函数零依赖:client.ts(面板 bundle)与 notify.ts(服务端)同源引用,双端口径不分叉。
 * @module dsh-opencli/redact
 */

/**
 * 中段遮蔽:保留首 2 字符(前缀可辨,如 tk_、sk_)与尾 4 字符,中间以 **** 代替;
 * 过短(<8 字符)整段遮蔽为 ****——尾部太短时尾 4 位本身就近乎全量,宁多删不漏一条。
 */
export function maskSecretTail(v: string): string {
  if (v.length < 8) return '****'
  return `${v.slice(0, 2)}****${v.slice(-4)}`
}

/** describeNotifyChannel 的最小输入形状(NotifyChannelConfig 的凭据类字段投影)。 */
export interface NotifyChannelEcho {
  type: string
  url?: string
  deviceKey?: string
  topic?: string
  token?: string
  user?: string
  telegramToken?: string
}

/**
 * 单条通知配置的回显摘要:类型 + host + 凭据遮蔽段。永不回显完整凭据或完整 URL path;
 * host 只出域名(端口保留,自host 场景可辨),路径段一律不出——bark/ntfy 的官方分享
 * URL 凭据段在 path,回显 path 即回显凭据。
 */
export function describeNotifyChannel(c: NotifyChannelEcho): string {
  let host = ''
  try { host = new URL(c.url ?? '').host } catch { host = '' }
  switch (c.type) {
    case 'bark':
      return `bark ${host.length > 0 ? host : '(服务器未填)'} · key ${c.deviceKey !== undefined ? maskSecretTail(c.deviceKey) : '(未拆出)'}`
    case 'ntfy': {
      const tok = c.token !== undefined ? ` · token ${maskSecretTail(c.token)}` : ''
      return `ntfy ${host.length > 0 ? host : '(服务器未填)'} · topic ${c.topic !== undefined ? maskSecretTail(c.topic) : '(未拆出)'}${tok}`
    }
    case 'pushover':
      return `pushover · token ${c.token !== undefined ? maskSecretTail(c.token) : '(未填)'} · user ${c.user !== undefined ? maskSecretTail(c.user) : '(未填)'}`
    case 'email': {
      // SMTP URL 的 userinfo 段是用户名/授权码:只出 host,凭据存在与否用遮蔽占位表达
      let hasCred = false
      try { hasCred = new URL(c.url ?? '').username.length > 0 } catch { hasCred = false }
      return `email ${host.length > 0 ? host : '(SMTP 未填)'}${hasCred ? ' · 凭据 ****' : ''}`
    }
    case 'webhook': {
      const tg = c.telegramToken !== undefined ? ` · bot ${maskSecretTail(c.telegramToken)}` : ''
      return `webhook ${host.length > 0 ? host : '(URL 未填)'}${tg}`
    }
    default:
      return c.type
  }
}
