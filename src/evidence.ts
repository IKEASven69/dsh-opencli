/**
 * 写操作证据包(任务 D):审批放行/拒绝的 site 写命令各落一份 JSON 证据——
 * 时间/命令/argv/审批结论/前后截图/结果摘要/站点。写命令是最高风险的操作面,
 * 事后追溯("它到底做了什么/为什么被允许")不能只靠轨迹里的 exit 码。
 * 纯函数层(组装/落盘/轮转/文件名解析),零宿主依赖、可直测;截图与时机由调用方
 * (src/index.ts 的 site 执行路径与 tools/post-execute 拒绝监听)负责。
 * @module dsh-opencli/evidence
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

/** 证据包保留份数(轮转上限):证据窗口比轨迹(当日)/快照(50)更长,但也不能无限涨。 */
export const EVIDENCE_KEEP = 100

/** 证据文件名:<ISO 时间戳(:. 转 -)>-<site>.json。时间戳字典序=时间序,轮转排序靠它;
 *  site 段仅 [\w.@-](evidenceFileName 落盘前再净化一次)。 */
export const EVIDENCE_FILE_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-([\w.@-]+)\.json$/

/** 审批结论:mode=事发时审批门状态('on'/'off');reason=null 正常执行,'blocked'=被拒(任务 D 约定值)。 */
export interface EvidenceApproval {
  mode: string
  reason: string | null
}

/** 一份写操作证据(落盘 JSON 的权威形状;字段顺序即序列化顺序,at 在首便于人读)。 */
export interface EvidenceRecord {
  at: string
  command: string
  argv: string[]
  approval: EvidenceApproval | null
  beforeShot: string | null
  afterShot: string | null
  result: { exitCode: number; head: string }
  site: string
}

/** buildEvidence 入参:at 缺省取当前时刻(测试传显式值保证确定性);边界字段宽松,组装时收口。 */
export interface EvidenceInput {
  at?: string
  command: unknown
  argv: unknown[]
  approval: EvidenceApproval | null
  beforeShot?: string | null
  afterShot?: string | null
  result: { exitCode: unknown; head: unknown }
  site: unknown
}

/** 组装一份证据包(除缺省 at 取时钟外无副作用,输出可直接 JSON.stringify 落盘)。
 *  head 截 200 字与轨迹 outHead 同宽——证据要可读,不是把整页输出塞进索引文件。 */
export function buildEvidence(input: EvidenceInput): EvidenceRecord {
  return {
    at: input.at ?? new Date().toISOString(),
    command: String(input.command),
    argv: input.argv.map((x) => String(x)),
    approval: input.approval,
    beforeShot: input.beforeShot ?? null,
    afterShot: input.afterShot ?? null,
    result: { exitCode: Number(input.result.exitCode), head: String(input.result.head).slice(0, 200) },
    site: String(input.site),
  }
}

/** 文件名时间戳段:ISO 的 : 与 . 换 -(文件系统安全,字典序保持时间序)。 */
export function evidenceStamp(at: string): string {
  return at.replace(/[:.]/g, '-')
}

/** 证据文件名;site 剥离非 [\w.@-] 字符——adapter 名虽经 site 工具校验,落盘层再防一手路径注入。 */
export function evidenceFileName(at: string, site: string): string {
  return `${evidenceStamp(at)}-${String(site).replace(/[^\w.@-]/g, '_')}.json`
}

/**
 * 证据包落盘 + 轮转:写 <dir>/<时间戳>-<site>.json,超出 keep 删最旧(文件名字典序=时间序,
 * 与快照 50 份/基准报告 20 份同一思路)。返回写入路径。同 site 同毫秒两次写会覆写——
 * 放行路径每包含 CLI 往返+双截图、拒绝路径隔一次人机审批,实际到不了同毫秒。
 */
export async function saveEvidence(dir: string, record: EvidenceRecord, keep = EVIDENCE_KEEP): Promise<string> {
  await mkdir(dir, { recursive: true })
  const file = join(dir, evidenceFileName(record.at, record.site))
  await writeFile(file, JSON.stringify(record, null, 2), 'utf8')
  const olds = readdirSync(dir).filter((f) => EVIDENCE_FILE_RE.test(f)).sort()
  if (olds.length > keep) for (const f of olds.slice(0, olds.length - keep)) { try { unlinkSync(join(dir, f)) } catch { /* 并发已删 */ } }
  return file
}

/** 从文件名还原 {at, site} 元数据(evidence-list 用:目录列表即索引,不读全文)。
 *  2026-10-20T12-34-56-789Z → 2026-10-20T12:34:56.789Z;不匹配权威命名返回 null。 */
export function parseEvidenceFileName(name: string): { at: string; site: string } | null {
  const m = EVIDENCE_FILE_RE.exec(name)
  if (m === null) return null
  const dashed = m[1]
  return { at: `${dashed.slice(0, 13)}:${dashed.slice(14, 16)}:${dashed.slice(17, 19)}.${dashed.slice(20, 23)}Z`, site: m[2] }
}
