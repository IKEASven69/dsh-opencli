/**
 * 对话内任务预览卡(site / site_batch / browser_do 三工具的 output.render)。
 *
 * 能力边界(实测 @deepseek-ai/dsh-tools 0.2.0-rc.2 的 ToolOutputDefinition):
 * render 是 "validated value → Native/模型内容" 的纯投影,产物 ContentBlock[] 里
 * text 是唯一可由插件构造的块——image/file 块的 ImageAttachmentRef/FileAttachmentRef
 * 由 attachment 服务拥有(dsh-llm 类型注释:current production adapters declare
 * text-only output),纯函数拿不到引用。因此三张卡统一为"带样式的 markdown 文本卡",
 * 对齐 0.2 视觉语言与面板 o4-* 体系:
 * - 徽章头:▣ 工具 · 主体 — 状态字形。状态三色系统与面板 o4-dot 同源
 *   (✓=绿 #34C759 / ✗=红 #FF453A / ⚠=琥珀 #FF9F0A);文本块无 CSS,
 *   以字形+语义词承载状态色;品牌蓝 #4D6BFE 是面板侧色彩,不塞进模型内容。
 * - 等宽命令块:$ 命令行进 ```console 围栏(与 0.2 TerminalResultView 的
 *   "无能力 UI 退化为围栏命令输出"约定同款)。
 * - 折叠原文:宿主 MarkdownText 禁 raw HTML(GFM 无原生折叠语法),降级为
 *   "摘要在上、原文围栏在下"的分区形态,原文逐字保留、信息不丢。
 * 全部纯函数:text 进 → 块数组出,tests/cards.test.ts 直接断言形状。
 * @module dsh-opencli/cards
 */

/** render 可构造的唯一块形状(dsh-llm TextBlock 的结构等价物,免依赖导入)。 */
export interface TextCardBlock { type: 'text'; text: string }

/** 卡片状态三色系统:✓ 绿 / ✗ 红 / ⚠ 琥珀(与面板 o4-dot.g/.r/.y 同源)。 */
export type CardStatus = 'ok' | 'fail' | 'warn'

const GLYPH: Record<CardStatus, string> = { ok: '✓', fail: '✗', warn: '⚠' }

/** renderOut 的失败前缀(半角括号,见 src/index.ts renderOut)。 */
const EXIT_FAIL = /^命令失败\(退出码 (-?\d+)\):\n?/

/** SystemOne 判定标注(verifyBadge 三形态),如 "(实测有效 P=0.93)"。 */
const VERIFY_NOTE = /\((⚠ 疑似静默失败:[^)]*|⚠ 内容可疑:[^)]*|实测有效 P=[\d.]+)\)/

/** 失败卡末尾的人工接管提示:✗ 时追加,引导模型别在坏状态上盲目重试。 */
const TAKEOVER_HINT = '👉 状态异常:建议人工接管或改用 browser_* 原语'

/** 原文已自带登录指引(site 的返回空/导航被拒文案):再附接管提示即重复,不加。 */
const HAS_LOGIN_HINT = /登录|login/i

// ── 基础件(全防御:render 是管线回调,任何输入都不允许抛) ──

function asRecord(x: unknown): Record<string, unknown> | null {
  return typeof x === 'object' && x !== null && !Array.isArray(x) ? x as Record<string, unknown> : null
}

/** execute 结果取 {text};形状不对返回 null(调用方走兜底空卡)。 */
function textOf(value: unknown): string | null {
  const v = asRecord(value)
  return v !== null && typeof v.text === 'string' ? v.text : null
}

/** 命令行拼接:含空白/引号的参数加双引号(shell 展示习惯)。 */
function shellJoin(tokens: string[]): string {
  return tokens.map((t) => (/"|\s/.test(t) ? `"${t.replace(/"/g, '\\"')}"` : t)).join(' ')
}

/** 围栏:原文含反引号串时自动加长一级(GFM 关闭围栏不得短于开启围栏)。 */
function fence(body: string, lang = ''): string {
  const runs = body.match(/`{3,}/g)
  const n = runs === null ? 3 : Math.max(3, ...runs.map((r) => r.length)) + 1
  const f = '`'.repeat(n)
  return `${f}${lang}\n${body}\n${f}`
}

/** 卡片组装:非空段以空行分隔。 */
function card(...parts: string[]): TextCardBlock[] {
  return [{ type: 'text', text: parts.filter((p) => p.length > 0).join('\n\n') }]
}

// ── site:命令行样式(站点徽章 + 命令 + exit 状态色) ──

export interface SiteCardStatus { status: CardStatus; label: string }

/**
 * site execute 文本契约分类(优先级从上到下):
 * 失败前缀(✗)→ 判定标注 ⚠(疑似静默失败/内容可疑,琥珀)→ 已知拦截/静默形态 → 默认 ✓。
 */
export function siteStatusOf(text: string): SiteCardStatus {
  const ex = EXIT_FAIL.exec(text)
  if (ex !== null) return { status: 'fail', label: `exit ${ex[1]}` }
  const note = VERIFY_NOTE.exec(text)
  if (note !== null && note[1].startsWith('⚠')) return { status: 'warn', label: note[1].replace(/^⚠ /, '') }
  if (/疑似静默失败/.test(text)) return { status: 'warn', label: '疑似静默失败' }
  if (/^适配器 \S+ 返回空/.test(text)) return { status: 'warn', label: '空结果(疑似未登录)' }
  if (/导航被拒/.test(text)) return { status: 'fail', label: '导航被拒' }
  // 校验拒绝家族(执行前拦截):非法 adapter/已禁用/authProfile 限域(checkAuthProfile 两文案)同归 ✗
  if (/已被禁用|^非法 adapter|^未知 authProfile:|^authProfile \S+ 不允许访问域/.test(text)) return { status: 'fail', label: '被拦截' }
  if (note !== null) return { status: 'ok', label: `exit 0 · ${note[1]}` }
  return { status: 'ok', label: 'exit 0' }
}

/**
 * site 预览卡:徽章头(站点·命令+状态色)→ 等宽命令块 → 原文围栏。
 * 判定标注从 execute 文本解析:⚠ 疑似静默失败/内容可疑;✓ 时 P 值入标签。
 * 失败前缀行(命令失败(退出码 N):)信息已入徽章头,原文去重保留其余部分。
 * ✗(exit N/被拦截/导航被拒等)且原文无登录指引时,末尾附人工接管提示——
 * 空结果/导航被拒文案自带"登录"指引,不重复加。
 */
export function siteCardRender(args: unknown, value: unknown): TextCardBlock[] {
  const text = textOf(value)
  if (text === null) return [{ type: 'text', text: '' }]
  const a = asRecord(args)
  const adapter = a !== null && typeof a.adapter === 'string' ? a.adapter : '?'
  const command = a !== null && typeof a.command === 'string' ? a.command : '?'
  const rest = a !== null && Array.isArray(a.args) ? a.args.map(String) : []
  const st = siteStatusOf(text)
  const head = `▣ site · ${adapter} · ${command} — ${GLYPH[st.status]} ${st.label}`
  const cmd = fence(`$ ${shellJoin(['site', adapter, command, ...rest])}`, 'console')
  const ex = EXIT_FAIL.exec(text)
  const payload = ex !== null ? text.slice(ex[0].length) : text
  const hint = st.status === 'fail' && !HAS_LOGIN_HINT.test(payload) ? [TAKEOVER_HINT] : []
  if (payload.trim().length === 0) return card(head, cmd, ...hint)
  return card(head, cmd, fence(payload), ...hint)
}

// ── site_batch:汇总头 + 每站一行(站名+状态+P 值) ──

export interface BatchSection { site: string; ok: boolean; badge: string; body: string }
export interface BatchParse { notes: string[]; sections: BatchSection[] }

/**
 * 解析 site_batch execute 文本契约:前置注记行(目录预检/preflight)+
 * `== 站 ✓(标注) ==` 分节。分节体可含空行,故按行扫描而非按空行切分。
 * knownSites(请求站点集,来自 render 的 args.sites)给出时,按"每请求站点至多一分节"
 * (execute 契约:一站一节、按请求序回填)鉴别真分节头:站点既要在集内、又未见过——
 * 适配器输出里的 lookalike(无论点名集外站名还是重复点名集内站名)一律视为正文,
 * 不产生幻影/重复汇总行(卡头成功数与 execute 汇总头一致);缺省时不过滤(拒绝文案
 * 等无 sites 场景,本来也无分节)。
 */
export function parseBatchText(text: string, knownSites?: ReadonlySet<string>): BatchParse {
  const notes: string[] = []
  const sections: BatchSection[] = []
  const seen = new Set<string>()
  let cur: BatchSection | null = null
  for (const line of text.split('\n')) {
    const h = /^== (\S+) (✓|✗)(.*?) ==$/.exec(line)
    if (h !== null && (knownSites === undefined || (knownSites.has(h[1]) && !seen.has(h[1])))) {
      seen.add(h[1])
      if (cur !== null) sections.push(cur)
      cur = { site: h[1], ok: h[2] === '✓', badge: h[3], body: '' }
      continue
    }
    if (cur === null) {
      if (line.trim().length > 0 && !/^批量采集 /.test(line)) notes.push(line)
      continue
    }
    cur.body += cur.body.length === 0 ? line : `\n${line}`
  }
  if (cur !== null) sections.push(cur)
  for (const s of sections) {
    s.badge = s.badge.trim()
    s.body = s.body.replace(/^\n+/, '').replace(/\n+$/, '')
  }
  return { notes, sections }
}

function batchRow(s: BatchSection): { glyph: string; status: CardStatus; label: string; p: string } {
  const p = /P=([\d.]+)/.exec(s.badge)?.[1] ?? '—'
  if (!s.ok) return { glyph: GLYPH.fail, status: 'fail', label: '失败', p }
  if (s.badge.includes('疑似静默失败')) return { glyph: GLYPH.warn, status: 'warn', label: '疑似静默失败', p }
  if (s.badge.includes('内容可疑')) return { glyph: GLYPH.warn, status: 'warn', label: '内容可疑', p }
  if (s.badge.includes('实测有效')) return { glyph: GLYPH.ok, status: 'ok', label: '有效', p }
  return { glyph: GLYPH.ok, status: 'ok', label: '成功', p }
}

/**
 * site_batch 预览卡:汇总头(成功数/总数+疑似静默失败计数)→ 前置注记 →
 * 每站一行表(站名+状态+P 值)→ 原文分节围栏(逐字保留)。
 * 无分节(参数校验拒绝等)退化为"✗ 被拒绝 + 原因原文"卡。
 * 失败兜底与 site/browser_do 同族:整卡被拒,或存在 ✗ 失败站(⚠ 疑似静默失败不算)时,
 * 卡末尾附人工接管提示——多站批量失败恰是盲目重试高发场景;互斥按站判定:仅当全部
 * 失败站原文都已自带登录指引(如"请先登录")才省略,任一站无指引(如纯超时)即附一次。
 */
export function siteBatchCardRender(args: unknown, value: unknown): TextCardBlock[] {
  const text = textOf(value)
  if (text === null) return [{ type: 'text', text: '' }]
  const a = asRecord(args)
  const command = a !== null && typeof a.command === 'string' && a.command.length > 0 ? a.command : '?'
  const sitesArg = a !== null && Array.isArray(a.sites) ? a.sites.map(String) : []
  const { notes, sections } = parseBatchText(text, sitesArg.length > 0 ? new Set(sitesArg) : undefined)
  if (sections.length === 0) {
    return card(`▣ site_batch · ${command} — ${GLYPH.fail} 被拒绝`, text, ...(HAS_LOGIN_HINT.test(text) ? [] : [TAKEOVER_HINT]))
  }
  const rows = sections.map((s) => ({ s, r: batchRow(s) }))
  const n = rows.length
  // 成功数按 exit-0 口径(sections 的 ok 标记,含"疑似静默失败"站),与 execute 汇总头一致;
  // 但状态符号升格:存在疑似静默失败时整批标 ⚠(数据可信度问题优先于 exit 口径,与测试契约一致)
  const okN = rows.filter((x) => x.s.ok).length
  const silentN = rows.filter((x) => x.r.label === '疑似静默失败').length
  const status: CardStatus = silentN > 0 ? 'warn' : okN === n ? 'ok' : okN === 0 ? 'fail' : 'warn'
  const head = `▣ site_batch · ${command} × ${n} 站 — ${GLYPH[status]} ${okN}/${n} 站成功${silentN > 0 ? ` · ${silentN} 疑似静默失败` : ''}`
  const table = [
    '| 站点 | 状态 | P |',
    '| --- | --- | --- |',
    ...rows.map((x) => `| ${x.s.site} | ${x.r.glyph} ${x.r.label} | ${x.r.p} |`),
  ].join('\n')
  const raw = sections.map((s) => `== ${s.site} ${s.ok ? '✓' : '✗'}${s.badge} ==\n${s.body}`).join('\n\n')
  // 互斥粒度按站:任一失败站原文无登录指引(如纯超时)就需要整卡附一次提示——
  // 按"全部失败站都自带指引才省略",避免登录墙站+超时站混合时超时站得不到指引
  const failSections = sections.filter((s) => !s.ok)
  const hint = failSections.length > 0 && !failSections.every((s) => HAS_LOGIN_HINT.test(s.body)) ? [TAKEOVER_HINT] : []
  return card(head, ...(notes.length > 0 ? [notes.join('\n')] : []), table, fence(raw), ...hint)
}

// ── browser_do:步骤式(命令/结果分段) ──

/**
 * browser_do 预览卡:徽章头(子命令+状态色)→ 命令段 → 结果段,原文逐字保留。
 * 失败前缀/白名单拒绝按 site 同款规则分类;✗ 时末尾附人工接管提示(原文自带
 * 登录指引的除外,与 site 同款互斥)。
 */
export function browserDoCardRender(args: unknown, value: unknown): TextCardBlock[] {
  const text = textOf(value)
  if (text === null) return [{ type: 'text', text: '' }]
  const a = asRecord(args)
  const command = a !== null && typeof a.command === 'string' ? a.command : '?'
  const rest = a !== null && Array.isArray(a.args) ? a.args.map(String) : []
  const session = a !== null && typeof a.session === 'string' && a.session.length > 0 && a.session !== 'dsh' ? a.session : null
  const ex = EXIT_FAIL.exec(text)
  const st: SiteCardStatus = ex !== null
    ? { status: 'fail', label: `exit ${ex[1]}` }
    : /^不允许的子命令/.test(text) ? { status: 'fail', label: '子命令被拒' } : { status: 'ok', label: 'exit 0' }
  const head = `▣ browser_do · ${command}${session !== null ? ` · session ${session}` : ''} — ${GLYPH[st.status]} ${st.label}`
  const cmdSeg = `**命令**\n${fence(`$ ${shellJoin(['browser_do', command, ...rest])}`, 'console')}`
  const payload = ex !== null ? text.slice(ex[0].length) : text
  const hint = st.status === 'fail' && !HAS_LOGIN_HINT.test(payload) ? [TAKEOVER_HINT] : []
  if (payload.trim().length === 0) return card(head, cmdSeg, ...hint)
  return card(head, cmdSeg, `**结果**\n${fence(payload)}`, ...hint)
}
