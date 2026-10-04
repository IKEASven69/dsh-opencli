// 竞品周报:按 docs/PM-RESEARCH-20261003.md §6.2 名单拉取各家状态,输出 markdown 表。
// 用法:node .build-tools/competitor-watch.cjs  (只读 gh api,零提交)
// 节假日后/每周一跑一次,人工对比上周数字写进 PM-RESEARCH。
const { execSync } = require('node:child_process')

const TARGETS = [
  { repo: 'Tencent/BrowserSkill', note: '盯:release/新 issue 是否接结构化命令·站点知识·动作证据' },
  { repo: 'platonai/browser4', note: '盯:★增速·是否出 dsh 插件/登录态(最高优先新变量)' },
  { repo: 'omdsh-dev/dsh-browser', note: '盯:市场排序变化' },
  { repo: 'wqty123/dsh-browser', note: '盯:发版节奏参照' },
  { repo: 'jackwener/opencli', note: '盯:复工 release(站点修复量=健康度数据源)' },
  { repo: 'dsh-market/dsh-market', note: '盯:更新器可靠性修复(#784/#720)' },
]

const gh = (q) => {
  try { return JSON.parse(execSync(`gh api ${q} --jq "${'{s: .stargazers_count, p: .pushed_at[0:10]}'}"`, { encoding: 'utf8' })) } catch { return null }
}
const rel = (repo) => {
  try { return execSync(`gh api "repos/${repo}/releases?per_page=1" --jq ".[0].tag_name + \\" \\" + (.[0].published_at[0:10] // \\"无\\")"`, { encoding: 'utf8' }).trim() } catch { return '—' }
}
const issues = (repo) => {
  try { return execSync(`gh api "repos/${repo}/issues?state=open&per_page=1" --jq ".length == 0 ? \\"0\\" : (.[0].number|tostring)" `, { encoding: 'utf8' }).trim() } catch { return '?' }
}

console.log(`# 竞品周报 ${new Date().toISOString().slice(0, 10)}\n`)
console.log('| 竞品 | ★ | 最近push | 最新release | 盯什么 |')
console.log('|---|---|---|---|---|')
for (const t of TARGETS) {
  const j = gh(`repos/${t.repo}`) ?? { s: '?', p: '?' }
  console.log(`| ${t.repo} | ${j.s} | ${j.p} | ${rel(t.repo)} | ${t.note} |`)
}
console.log('\n(我们的注册表条目版本仍是 v0.3.4——PR 待批准;对比上周数字写回 docs/PM-RESEARCH)')
