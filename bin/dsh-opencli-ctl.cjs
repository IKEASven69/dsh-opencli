#!/usr/bin/env node
/**
 * dsh-opencli-ctl:本插件的本机命令面。
 *
 * 面向谁:任何 dsh 会话里的 agent(面板聊天也有 shell)与人——写意图 JSON 到
 * ~/.dsh/opencli-inbox/,插件侧消费者执行并回写 <stem>.result.json;默认 --wait 同步等结果,
 * agent 拿到 JSON 直接回话。这就是「在 dsh 会话输入自然语言 → agent 用本命令面完成事」的落点。
 *
 * 用法示例:
 *   dsh-opencli-ctl schedule add --site "site juejin hot" --cron "0 9 * * *" --watch "AI,大模型"
 *   dsh-opencli-ctl schedule list
 *   dsh-opencli-ctl schedule run --id 1793330000000
 *   dsh-opencli-ctl schedule remove --id 1793330000000
 *   dsh-opencli-ctl notify set --feishu https://open.feishu.cn/open-apis/bot/v2/hook/xxx
 *   dsh-opencli-ctl notify set --webhook http://127.0.0.1:19999/hook
 *   dsh-opencli-ctl notify set --bark https://api.day.app/<device_key>   # 或 --bark-key 单独给
 *   dsh-opencli-ctl notify set --ntfy https://ntfy.sh/<topic> --ntfy-token tk_xxx
 *   dsh-opencli-ctl notify set --pushover-token <appToken> --pushover-user <userKey>
 *   dsh-opencli-ctl notify test
  dsh-opencli-ctl report build --id <scheduleId>
  dsh-opencli-ctl report export --id <scheduleId>   # 快照→CSV(结构化)或原文分节
  dsh-opencli-ctl schedule add --source chat --notify-level quiet …  # 来源标记/只推变化
 *   dsh-opencli-ctl status
 * 选项:--no-wait(只投递不等结果)/ --timeout <秒>(默认 45)
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const INBOX = process.env.DSH_OPENCLI_INBOX_DIR ?? path.join(os.homedir(), '.dsh', 'opencli-inbox')
const args = process.argv.slice(2)

const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const has = (name) => args.includes(name)
const need = (name) => {
  const v = flag(name)
  if (v === undefined || v.startsWith('--')) { console.error(`缺少参数 ${name} <值>(--help 看用法)`); process.exit(2) }
  return v
}

function usage() {
  console.log(`dsh-opencli-ctl — dsh-opencli 插件的本机命令面(写意图到 ${INBOX},插件执行并回写结果)

用法:
  dsh-opencli-ctl schedule add --site "site juejin hot" --cron "0 9 * * *" [--watch "AI,大模型"] [--notify true] [--retry 3] [--notify-level quiet] [--quiet-hours 23:00-07:00] [--preflight] [--keep 50] [--backoff-ms 15000] [--profile <别名|contextId>]
  dsh-opencli-ctl schedule list
  dsh-opencli-ctl schedule run --id <id>
  dsh-opencli-ctl schedule remove --id <id>
  dsh-opencli-ctl schedule read [--id <id>] [--at <iso>]   # 标已读:单条(成对)/任务全部/全部
  dsh-opencli-ctl schedule archive [--id <id>] [--at <iso>] # 归档:单条(成对)/一键归档全部已读
  dsh-opencli-ctl notify set --feishu <url> | --dingtalk <url> | --wecom <url> | --telegram <url> [--parse-mode MarkdownV2|HTML|Markdown] | --webhook <url> [--template '<json>'] | --bark <url> [--bark-key <key>] | --ntfy <url> [--ntfy-topic <topic>] [--ntfy-token <tk_…>] | --pushover-token <token> --pushover-user <user> [--pushover-device <dev>] | --dsh | --email-smtp <url> --email-to <addr>
  dsh-opencli-ctl notify test
  dsh-opencli-ctl status
  dsh-opencli-ctl version

选项: --no-wait 只投递不等结果; --timeout <秒> 等待上限(默认 45); --help 本帮助`)
  process.exit(has('--help') ? 0 : 2)
}

// ── 意图组装(与 src/inbox.ts 的 Intent 闭集一一对应;多余的想都别想) ──
// 注意:位置参数只认前两个(group/sub),其余都是 --flag 形态,不参与长度判定
function buildIntent() {
  const [group, sub] = [args[0], args[1]?.startsWith('--') ? undefined : args[1]]
  if (group === 'schedule') {
    if (sub === 'add') {
      const intent = { kind: 'schedule-add', site: need('--site'), cron: need('--cron') }
      const w = flag('--watch'); if (w !== undefined) intent.watch = w
      const nf = flag('--notify'); if (nf !== undefined) intent.notify = nf === 'true'
      const r = flag('--retry'); if (r !== undefined) intent.retry = Number(r)
      const src = flag('--source'); if (src !== undefined) intent.source = src
      const lvl = flag('--notify-level'); if (lvl !== undefined) intent.notifyLevel = lvl
      const qh = flag('--quiet-hours'); if (qh !== undefined) intent.quietHours = qh
      if (has('--no-jitter')) intent.jitter = false // has():布尔旗标无参数值,flag() 取下一 token 在末位时失效
      if (has('--preflight')) intent.preflight = true // 登录态预检:每 tick 采集前 whoami 快检,未登录跳过本 tick
      const kp = flag('--keep'); if (kp !== undefined) intent.keep = Number(kp) // 快照留存份数(5-500)
      const bo = flag('--backoff-ms'); if (bo !== undefined) intent.backoffMs = Number(bo) // 重试退避毫秒(0-600000)
      const pf = flag('--profile'); if (pf !== undefined) intent.profile = pf // 浏览器 profile/多账号隔离
      return intent
    }
    if (sub === 'list') return { kind: 'schedule-list' }
    if (sub === 'run') return { kind: 'schedule-run', id: need('--id') }
    if (sub === 'remove') return { kind: 'schedule-remove', id: need('--id') }
    // 运行级收件箱轻量意图(0.1.4 候选 5 ④):--id=任务,--at=单条 run(须与 --id 成对);
    // read 省略 --at=全部标已读,archive 省略 --at=一键归档全部已读
    if (sub === 'read' || sub === 'archive') {
      const intent = { kind: `schedule-${sub}` }
      const id = flag('--id'); if (id !== undefined) intent.task = id
      const at = flag('--at'); if (at !== undefined) {
        if (id === undefined) { console.error('--at 需与 --id 成对给出(单条定位=任务+时间)'); process.exit(2) }
        intent.at = at
      }
      return intent
    }
  }
  if (group === 'notify') {
    if (sub === 'test') return { kind: 'notify-test' }
    if (sub === 'set') {
      const channels = []
      const feishu = flag('--feishu'); if (feishu !== undefined) channels.push({ type: 'webhook', url: feishu, enabled: true })
      const ding = flag('--dingtalk'); if (ding !== undefined) channels.push({ type: 'webhook', url: ding, enabled: true })
      const wecom = flag('--wecom'); if (wecom !== undefined) channels.push({ type: 'webhook', url: wecom, enabled: true })
      // telegram:bot token 已在官方 URL path(存储面由插件归一层拆独立字段);--parse-mode 可选
      const tg = flag('--telegram')
      if (tg !== undefined) {
        const ch = { type: 'webhook', url: tg, enabled: true }
        const pm = flag('--parse-mode'); if (pm !== undefined) ch.parseMode = pm
        channels.push(ch)
      }
      // --template 仅对 --webhook(generic)生效:平台预设请求形状固定,模板会被忽略
      const wh = flag('--webhook')
      if (wh !== undefined) {
        const ch = { type: 'webhook', url: wh, enabled: true }
        const tpl = flag('--template'); if (tpl !== undefined) ch.template = tpl
        channels.push(ch)
      }
      // bark:device_key 可写在 URL path(https://api.day.app/<key>,插件侧拆出)或 --bark-key 单独给
      const bark = flag('--bark')
      if (bark !== undefined) {
        const ch = { type: 'bark', url: bark, enabled: true }
        const bk = flag('--bark-key'); if (bk !== undefined) ch.deviceKey = bk
        channels.push(ch)
      }
      // ntfy:topic 可写在 URL path(https://ntfy.sh/<topic>)或 --ntfy-topic;access token --ntfy-token
      const ntfy = flag('--ntfy')
      if (ntfy !== undefined) {
        const ch = { type: 'ntfy', url: ntfy, enabled: true }
        const nt = flag('--ntfy-topic'); if (nt !== undefined) ch.topic = nt
        const ntok = flag('--ntfy-token'); if (ntok !== undefined) ch.token = ntok
        channels.push(ch)
      }
      // pushover:凭据走 POST body(官方纪律「never as URL query parameters」),token/user 必须成对
      const poTok = flag('--pushover-token'); const poUser = flag('--pushover-user')
      if (poTok !== undefined || poUser !== undefined) {
        if (poTok === undefined || poUser === undefined) { console.error('pushover 需要 --pushover-token 与 --pushover-user 成对给出'); process.exit(2) }
        const ch = { type: 'pushover', token: poTok, user: poUser, enabled: true }
        const pd = flag('--pushover-device'); if (pd !== undefined) ch.device = pd
        channels.push(ch)
      }
      const dsh = has('--dsh'); if (dsh) channels.push({ type: 'dsh', enabled: true })
      const mailUrl = flag('--email-smtp'); const mailTo = flag('--email-to')
      if (mailUrl !== undefined && mailTo !== undefined) channels.push({ type: 'email', url: mailUrl, to: mailTo, enabled: true })
      if (channels.length === 0) { console.error('notify set 至少要一个通道:--feishu/--dingtalk/--wecom/--telegram/--webhook <url> 或 --bark <url> 或 --ntfy <url> 或 --pushover-token <t> --pushover-user <u> 或 --dsh 或 --email-smtp <smtp> --email-to <收件人>'); process.exit(2) }
      return { kind: 'notify-set', channels }
    }
  }
  if (group === 'undo') {
    if (sub === 'run') return { kind: 'undo', stem: need('--stem') }
  }
  if (group === 'report') {
    if (sub === 'build') return { kind: 'report-build', id: need('--id') }
    if (sub === 'export') return { kind: 'report-export', id: need('--id') }
  }
  if (group === 'status') return { kind: 'status' }
  if (group === 'version') {
    try { console.log(require(path.join(__dirname, '..', 'package.json')).version); process.exit(0) } catch { console.log('unknown'); process.exit(0) }
  }
  usage()
}

// ── 投递 + 等待 ──
;(async () => {
  if (args.length === 0 || has('--help')) usage()
  const intent = buildIntent()
  fs.mkdirSync(INBOX, { recursive: true })
  const stem = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const intentFile = path.join(INBOX, `${stem}.json`)
  fs.writeFileSync(intentFile, JSON.stringify(intent), 'utf8')

  if (has('--no-wait')) {
    console.log(JSON.stringify({ ok: true, delivered: true, stem }))
    process.exit(0)
  }
  const timeoutMs = (Number(flag('--timeout')) || 45) * 1000
  const resultFile = path.join(INBOX, `${stem}.result.json`)
  const t0 = Date.now()
  for (;;) {
    await new Promise((r) => setTimeout(r, 500))
    try {
      const r = JSON.parse(fs.readFileSync(resultFile, 'utf8'))
      console.log(JSON.stringify(r))
      process.exit(r.ok === true ? 0 : 1)
    } catch { /* 结果未到 */ }
    if (Date.now() - t0 > timeoutMs) {
      console.error(JSON.stringify({ ok: false, error: `等待结果超时(${timeoutMs / 1000}s):插件消费者未运行?面板需处于已启动状态;意图已投递 ${intentFile}(stem ${stem},稍后可用同名 .result.json 取回)` }))
      process.exit(3)
    }
  }
})()
