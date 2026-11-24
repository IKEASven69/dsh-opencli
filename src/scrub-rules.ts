// 出口清洗规则与函数(0.2.0 从 notify.ts 抽出):本文件必须保持 **strip-only 可加载**——
// .build-tools/fallback-drill.cjs 直接 require 本文件的 TS 源(node ≥23.6 原生类型剥离),
// 因此这里不得使用构造器参数属性等 strip-only 不支持的语法(notify.ts 里两个通道类有
// `constructor(private readonly …)`,26.x 剥离模式加载会炸——这是抽取的唯一原因,逻辑零改动)。
//
// 出口清洗规则:移除本机路径与凭据,替换为占位符(占位符保留可读性,排障时还能看出
// "这里原本有个路径/令牌")。规则顺序有意义:先路径后令牌,路径占位符是中文不会再被
// 令牌规则误吃。字符集取可打印 ASCII,天然停在 CJK 前——"C:\a 的报告"只吃 "C:\a ",
// 中文内容不陪葬。
export const SCRUB_RULES: Array<{ re: RegExp; to: string }> = [
  // URL 敏感查询参数(回执/轨迹卫生,借 playwright-mcp --redact-url-params 同款默认值):
  // token/access_token/sid/code/key/secret/session/signature 等参数值一律脱敏——分享的
  // 链接里 ?token=… / ?code=… 是最常见的凭据外流通道,字段名保留(排障可读),值抹掉。
  // 置于最前:先于 hex/base64 规则,避免长 token 先被整段吃掉导致字段名也消失。
  // 值的终止符含引号/尖括号/反斜杠/右括号:快照 stdout 是 JSON(URL 在字符串里,止于 ")、
  // 也有 markdown 链接 (url) 与 HTML 属性——只认 &/空白会一路吞到行尾,把相邻 JSON 对象
  // 静默并成一个(当场复现的数据损坏),diff/漂移判定/CSV 导出全被带坏
  { re: /([?&](?:access_token|auth|auth_token|code|key|secret|session(?:_key|_id)?|sid|sig|signature|ticket|token)=)[^&\s#"'<>\\)]*/gi, to: '$1[已脱敏]' },
  // Windows 绝对路径(C:\Users\<用户名>\… / D:/x/y)。lookbehind 只挡词字符紧邻(https://
  // 的单字母候选前面必是词字符,天然挡住);冒号不豁免——"路径:C:\Users\x" 里的路径照样清洗
  // (旧版 (?<![\w:]) 让 ASCII 冒号后的整段本机路径漏洗,已修正)
  { re: /(?<!\w)[A-Za-z]:[\\/][ -~]*/g, to: '[本地路径]' },
  // 波浪 home 路径(~/.dsh/…、~\…)
  { re: /~[\\/][ -~]*/g, to: '[home路径]' },
  // unix 风格 home(Linux/macOS);系统目录(/tmp /var 等)不扫——通知里出现它们的语义无害
  { re: /(?:\/home\/|\/Users\/)[ -~]*/g, to: '[home路径]' },
  // 键值形态的令牌(Bearer/token=…/api_key:…):保留字段名,值抹掉。(?!\[) 跳过已是占位符的值——
  // URL 参数规则先把 ?token=X 洗成 ?token=[已脱敏],本规则若再吃进 '[' 会产出 "[已移除]已脱敏]"
  // 残文(两规则共存的双重清洗冲突,当场复现后修正)
  { re: /\b(Bearer|token|apikey|api_key|api-key|secret|password|passwd)([ \t]*[:=][ \t]*)(?!\[)[!-~]+/gi, to: '$1$2[已移除]' },
  // 裸 Bearer 头(Authorization: Bearer xxx 形态,Bearer 与值之间没有冒号)
  { re: /(?<![A-Za-z0-9_-])Bearer[ \t]+[!-~]+/gi, to: 'Bearer [已移除]' },
  // 具名密钥前缀(openai sk-、github ghp_/gho_ 下划线形态、slack xox*、google ya29):
  // 不在键值对里也绝不能外流;分隔符 [-_] 兼容——github 官方真实格式是 ghp_ 下划线,
  // 旧规则只认连字符,真实 token 反而漏洗(已修正)
  { re: /\b(?:sk|ghp|gho|xoxb|xoxp|ya29)[-_][A-Za-z0-9_-]{8,}/g, to: '[已移除]' },
  // 32+ 位连续 hex(sha256/会话 id);40+ 位 base64 形态 blob——长随机串一律按凭据对待
  { re: /\b[0-9a-fA-F]{32,}\b/g, to: '[已移除]' },
  { re: /\b[A-Za-z0-9+/]{40,}={0,2}/g, to: '[已移除]' },
]

/** 通知正文出口清洗:所有通道发送前必须过这一道(buildNotifyBody 已内置,手工拼正文时单独调用)。 */
export function scrubLocalPaths(text: string): string {
  let out = text
  for (const r of SCRUB_RULES) out = out.replace(r.re, r.to)
  return out
}

/**
 * URL 敏感查询参数脱敏(回执/轨迹卫生;与出口清洗同 scrub 体系,单规则复用):
 * 回执摘要/轨迹行/轨迹报告在**落盘侧**也过这道——通知出口本来就会洗,但 traces/snapshots
 * 是本地落盘文件,复盘时被复制粘贴进聊天/issue 的场景同样泄凭据(playwright-mcp
 * --redact-url-params 同款默认值口径)。字段名保留、值替换,排障可读性不丢。
 */
export function scrubUrlParams(text: string): string {
  return text.replace(SCRUB_RULES[0]!.re, SCRUB_RULES[0]!.to)
}
