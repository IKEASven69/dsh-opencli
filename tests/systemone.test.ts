// SystemOne 决策层测试:本地 mock 端点验证请求形状与结构化解析;noulYes 纯函数判定
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import { SystemOne, noulYes } from '../src/systemone.ts'

let srv: Server | null = null

beforeAll(async () => {
  srv = createServer((req, res) => {
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', () => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({
        model: 'jev-1.13.0',
        answers: {
          pick: { type: 'choice', choice: 'site zhihu hot', confidence: 1.0, probabilities: { 'site zhihu hot': 1.0 } },
          verify: { type: 'noul', noul: 0.91 },
        },
      }))
    })
  })
  await new Promise<void>((r) => srv!.listen(9245, '127.0.0.1', r))
})

afterAll(async () => {
  srv?.close()
})

describe('SystemOne 决策层(typesafe provider 对 mock 端点)', () => {
  let so: SystemOne

  beforeAll(() => {
    so = new SystemOne({ provider: 'typesafe', key: 'test-key', endpoint: 'http://127.0.0.1:9245/v1/systemone' })
  })

  it('ask:发 state+questions,结构化解析应答', async () => {
    const r = await so.ask('页面状态', {
      pick: { type: 'choice', instructions: '选命令', criteria: { 'site zhihu hot': '热榜' } },
      verify: { type: 'noul', instructions: '页面符合预期' },
    })
    expect(r.ok).toBe(true)
    expect(r.answers.pick?.choice).toBe('site zhihu hot')
    expect(r.answers.verify?.noul).toBeCloseTo(0.91)
  })

  it('noulYes 判定:高置信真值', () => {
    expect(noulYes({ value: 0.91, confidence: 0.9 })).toBe(true)
    expect(noulYes({ value: 0.4, confidence: 0.9 })).toBe(false)
    expect(noulYes({ value: null, confidence: 0.9 })).toBe(false)
  })
})
