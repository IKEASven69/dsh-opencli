// 0.1.3 MCP 自host 真端点探测(活体):三链路+版本钳回+401+批越界逐条回错。
// 读 ~/.dsh/opencli-mcp-auth.json 发现端点;退出码 0=全过。
const fs = require('node:fs')
const os = require('node:os')
const auth = JSON.parse(fs.readFileSync(os.homedir() + '/.dsh/opencli-mcp-auth.json', 'utf8'))
const call = (body, hdrs = {}) => fetch('http://127.0.0.1:' + auth.port + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + auth.token, ...hdrs }, body: JSON.stringify(body) })
let fail = 0
const check = (name, cond, detail) => { console.log((cond ? '✓' : '✗') + ' ' + name + (cond ? '' : ' — ' + String(detail).slice(0, 160))); cond ? 0 : fail++ }
;(async () => {
  // 1) initialize:故意发不认识的协议版本 → 服务端必须钳回自己支持的 2025-06-18(不假兼容)
  const init = await call({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2020-01-01', clientInfo: { name: 'probe' } } })
  const initJ = await init.json()
  check('initialize 200', init.status === 200, init.status)
  check('版本钳回 2025-06-18', initJ.result?.protocolVersion === '2025-06-18', initJ.result?.protocolVersion)
  check('serverInfo.name', initJ.result?.serverInfo?.name === 'dsh-opencli', JSON.stringify(initJ.result?.serverInfo))
  // 2) tools/list:只读双工具
  const list = await call({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
  const tools = (await list.json()).result?.tools?.map((t) => t.name)
  check('tools/list', list.status === 200 && tools?.includes('knowledge_list') && tools?.includes('knowledge_get'), JSON.stringify(tools))
  // 3) tools/call 真卡
  const get = await call({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'knowledge_get', arguments: { site: 'zhihu' } } })
  const getJ = await get.json()
  check('knowledge_get zhihu', get.status === 200 && String(getJ.result?.content?.[0]?.text || '').includes('站点知识卡'), (getJ.result?.content?.[0]?.text || '').slice(0, 60))
  // 4) 无 token → 401
  const noTok = await fetch('http://127.0.0.1:' + auth.port + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  check('无 token 401', noTok.status === 401, noTok.status)
  // 5) 批 22 条(超 20):20 条内正常回,第 121/122 条(id 120/121)逐条 -32603 回错,不静默吞
  const batch = await call(Array.from({ length: 22 }, (_, i) => ({ jsonrpc: '2.0', id: 100 + i, method: 'ping' })))
  const batchJ = await batch.json()
  const inWindow = Array.isArray(batchJ) ? batchJ.filter((x) => x.id >= 100 && x.id <= 119 && x.result).length : 0
  const over120 = Array.isArray(batchJ) ? batchJ.filter((x) => x.id === 120 && x.error?.code === -32603).length : 0
  const over121 = Array.isArray(batchJ) ? batchJ.filter((x) => x.id === 121 && x.error?.code === -32603).length : 0
  check('批窗口 20 条全回', inWindow === 20, 'inWindow=' + inWindow)
  check('批越界逐条回错(120/121)', over120 === 1 && over121 === 1, '120=' + over120 + ' 121=' + over121)
  console.log(fail === 0 ? 'MCP-PROBE ALL PASS' : `MCP-PROBE ${fail} FAIL`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('MCP-PROBE-ERR', e.message); process.exit(2) })
