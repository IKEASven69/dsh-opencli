/**
 * frontmatter 解析:只取知识库采集文件用到的标量子集,不做完整 YAML。
 * 真实格式(知识库 collections):
 *   author/source/stage/type/date(ISO)/tags(顿号或逗号分隔)/likes(数字)
 * @module dsh-intelhub
 */

export interface FrontMeta {
  author?: string
  stage?: string
  tag?: string
  src?: string
  date?: string
  type?: string
  likes?: number
}

/** 解析 YAML frontmatter;无 frontmatter 或缺终止线时原样返回。 */
export function parseFrontmatter(raw: string): { meta: FrontMeta; body: string } {
  if (!raw.startsWith('---')) return { meta: {}, body: raw }
  const end = raw.indexOf('\n---', 3)
  if (end === -1) return { meta: {}, body: raw }
  const fmBlock = raw.slice(3, end)
  const bodyStart = raw.indexOf('\n', end + 1)
  const body = bodyStart === -1 ? '' : raw.slice(bodyStart + 1)

  const meta: FrontMeta = {}
  for (const line of fmBlock.split('\n')) {
    const i = line.indexOf(':')
    if (i === -1) continue
    const k = line.slice(0, i).trim().toLowerCase()
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (v === '') continue
    if (k === 'author') meta.author = v
    else if (k === 'stage') meta.stage = v
    else if (k === 'tags' || k === 'tag') meta.tag = v
    else if (k === 'source') meta.src = v
    else if (k === 'date' || k === 'collected') meta.date = v
    else if (k === 'type') meta.type = v
    else if (k === 'likes') {
      const n = parseInt(v, 10)
      if (Number.isFinite(n)) meta.likes = n
    }
  }
  return { meta, body }
}
