/**
 * 文件抽取:文本族直接读;PDF 用 pdfjs-dist(进程内,无系统依赖);docx 用 mammoth。
 * 单文件失败不阻断整批导入(返回 null + 原因由调用方记录)。
 * @module dsh-intelhub
 */

import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import { parseFrontmatter } from './frontmatter.ts'
import type { FrontMeta } from './frontmatter.ts'

/** 支持导入的扩展名(小写)。 */
export const TEXT_EXTS = new Set(['.md', '.markdown', '.txt', '.log', '.csv', '.json', '.yaml', '.yml', '.xml', '.html', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.c', '.h', '.cpp', '.sh'])
export const PDF_EXTS = new Set(['.pdf'])
export const DOCX_EXTS = new Set(['.docx'])
export const SUPPORTED_EXTS = new Set([...TEXT_EXTS, ...PDF_EXTS, ...DOCX_EXTS])

/** 单文件原始大小上限(字节),防御性截流。 */
export const MAX_FILE_BYTES = 8 * 1024 * 1024

/** 极简 HTML 正文抽取:剥脚本/样式/导航结构,块级标签转空行,解码常见实体。 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(nav|footer|header|aside|noscript)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote|pre)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_m, d: string) => {
      try { return String.fromCodePoint(Number(d)) } catch { return '' }
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 抽取结果:null 表示不支持/失败,reason 供注册表 error 字段;meta 为 frontmatter 标量(仅文本族)。 */
export async function extractText(path: string): Promise<{ text: string | null; rawHash?: string; meta?: FrontMeta; reason?: string }> {
  const ext = extname(path).toLowerCase()
  let rawHash: string | undefined
  try {
    rawHash = createHash('sha256').update(await readFile(path)).digest('hex').slice(0, 16)
    if (TEXT_EXTS.has(ext)) {
      const raw = await readFile(path, 'utf8')
      const { meta, body } = parseFrontmatter(raw)
      const text = body.replace(/\u0000/g, '').trim() || null
      return { text, rawHash, meta, reason: text === null ? '空文件' : undefined }
    }
    if (PDF_EXTS.has(ext)) {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await readFile(path)), useSystemFonts: true }).promise
      const parts: string[] = []
      const pages = Math.min(doc.numPages, 500)
      for (let i = 1; i <= pages; i++) {
        const page = await doc.getPage(i)
        const content = await page.getTextContent()
        parts.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '))
      }
      const text = parts.join('\n\n').replace(/\u0000/g, '').trim()
      return text ? { text, rawHash } : { text: null, reason: 'PDF 无可抽取文本(可能为扫描件)' }
    }
    if (DOCX_EXTS.has(ext)) {
      const mammoth = await import('mammoth')
      const { value } = await mammoth.extractRawText({ path })
      return { text: value.trim() || null, rawHash, reason: '空文档' }
    }
    return { text: null, reason: `不支持的扩展名 ${ext}` }
  } catch (err: unknown) {
    return { text: null, reason: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200) }
  }
}
