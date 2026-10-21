/**
 * 对外提交预检 CLI:node .build-tools/pr-gate.cjs <文件...> [--diff <diff文件>]
 * 任一 FAIL → 退出码 1(禁止提交);WARN 与数字清单逐条人工裁决留痕后放行。
 * 由 #8007 事故催生;纯函数层在 src/presubmit.ts(可单测)。
 */
const { scanPrivacy, scanInternalWords, extractNumberClaims, detectDeletedFacts, verdict } = require('../src/presubmit.ts')

const args = process.argv.slice(2)
const diffIdx = args.indexOf('--diff')
const diffFile = diffIdx >= 0 ? args.splice(diffIdx, 2)[1] : null
if (args.length === 0 && diffFile === null) {
  console.error('用法: node .build-tools/pr-gate.cjs <PR标题/正文/条目文件...> [--diff <diff文件>]')
  process.exit(2)
}
const fs = require('fs')
// 只扫内容不加文件名头:文件路径里的本机用户名会被机检器自己引入成假阳性(实测自证)
const text = args.map((f) => fs.readFileSync(f, 'utf8')).join('\n')

const privacy = scanPrivacy(text)
const words = scanInternalWords(text)
const numbers = extractNumberClaims(text)
const facts = diffFile !== null ? detectDeletedFacts(fs.readFileSync(diffFile, 'utf8')) : []

const show = (title, list) => {
  if (list.length === 0) return
  console.log(`\n[${title}] ${list.length} 条`)
  for (const f of list) console.log(`  ${f.level} | ${f.rule} | ${f.hit}${f.context ? ' | …' + f.context + '…' : ''}`)
}
show('隐私/内部扫描', [...privacy, ...words, ...facts])
if (numbers.length > 0) {
  console.log(`\n[数字声明清单] ${numbers.length} 条——每条必须附"当场复现命令"并经用户看过才能放行:`)
  for (const n of numbers) console.log(`  NEEDS-SOURCE | "${n.claim}" | …${n.context}…`)
}
const v = verdict([...privacy, ...words, ...facts], numbers)
console.log(`\n结论:${v.pass ? '无 FAIL' : `FAIL ${v.failN} 条——禁止提交`} | WARN ${v.warnN} | 数字待溯源 ${v.numberN}`)
process.exit(v.pass ? 0 : 1)
