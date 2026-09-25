// 部署:把开发仓构建产物直拷到 dsh profile 的插件商店副本。
// 背景:dsh plugin install 走 GitHub tarball 会因网络失败;且商店副本与开发仓 lib 无联动,
// 忘记部署时 daemon 一直跑旧版(2026-09-25 watch E2E 假失败即此因)。
// 用法:node .build-tools/deploy.cjs <profile 名,默认 web>;部署后需重启该 profile 的 daemon。
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const profile = process.argv[2] ?? 'web'
const root = path.resolve(__dirname, '..')
const store = path.join(os.homedir(), '.dsh', 'profiles', profile, 'node_modules', 'dsh-opencli')
if (!fs.existsSync(path.join(store, 'lib'))) {
  console.error(`store 不存在:${store}(先 dsh plugin --profile ${profile} install 装一次)`)
  process.exit(1)
}
for (const [src, dest] of [
  ['lib/index.js', 'lib/index.js'],
  ['lib/client.js', 'lib/client.js'],
  ['package.json', 'package.json'],
]) {
  fs.copyFileSync(path.join(root, src), path.join(store, dest))
  console.log(`${src} -> ${dest} (${(fs.statSync(path.join(store, dest)).size / 1024).toFixed(1)} kB)`)
}
const built = fs.readFileSync(path.join(store, 'lib', 'index.js'), 'utf8')
const dev = fs.readFileSync(path.join(root, 'lib', 'index.js'), 'utf8')
console.log(built === dev ? '校验:与开发仓产物一致 ✓(记得重启 daemon)' : '警告:内容不一致!')
