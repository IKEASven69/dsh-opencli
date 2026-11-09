/**
 * 回执深化 / coverage 近似 / #59 装饰步 / URL 参数脱敏 / 推送卡任务身份 —— 纯函数单测(src 直测)。
 * D#6:partial(#2766 分页提示)/unloaded(#2708 未渲染完)探测口径;E③:stop_reason/remaining_cursor
 * 插件层近似(上游 #2698 设计落地后对齐);#59:isDecorativeStep 只认 scroll/hover;D#9:scrubUrlParams
 * 与出口清洗同一 scrub 体系、buildNotifyBody 任务身份行。
 */
import { describe, expect, it } from 'vitest'
import { coverageStopReason, cursorOfPartialPage, isDecorativeStep, looksPartialPage, looksUnloaded, typedErrorCode } from '../src/parsers.ts'
import { buildNotifyBody, scrubLocalPaths, scrubUrlParams } from '../src/notify.ts'

// 上游 2.0.3 #2766 的原文提示(维护者 follow-up 实录:非 JSON 格式把分页提示打到 stderr)
const UPSTREAM_2766 = 'Showing 1-25 of 47 commands; rerun with --offset 25 for more.'

describe('D#6 typed 失败码(2.0.3 #2708/#2754 家族)', () => {
  it('信封 stderr 首行全大写下划线码 → 原码取用(COUNTS_NOT_LOADED/AUTH_REQUIRED/EMPTY_RESULT)', () => {
    for (const code of ['COUNTS_NOT_LOADED', 'AUTH_REQUIRED', 'EMPTY_RESULT', 'SECURITY_BLOCK']) {
      expect(typedErrorCode(`${code}\nmessage line\nhint line`)).toBe(code)
    }
  })
  it('UNKNOWN/ERROR 占位与泛词不算 typed;1.x 文本/空串 → null(宁缺毋假)', () => {
    expect(typedErrorCode('UNKNOWN\nfetch failed')).toBeNull()
    expect(typedErrorCode('ERROR\nboom')).toBeNull()
    expect(typedErrorCode('Daemon: running\nVersion: 1.8.6')).toBeNull()
    expect(typedErrorCode('')).toBeNull()
    expect(typedErrorCode('lower_case_code\nx')).toBeNull()
  })
})

describe('D#6 partial 口径(#2766 分页提示)', () => {
  it('命中上游原文提示 → partial,cursor=下一页 offset', () => {
    expect(looksPartialPage(`[{"a":1}]\n${UPSTREAM_2766}`)).toBe(true)
    expect(cursorOfPartialPage(UPSTREAM_2766)).toBe(25)
  })
  it('无提示 → 非 partial,cursor 未知恒 null', () => {
    expect(looksPartialPage('[{"a":1},{"a":2}]')).toBe(false)
    expect(cursorOfPartialPage('[{"a":1}]')).toBeNull()
    // 半截提示(无 offset)不算:宁缺毋假
    expect(looksPartialPage('Showing 1-25 of 47 commands')).toBe(false)
  })
})

describe('D#6 unloaded 口径(#2708 未渲染完即读)', () => {
  it('加载中/骨架/水合标记 → unloaded', () => {
    for (const t of ['{"items":[],"tip":"加载中"}', '正在加载…', 'skeleton card', 'loading...', 'waiting for hydration']) {
      expect(looksUnloaded(t)).toBe(true)
    }
  })
  it('普通空结果/挑战页不算 unloaded(挑战归 risk_wall,空结果归 empty)', () => {
    expect(looksUnloaded('[]')).toBe(false)
    expect(looksUnloaded('{"items":[]}')).toBe(false)
    expect(looksUnloaded('Just a moment... verifying your browser')).toBe(false)
  })
})

describe('E③ coverage stop_reason 近似(插件层近似,上游 #2698 落地后对齐)', () => {
  it('失败=error;截断/分页未尽=truncated;成功且结构化=end;成功但非结构化=null(未知不臆造)', () => {
    expect(coverageStopReason(false, false, false)).toBe('error')
    expect(coverageStopReason(false, true, true)).toBe('error') // 失败优先:失败输出的截断无意义
    expect(coverageStopReason(true, true, true)).toBe('truncated')
    expect(coverageStopReason(true, false, true)).toBe('end')
    expect(coverageStopReason(true, false, false)).toBeNull()
  })
})

describe('#59 装饰步识别(只改视觉,不读写数据)', () => {
  it('录制步骤新旧头 + 轨迹行形态的 scroll/hover → 装饰', () => {
    expect(isDecorativeStep('opencli_scroll down')).toBe(true)
    expect(isDecorativeStep('browser_hover 3')).toBe(true)
    expect(isDecorativeStep('browser dsh scroll down')).toBe(true)
    expect(isDecorativeStep('browser bench hover 12')).toBe(true)
  })
  it('数据读写步骤永不归入装饰类', () => {
    for (const s of ['opencli_click 3', 'opencli_state', 'opencli_open https://e.com', 'browser_type 2 hi', 'browser dsh fill 1 x', 'site zhihu hot', 'scroll down', '']) {
      expect(isDecorativeStep(s)).toBe(false)
    }
  })
})

describe('D#9 URL 敏感参数脱敏(与出口清洗同 scrub 体系)', () => {
  it('token/code/sid/access_token/sig 值抹掉、键名保留;无关参数不动', () => {
    const t = 'open https://s.cn/cb?code=AbC123&state=ok&access_token=tok.en-1&q=keyword&sid=99#frag'
    const out = scrubUrlParams(t)
    expect(out).toContain('code=[已脱敏]')
    expect(out).toContain('access_token=[已脱敏]')
    expect(out).toContain('sid=[已脱敏]')
    expect(out).toContain('state=ok')
    expect(out).toContain('q=keyword')
    expect(out).toContain('#frag') // 片段不被值吞掉
    expect(out).not.toContain('AbC123')
    expect(out).not.toContain('tok.en-1')
  })
  it('幂等:重复脱敏结果不变(调度链路与 recordTrace 双层都过也安全)', () => {
    const once = scrubUrlParams('https://x.com/?token=SECRET&sig=abc')
    expect(scrubUrlParams(once)).toBe(once)
  })
  it('JSON 完整性:值止于引号——快照 stdout 脱敏后仍是同构 JSON(回归:曾一路吞到行尾把相邻对象并成一个)', () => {
    const src = '[{"u":"https://x.com/a?sid=SECRET7","n":7},{"u":"https://y.cn/?code=Z9&q=1"}]'
    const out = scrubUrlParams(src)
    const parsed = JSON.parse(out) as Array<{ u: string; n?: number }>
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toEqual({ u: 'https://x.com/a?sid=[已脱敏]', n: 7 })
    expect(parsed[1]!.u).toBe('https://y.cn/?code=[已脱敏]&q=1')
    // markdown 链接与 HTML 属性同样在定界符处停住
    expect(scrubUrlParams('[x](https://a.com/?token=T1) tail')).toBe('[x](https://a.com/?token=[已脱敏]) tail')
    expect(scrubUrlParams('<a href="https://a.com/?code=C1">x</a>')).toBe('<a href="https://a.com/?code=[已脱敏]">x</a>')
  })
  it('非查询串里的同名词不误伤(keyword=/codex 等)', () => {
    expect(scrubUrlParams('https://x.com/?keyword=code&codex=1')).toBe('https://x.com/?keyword=code&codex=1')
  })
  it('通知出口 scrubLocalPaths 已含该规则(推送卡同样不外流 URL 凭据)', () => {
    expect(scrubLocalPaths('详情 https://x.com/cb?code=abcdef')).toBe('详情 https://x.com/cb?code=[已脱敏]')
  })
  it('与键值令牌规则共存不双重清洗(回归:曾产出 "token=[已移除]已脱敏]" 残文),后续参数保留', () => {
    expect(scrubLocalPaths('https://x.com/n?token=SECRET&next=/p')).toBe('https://x.com/n?token=[已脱敏]&next=/p')
    // 键值规则本身照旧生效
    expect(scrubLocalPaths('token: abc123')).toBe('token: [已移除]')
  })
})

describe('D#9 推送卡任务身份行', () => {
  const at = new Date(2026, 10, 9, 8, 30)
  it('带来源:「任务:<命令> · 来源 <source>」', () => {
    const { body } = buildNotifyBody({ site: 'site zhihu hot', source: 'agent' }, { ok: true }, at)
    expect(body).toContain('任务:zhihu hot · 来源 agent')
  })
  it('无来源:只写任务名;任务名里的 URL 凭据同样被洗', () => {
    const { body } = buildNotifyBody({ site: 'xiaohongshu note https://x.com/n?token=SECRET' }, { ok: false }, at)
    expect(body).toContain('任务:xiaohongshu note https://x.com/n?token=[已脱敏]')
    expect(body).not.toContain('SECRET')
    expect(body).not.toContain('来源')
  })
})
