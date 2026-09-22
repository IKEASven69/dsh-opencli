/**
 * SystemOne 决策层:封闭选项集的高频决策(命令选择/verify 断言/风险分级/步骤操作)
 * 下放到亚秒决策模型(TypeSafe Jev API),任何失败/超时/低置信由调用方回退现有 LLM 路径。
 *
 * provider 抽象:typesafe(官方 API,key)/ laya(@receptron/laya 本地 ONNX,预留)/ passthrough。
 * key 来源:TYPESAFE_API_KEY 环境变量,或 ~/.dsh/typesafe-key 文件(优先环境变量)。
 * @module dsh-opencli/systemone
 */

export type SOType = 'choice' | 'score' | 'noul'

export interface SOQuestion {
  type: SOType
  instructions: string
  /** choice: 选项→描述;score: 等级→描述(有序);noul 不需要 */
  criteria?: Record<string, string>
}

export type SOQuestions = Record<string, SOQuestion>

export interface SOAnswer {
  [name: string]: {
    type: SOType
    /** choice: 选中的选项;score: 期望等级;noul: P(true) */
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

/** 决策层封装:读 key、发 state+questions、结构化返回。错误不吞,由调用方降级。 */
export class SystemOne {
  private key: string
  private endpoint: string

  constructor(key?: string, endpoint?: string) {
    this.key = key ?? SystemOne.loadKey()
    this.endpoint = endpoint ?? ENDPOINT
  }

  static loadKey(): string {
    if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY
    try {
      const p = process.platform === 'win32'
        ? String.raw`C:\Users\${process.env.USERNAME ?? ''}\.dsh\typesafe-key`
        : `${process.env.HOME ?? ''}/.dsh/typesafe-key`
      return readKeyFile(p)
    } catch { return '' }
  }

  get configured(): boolean {
    return this.key.length > 0
  }

  async ask(state: string, questions: SOQuestions): Promise<SOAskResult> {
    const t0 = Date.now()
    if (!this.configured) return { ok: false, answers: {}, latencyMs: 0, error: 'TYPESAFE_API_KEY 未配置' }
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
    const j = (await res.json()) as { answers?: SOAnswer; model?: string }
    return { ok: true, answers: j.answers ?? {}, latencyMs: Date.now() - t0 }
  }
}

/** 便捷判定:noul 结果是否高置信为真。 */
export function noulYes(a: { value: string | number | null; confidence: number }, threshold = 0.7): boolean {
  return typeof a.value === 'number' && a.value >= threshold && a.confidence >= 0.5
}
