// 本机验证构建:SWC(stage-3 装饰器转译)+ esbuild 打包 + client __ModuleLoader__ 注册包装。
// 首次使用:在本目录执行 `npm init -y && npm install @swc/core esbuild`,然后 `node build.cjs`。
// 正式构建走 tsdown(需上游 dsh-type-meta 发布修复或 harness 工具链)。
const fs = require('node:fs')
const path = require('node:path')
const swc = require('@swc/core')
const esbuild = require('esbuild')

const root = path.resolve(__dirname, '..')
const pkgName = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name
const srcDir = path.join(root, 'src')
const tmpDir = path.join(__dirname, 'tmp-src')
const outDir = path.join(root, 'lib')

fs.mkdirSync(tmpDir, { recursive: true })
fs.mkdirSync(outDir, { recursive: true })
// 知识数据文件:拷进构建临时区,保持 src 里的相对路径(../knowledge/...)可解析
fs.cpSync(path.join(root, 'knowledge'), path.join(__dirname, 'knowledge'), { recursive: true })

const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.ts'))
for (const f of files) {
  const r = swc.transformFileSync(path.join(srcDir, f), {
    jsc: {
      parser: { syntax: 'typescript', decorators: true },
      transform: { decoratorVersion: '2022-03' },
      target: 'es2022',
    },
    module: { type: 'es6' },
    isModule: true,
  })
  const code = r.code.replace(/(\.{1,2}\/[\w./@-]+)\.ts(['"])/g, '$1.js$2')
  fs.writeFileSync(path.join(tmpDir, f.replace(/\.ts$/, '.js')), code)
}

// 发布物卫生:esbuild 打包时在每个模块段首写一行源路径注释(`// .build-tools/tmp-src/x.js`、
// `// .build-tools/knowledge/x.json`),把本仓内部构建管线的目录结构带进 npm 包。这类整行注释
// 只含一个指向构建临时区的路径、与运行行为无关,产物落盘前整行剥掉;源码注释不受影响
// (只匹配「整行仅为 tmp-src/ 或 knowledge/ 路径」的形态,cwd 在仓库根或 .build-tools 内均适用)。
const BUILD_PATH_COMMENT = /^\s*\/\/ (?:\.build-tools\/)?(?:tmp-src|knowledge)\/[\w./-]+\s*$/
const stripBuildPathComments = (code) => code.split('\n').filter((l) => !BUILD_PATH_COMMENT.test(l)).join('\n')

esbuild.buildSync({
  entryPoints: [path.join(tmpDir, 'index.js')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  external: ['@deepseek-ai/*', 'react', 'react/*', '@receptron/*', 'onnxruntime-*'],
  outfile: path.join(outDir, 'index.js'),
})
const indexOut = path.join(outDir, 'index.js')
fs.writeFileSync(indexOut, stripBuildPathComments(fs.readFileSync(indexOut, 'utf8')))
console.log(`lib/index.js  ${(fs.statSync(indexOut).size / 1024).toFixed(1)} kB`)

esbuild.buildSync({
  entryPoints: [path.join(tmpDir, 'client.js')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'es2022',
  external: ['@deepseek-ai/*', 'react', 'react/*', '@receptron/*', 'onnxruntime-*'],
  outfile: path.join(__dirname, 'tmp-client.cjs'),
})
const cjsBody = stripBuildPathComments(fs.readFileSync(path.join(__dirname, 'tmp-client.cjs'), 'utf8'))
const clientWrapped = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(pkgName)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
${cjsBody.split('\n').map((l) => (l.length === 0 ? '' : '\t\t' + l)).join('\n')}
\t\treturn module.exports;
\t}
});
`
fs.writeFileSync(path.join(outDir, 'client.js'), clientWrapped)
console.log(`lib/client.js  ${(fs.statSync(path.join(outDir, 'client.js')).size / 1024).toFixed(1)} kB`)
console.log(`local build done for ${pkgName} (swc stage-3 + esbuild + module-loader wrapper)`)
