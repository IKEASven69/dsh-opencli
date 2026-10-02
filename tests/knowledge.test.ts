// 站点知识包单测:三源合一(目录+失败签名+pitfalls)、未知站不编造、渲染完整性
import { describe, expect, it } from 'vitest'
import { buildKnowledge, renderKnowledgeMarkdown, PITFALLS, FAILURE_SIGNATURES, SITE_HEALTH, healthOf, SITE_HEALTH_STATUS_LABELS } from '../src/knowledge.ts'

const ENTRIES = [
  { site: 'weibo', name: 'hot', access: 'read', description: '微博热搜', domain: 'weibo.com' },
  { site: 'weibo', name: 'publish', access: 'write', description: '发微博' },
  { site: 'bilibili', name: 'hot', access: 'read', description: 'B站热门视频' },
  { site: 'weibo', command: 'weibo/search', access: 'read', description: '搜索微博' },
]

describe('buildKnowledge', () => {
  it('按 site 聚合命令(兼容 command 字段),域名取首条', () => {
    const k = buildKnowledge('weibo', ENTRIES)!
    expect(k).not.toBeNull()
    expect(k.site).toBe('weibo')
    expect(k.domain).toBe('weibo.com')
    expect(k.commandCount).toBe(3)
    expect(k.commands.map((c) => c.name).sort()).toEqual(['hot', 'publish', 'search'])
  })

  it('目录没有的站返回 null,不编造', () => {
    expect(buildKnowledge('nonexistent', ENTRIES)).toBeNull()
    expect(buildKnowledge('  ', ENTRIES)).toBeNull()
  })

  it('pitfalls:已知站给种子,未知站为空数组(宁缺勿造)', () => {
    expect(buildKnowledge('xiaohongshu', [{ site: 'xiaohongshu', name: 'search', access: 'read' }])!.pitfalls.length).toBeGreaterThan(0)
    expect(buildKnowledge('weibo', ENTRIES)!.pitfalls).toEqual(PITFALLS.weibo)
    expect(buildKnowledge('bilibili', ENTRIES)!.pitfalls.length).toBeGreaterThan(0)
    expect(buildKnowledge('obscure-site', [{ site: 'obscure-site', name: 'get', access: 'read' }])!.pitfalls).toEqual([])
  })

  it('大小写不敏感', () => {
    expect(buildKnowledge('Weibo', ENTRIES)!.commandCount).toBe(3)
  })
})

describe('renderKnowledgeMarkdown', () => {
  it('包含命令目录/write 标记/失败签名恢复表', () => {
    const md = renderKnowledgeMarkdown(buildKnowledge('weibo', ENTRIES)!)
    expect(md).toContain('# 站点知识卡:weibo')
    expect(md).toContain('`site weibo hot`')
    expect(md).toContain('`site weibo publish` `[write]`')
    expect(md).toContain('失败签名恢复表')
    expect(md).toContain('EMPTY_RESULT')
    expect(md).toContain('冷却 ≥2 分钟')
  })

  it('未知站(无 pitfalls)也渲染完整签名表', () => {
    const md = renderKnowledgeMarkdown(buildKnowledge('obscure-site', [{ site: 'obscure-site', name: 'get', access: 'read', description: 'x' }])!)
    expect(md).toContain('NAVIGATION_REJECTED')
    expect(md).not.toContain('已知坑')
    expect(md).not.toContain('健康度')
  })

  it('健康度段:受损站渲染 issue 明细与兜底提示,正常站不渲染', () => {
    const md = renderKnowledgeMarkdown(buildKnowledge('xiaohongshu', [{ site: 'xiaohongshu', name: 'search', access: 'read', description: '搜索' }])!)
    expect(md).toContain('站点健康度:受损')
    expect(md).toContain('#2562 captcha 重定向(search)')
    expect(md).toContain('browser_* 原语兜底')
    expect(renderKnowledgeMarkdown(buildKnowledge('weibo', ENTRIES)!)).not.toContain('健康度')
  })
})

describe('站点健康度(SITE_HEALTH)', () => {
  it('数据文件可加载:覆盖 2026-10-03 调研站点,issues 带上游 issue 号', () => {
    expect(Object.keys(SITE_HEALTH).length).toBeGreaterThanOrEqual(4)
    expect(SITE_HEALTH.xiaohongshu?.issues.join(' ')).toContain('#2562')
    expect(SITE_HEALTH.instagram?.issues.join(' ')).toContain('#2553')
    expect(healthOf('xiaohongshu')?.status).toBe('degraded')
    expect(healthOf('zhihu')?.status).toBe('notice')
    // 不在表内的站返回 null(默认正常,不编造)
    expect(healthOf('weibo')).toBeNull()
  })

  it('状态枚举合法(degraded/notice/unsupported),issues/updated 结构齐全', () => {
    for (const [site, h] of Object.entries(SITE_HEALTH)) {
      expect(Object.keys(SITE_HEALTH_STATUS_LABELS)).toContain(h.status)
      expect(Array.isArray(h.issues)).toBe(true)
      expect(h.issues.length).toBeGreaterThan(0)
      expect(typeof h.updated).toBe('string')
      expect(h.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(site).toBe(site.toLowerCase())
    }
  })
})

describe('种子数据健全性', () => {
  it('失败签名表非空且每条有恢复动作', () => {
    expect(FAILURE_SIGNATURES.length).toBeGreaterThanOrEqual(5)
    for (const f of FAILURE_SIGNATURES) {
      expect(f.recovery.length).toBeGreaterThan(4)
      expect(f.meaning.length).toBeGreaterThan(4)
    }
  })

  it('pitfalls 覆盖调研命中的风控重点站', () => {
    for (const s of ['xiaohongshu', 'weibo', 'bilibili', 'zhihu']) expect(PITFALLS[s]?.length).toBeGreaterThan(0)
    // 小红书种子必须提封号风险(中文圈第一恐惧)
    expect(PITFALLS.xiaohongshu.join('')).toContain('封号')
  })
})
