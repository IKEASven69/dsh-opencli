/**
 * SystemOne 决策层:封闭选项集的高频决策(命令选择/verify 断言/风险分级/步骤操作)
 * 下放到亚秒决策模型(laya 本地 ONNX / TypeSafe Jev API),任何失败/超时/低置信由调用方回退现有 LLM 路径。
 *
 * provider 三选一:laya(本地 ONNX,免费/离线/隐私最优)/ typesafe(官方 API)/ passthrough(直通)。
 * key 来源:TYPESAFE_API_KEY 环境变量,或 ~/.dsh/typesafe-key 文件(优先环境变量)。
 * @module dsh-opencli/systemone
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type SOProviderType = 'laya' | 'typesafe' | 'passthrough'

export interface SOQuestion {
  type: 'choice' | 'score' | 'noul'
  instructions: string
  criteria?: Record<string, string>
}

export type SOQuestions = Record<string, SOQuestion>

export interface SOAnswer {
  [name: string]: {
    type: SOType
    value: string | number | null
    confidence: number
    probabilities?: Record<string, number>
  }
}

export interface SOAskResult {
  ok: boolean
  answers: SOAnswer
  latencyMs: number
  error?: string
}

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const TIMEOUT_MS = 15_000

function loadKeyFromFile(): string {
  try {
    return readFileSync(join(homedir(), '.dsh', 'typesafe-key'), 'utf8').trim()
  } catch { return '' }
}

/** 决策层封装:provider 三选一,ask() 统一入口。错误不吞,由调用方降级。 */
export class SystemOne {
  private provider: SOProviderType
  private key: string
  private endpoint: string
  private layaLoaded = false
  private layaLoading: Promise<boolean> | null = null
  private layaEngine: { systemOne(state: unknown, q: unknown): Promise<{ answers: Record<string, any> }> } | null = null

  constructor(opts?: { provider?: SOProviderType; key?: string; endpoint?: string }) {
    this.provider = opts?.provider ?? 'laya'
    this.key = opts?.key ?? loadKeyFromFile()
    this.endpoint = opts?.endpoint ?? ENDPOINT
  }

  get configured(): boolean {
    return this.provider !== 'typesafe' || this.key.length > 0
  }

  /**
   * 就绪判定(热路径标注用):laya 需权重已入内存;typesafe/passthrough 无本地冷启动恒就绪。
   * site 工具的 noul 兜底只在本值为 true 时参与(verifyResult 的 warmOnly),预热窗口内标注缺席
   * 而不是把 ~60s 冷加载/权重下载挂进最高频工具调用。
   */
  get warm(): boolean {
    return this.provider !== 'laya' || this.layaLoaded
  }

  /** 后台预热:laya 权重冷加载约 60s,激活期就地把 1.6GB 装进内存,首次真调用才是亚秒。fire-and-forget,失败静默。 */
  async prewarm(): Promise<void> {
    if (this.provider !== 'laya' || this.layaLoaded) return
    try {
      await this.ensureLaya()
    } catch { /* 权重缺失/依赖未装:等首次真实调用再走优雅降级 */ }
  }

  async ask(state: string, questions: SOQuestions): Promise<SOAskResult> {
    const t0 = Date.now()
    try {
      switch (this.provider) {
        case 'laya': return await this.askLaya(state, questions)
        case 'typesafe': return await this.askTypesafe(state, questions)
        default: return { ok: false, answers: {}, latencyMs: 0, error: `未知 provider: ${this.provider}` }
      }
    } catch (e) {
      return { ok: false, answers: {}, latencyMs: Date.now() - t0, error: e instanceof Error ? e.message : String(e) }
    }
  }

  /**
   * laya 单飞加载:并发调用(prewarm 与 askLaya)共享同一次 load——上游 Laya.load()
   * 每次重建 tokenizer+InferenceSession(约 1.6GB),无单飞会双开会话内存尖峰。
   * 失败清引用允许下次重试;永不 reject(调用方看 layaLoaded 判定结果)。
   */
  private async ensureLaya(): Promise<boolean> {
    if (this.layaLoaded) return true
    if (this.layaLoading === null) {
      this.layaLoading = (async () => {
        const { Laya } = await import('@receptron/laya') as any
        this.layaEngine = await (Laya as any).load()
        this.layaLoaded = true
        return true
      })().catch(() => {
        this.layaLoading = null
        return false
      })
    }
    return this.layaLoading
  }

  /** laya 本地 ONNX:单次前向,不产生文本,亚秒。 */
  private async askLaya(state: string, questions: SOQuestions): Promise<SOAskResult> {
    const t0 = Date.now()
    if (!this.layaLoaded) await this.ensureLaya()
    if (!this.layaLoaded || this.layaEngine === null) {
      return { ok: false, answers: {}, latencyMs: Date.now() - t0, error: 'laya 未就绪(权重缺失或加载失败)' }
    }
    const raw = await this.layaEngine.systemOne({ text: state }, questions)
    const answers: SOAnswer = {}
    for (const [name, a] of Object.entries(raw.answers as Record<string, any>)) {
      if (a.choice !== undefined) answers[name] = { type: 'choice', value: a.choice, confidence: a.confidence ?? 0.5, probabilities: a.probabilities }
      else if (a.noul !== undefined) answers[name] = { type: 'noul', value: a.noul, confidence: a.confidence ?? 0.5 }
      else if (a.score !== undefined) answers[name] = { type: 'score', value: a.score, confidence: a.confidence ?? 0.5 }
    }
    return { ok: true, answers, latencyMs: Date.now() - t0 }
  }

  /** typesafe 官方 API:state+questions POST。响应与 laya 同一归一化形状({type,value,confidence}),读取方才不用分 provider。 */
  private async askTypesafe(state: string, questions: SOQuestions): Promise<SOAskResult> {
    const t0 = Date.now()
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, model: 'jev-latest', questions }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200)
      return { ok: false, answers: {}, latencyMs: Date.now() - t0, error: `HTTP ${res.status}: ${body}` }
    }
    const j = (await res.json()) as { answers?: Record<string, any> }
    const answers: SOAnswer = {}
    for (const [name, a] of Object.entries(j.answers ?? {})) {
      if (a.choice !== undefined) answers[name] = { type: 'choice', value: a.choice, confidence: a.confidence ?? 0.5, probabilities: a.probabilities }
      else if (a.noul !== undefined) answers[name] = { type: 'noul', value: a.noul, confidence: a.confidence ?? 0.5 }
      else if (a.score !== undefined) answers[name] = { type: 'score', value: a.score, confidence: a.confidence ?? 0.5 }
    }
    return { ok: true, answers, latencyMs: Date.now() - t0 }
  }
}

/** 便捷判定:noul 结果是否高置信为真。 */
export function noulYes(a: { value: string | number | null; confidence: number }, threshold = 0.7): boolean {
  return typeof a.value === 'number' && a.value >= threshold && a.confidence >= 0.5
}
