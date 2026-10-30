#!/usr/bin/env node
/**
 * dsh-opencli-ctl(0.4.6 任务 F1):本插件的本机命令面。
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
 *   dsh-opencli-ctl notify test
  dsh-opencli-ctl report build --id <scheduleId>
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
  dsh-opencli-ctl schedule add --site "site juejin hot" --cron "0 9 * * *" [--watch "AI,大模型"] [--notify true] [--retry 3]
  dsh-opencli-ctl schedule list
  dsh-opencli-ctl schedule run --id <id>
  dsh-opencli-ctl schedule remove --id <id>
  dsh-opencli-ctl notify set --feishu <url> | --dingtalk <url> | --wecom <url> | --telegram <url> | --webhook <url> | --dsh | --email-smtp <url> --email-to <addr>
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
      return intent
    }
    if (sub === 'list') return { kind: 'schedule-list' }
    if (sub === 'run') return { kind: 'schedule-run', id: need('--id') }
    if (sub === 'remove') return { kind: 'schedule-remove', id: need('--id') }
  }
  if (group === 'notify') {
    if (sub === 'test') return { kind: 'notify-test' }
    if (sub === 'set') {
      const channels = []
      const feishu = flag('--feishu'); if (feishu !== undefined) channels.push({ type: 'webhook', url: feishu, enabled: true })
      const ding = flag('--dingtalk'); if (ding !== undefined) channels.push({ type: 'webhook', url: ding, enabled: true })
      const wecom = flag('--wecom'); if (wecom !== undefined) channels.push({ type: 'webhook', url: wecom, enabled: true })
      const tg = flag('--telegram'); if (tg !== undefined) channels.push({ type: 'webhook', url: tg, enabled: true })
      const wh = flag('--webhook'); if (wh !== undefined) channels.push({ type: 'webhook', url: wh, enabled: true })
      const dsh = has('--dsh'); if (dsh) channels.push({ type: 'dsh', enabled: true })
      const mailUrl = flag('--email-smtp'); const mailTo = flag('--email-to')
      if (mailUrl !== undefined && mailTo !== undefined) channels.push({ type: 'email', url: mailUrl, to: mailTo, enabled: true })
      if (channels.length === 0) { console.error('notify set 至少要一个通道:--feishu/--dingtalk/--wecom/--telegram/--webhook <url> 或 --dsh 或 --email-smtp <smtp> --email-to <收件人>'); process.exit(2) }
      return { kind: 'notify-set', channels }
    }
  }
  if (group === 'report') {
    if (sub === 'build') return { kind: 'report-build', id: need('--id') }
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
