// 站点知识包单测:三源合一(目录+失败签名+pitfalls)、未知站不编造、渲染完整性
import { describe, expect, it } from 'vitest'
import { buildKnowledge, renderKnowledgeMarkdown, PITFALLS, FAILURE_SIGNATURES } from '../src/knowledge.ts'

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
