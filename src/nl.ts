/**
 * 自然语言 → 意图映射(0.4.6 任务 B1)。
 *
 * 引擎:宿主 ctx.llm.stream(服务名 'llm',dsh-base 必载;面板会话同源)。系统提示要求模型
 * 把用户的话映射成 ctl 同款**闭集意图 JSON**;模型输出必须过 parseIntent(与收件箱同一道门)——
 * 不合法即失败,**绝不猜测补全**(黑箱执行是红线)。
 *
 * 映射质量三件套:①意图 schema+few-shot 写进 system;②上下文(热门站点命令/现有任务/通知通道)
 * 动态注入,让"掘金""B站"能落到真实命令;③temperature 0 + 只认第一个 JSON 对象。
 * @module dsh-opencli/nl
 */

import { parseIntent, type Intent } from './inbox.ts'

/** nl-intent 的上下文输入(插件侧组装,面板/ctl 复用)。 */
export interface NlContext {
  /** 热门站点命令提示(如 ['site juejin hot','site zhihu hot'],≤30 条) */
  commands: string[]
  /** 现有任务(id+site,≤20 条) */
  schedules: Array<{ id: string; site: string }>
  /** 已配通知通道类型(webhook/email/dsh) */
  channels: string[]
}

/** llm 适配 seam:注入宿主 stream 调用(单测桩掉,真机由 index.ts 桥接 ctx.llm)。 */
export type LlmCaller = (system: string, user: string) => Promise<string>

const INTENT_SCHEMA = `可用意图(闭集,JSON 对象,不得添加任何其他字段):
{"kind":"schedule-add","site":"site <站> <命令>","cron":"分 时 日 月 周","watch":"关键词,逗号分隔(可选)","notify":true,"retry":3}
{"kind":"schedule-remove","id":"任务id"}
{"kind":"schedule-run","id":"任务id"}
{"kind":"schedule-list"}
{"kind":"notify-set","channels":[{"type":"webhook|email|dsh","url":"...","to":"...","enabled":true}]}
{"kind":"notify-test"}
{"kind":"report-build","id":"任务id"}
{"kind":"status"}`

const FEW_SHOT = `例1 "每天早9点把掘金热榜发我飞书"(已配 webhook 通道)→ {"kind":"schedule-add","site":"site juejin hot","cron":"0 9 * * *"}
例2 "看看知乎热榜" → {"kind":"status"} 之外,即时查询不是定时意图:若用户要立即执行,返回 {"kind":"schedule-add","site":"site zhihu hot","cron":"* * * * *","notify":false} 并在 explanation 注明"立即查询建议直接用命令:site zhihu hot"
例3 "盯住B站热榜,出现'官宣'就叫我" → {"kind":"schedule-add","site":"site bilibili hot","cron":"0 * * * *","watch":"官宣"}
例4 "把任务 123 的报告给我" → {"kind":"report-build","id":"123"}
例5 "删掉掘金那个任务"(现有任务列表里有 id) → {"kind":"schedule-remove","id":"<从现有任务里选>"}`

/** 组装 system 提示(纯函数,测试锚点)。 */
export function buildNlSystem(ctx: NlContext): string {
  const lines = [
    '你是 dsh-opencli 插件的自然语言意图映射器。把用户的话映射成恰好一个意图 JSON 对象。',
    INTENT_SCHEMA,
    FEW_SHOTS_NOTE(),
    `当前上下文:`,
    `- 热门站点命令(优先从这里选 site 字段):${ctx.commands.slice(0, 30).join(' ; ') || '(无)'}`,
    `- 现有定时任务:${ctx.schedules.slice(0, 20).map((s) => `${s.site}(id=${s.id})`).join(' ; ') || '(无)'}`,
    `- 已配通知通道:${ctx.channels.join(',') || '(无——用户要推送时先提醒配通道,给出 notify set 指引)'}`,
    'cron 说明:五段"分 时 日 月 周";"每天早9点"=0 9 * * *;"每小时"=0 * * * *;"工作日9点"=0 9 * * 1-5。',
    '输出格式:第一行给一句话说明(给用户看的 explanation),第二行起给 ```json 代码块,内含恰好一个意图 JSON。',
    '硬规则:字段只用 schema 里的;site 必须是"site <站> <命令>"形态且优先来自热门命令;不确定就选最接近的并在说明里讲清假设。',
  ]
  return lines.join('\n')
}
const FEW_SHOTS_NOTE = (): string => FEW_SHOT

/** 从模型输出解析(explanation + 意图);解析纪律:第一个 fenced JSON 对象,过闭集校验。 */
export function parseNlOutput(raw: string): { explanation: string; intent: Intent } | null {
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(raw)
  const jsonText = fence !== null ? fence[1] : raw
  // 逐对象试探:找第一个能通过闭集校验的 JSON 对象(模型偶尔前后带话)
  for (const m of jsonText.matchAll(/\{[\s\S]*?\}/g)) {
    try {
      const intent = parseIntent(JSON.parse(m[0]))
      if (intent !== null) {
        const explanation = (fence !== null ? raw.slice(0, fence.index ?? 0) : raw.slice(0, m.index ?? 0)).trim().split('\n')[0] ?? ''
        return { explanation: explanation.slice(0, 200), intent }
      }
    } catch { /* 试下一个对象 */ }
  }
  return null
}

/** 完整映射:NL 文本 → {explanation, intent};llm 失败/输出不合法 → null(调用方给回退指引)。 */
export async function nlToIntent(call: LlmCaller, text: string, ctx: NlContext): Promise<{ explanation: string; intent: Intent } | null> {
  if (text.trim().length === 0) return null
  let raw: string
  try { raw = await call(buildNlSystem(ctx), text) } catch { return null }
  return parseNlOutput(raw)
}
