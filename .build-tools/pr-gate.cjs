/**
 * 对外提交预检 CLI:node .build-tools/pr-gate.cjs <文件...> [--diff <diff文件>] [--claims <复核记录.md>]
 * 任一 FAIL → 退出码 1(禁止提交);WARN 与数字清单逐条人工裁决留痕后放行。
 * 由 #8007 事故催生;纯函数层在 src/presubmit.ts(可单测)。
 *
 * 对外声明逐条机器复核(release 打假自查,借鉴开源社区 false-advertising sweep 实践):
 * - 名词夸大扫描始终执行(如「录屏回放」→ 应为轨迹回放),命中即 FAIL;
 * - 附 --claims 时,数字声明逐条对账复核记录(markdown 表格:声明 | 复现命令 | 当场输出 | 日期):
 *   未复核 / 记录不完整 / 声明与当场输出数值不符 → FAIL;记录陈旧 → WARN。
 *   本 CLI 不执行复现命令——记录须由提交人当场跑命令产出;未附 --claims 时数字清单照旧逐条人工溯源。
 */
const { scanPrivacy, scanInternalWords, extractNumberClaims, detectDeletedFacts, verdict, parseClaimLedger, reconcileClaims, scanInflatedTerms } = require('../src/presubmit.ts')

const args = process.argv.slice(2)
/** 取出 `--flag <文件>` 形态的可选参数(从 args 中摘除);缺文件参数时报错退出。 */
const takeFileFlag = (flag) => {
  const idx = args.indexOf(flag)
  if (idx < 0) return null
  const file = args.splice(idx, 2)[1] ?? null
  if (file === null) { console.error(`${flag} 缺文件参数`); process.exit(2) }
  return file
}
const diffFile = takeFileFlag('--diff')
const claimsFile = takeFileFlag('--claims')
if (args.length === 0 && diffFile === null) {
  console.error('用法: node .build-tools/pr-gate.cjs <PR标题/正文/条目文件...> [--diff <diff文件>] [--claims <复核记录.md>]')
  process.exit(2)
}
const fs = require('fs')
// 只扫内容不加文件名头:文件路径里的本机用户名会被机检器自己引入成假阳性(实测自证)
const text = args.map((f) => fs.readFileSync(f, 'utf8')).join('\n')

const privacy = scanPrivacy(text)
const words = scanInternalWords(text)
const numbers = extractNumberClaims(text)
const facts = diffFile !== null ? detectDeletedFacts(fs.readFileSync(diffFile, 'utf8')) : []
// 对外声明逐条机器复核:名词夸大始终扫;数字声明对账只在附了复核记录时做
const inflated = scanInflatedTerms(text)
const claims = claimsFile !== null ? reconcileClaims(numbers, parseClaimLedger(fs.readFileSync(claimsFile, 'utf8'))) : []

const show = (title, list) => {
  if (list.length === 0) return
  console.log(`\n[${title}] ${list.length} 条`)
  for (const f of list) console.log(`  ${f.level} | ${f.rule} | ${f.hit}${f.context ? ' | …' + f.context + '…' : ''}`)
}
show('隐私/内部扫描', [...privacy, ...words, ...facts])
show('对外声明逐条机器复核', [...inflated, ...claims])
if (numbers.length > 0) {
  console.log(`\n[数字声明清单] ${numbers.length} 条——每条必须附"当场复现命令"并经用户看过才能放行:`)
  for (const n of numbers) console.log(`  NEEDS-SOURCE | "${n.claim}" | …${n.context}…`)
  if (claimsFile === null) console.log('  提示:附 --claims <复核记录.md>(表格列:声明 | 复现命令 | 当场输出 | 日期)可让上列声明逐条机器对账')
}
const v = verdict([...privacy, ...words, ...facts, ...inflated, ...claims], numbers)
console.log(`\n结论:${v.pass ? '无 FAIL' : `FAIL ${v.failN} 条——禁止提交`} | WARN ${v.warnN} | 数字待溯源 ${v.numberN}${claimsFile !== null ? '(已逐条对账复核记录)' : ''}`)
process.exit(v.pass ? 0 : 1)
