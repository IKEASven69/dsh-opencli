/**
 * 文本分块:先按 markdown 标题切 section(标题是强语义边界,不被合并跨过),
 * section 内按空行切段落并合并到 maxLen;超长段落硬切;过短碎屑并入相邻块或丢弃。
 * spike 实证:整篇文档做单向量会被"万金油"长文淹没,分块是语义检索的硬前提。
 * @module dsh-intelhub
 */ export const DEFAULT_MAX_CHUNK = 400;
const MIN_CHUNK = 24;
export const MAX_CHUNKS_PER_FILE = 2000;
const HEADING = /^#{1,6} .*$/;
/**
 * 嵌入用文本:剥掉 markdown 语法(标题井号/加粗/行内码/列表符/表格线)。
 * 实测:块文本带着 ## 等 syntax 会让所有向量共享同一"格式成分",余弦挤进 0.84~0.87 窄带,排序失效。
 */ export function embedTextOf(chunk) {
    return chunk.replace(/^#{1,6}[ \t]+/gm, '').replace(/\*\*/g, '').replace(/`{1,3}/g, '').replace(/^[-*+>]+[ \t]*/gm, '').replace(/^\|/gm, '').replace(/[ \t]+/g, ' ').trim();
}
/** 把一篇文本切成检索块。 */ export function chunkText(input, maxLen = DEFAULT_MAX_CHUNK) {
    const text = input.replace(/\r\n/g, '\n');
    if (!text.trim()) return [];
    const lines = text.split('\n');
    const sections = [];
    let cur = [];
    for (const line of lines){
        if (HEADING.test(line.trim()) && cur.some((l)=>l.trim() !== '')) {
            sections.push(cur.join('\n'));
            cur = [
                line
            ];
        } else {
            cur.push(line);
        }
    }
    sections.push(cur.join('\n'));
    const chunks = [];
    const push = (s)=>{
        const t = s.trim();
        // 首行是标题的块有结构意义,不按长度丢
        const firstLine = t.split('\n', 1)[0] ?? '';
        if ((t.length >= MIN_CHUNK || HEADING.test(firstLine)) && chunks.length < MAX_CHUNKS_PER_FILE) chunks.push(t);
    };
    for (const section of sections){
        const paras = section.split(/\n[ \t]*\n/).map((p)=>p.trim()).filter((p)=>p !== '');
        let buf = '';
        for (const p of paras){
            if (p.length > maxLen) {
                if (buf) {
                    push(buf);
                    buf = '';
                }
                for(let i = 0; i < p.length && chunks.length < MAX_CHUNKS_PER_FILE; i += maxLen)push(p.slice(i, i + maxLen));
                continue;
            }
            if (buf.length + p.length + 1 <= maxLen) {
                buf += (buf ? '\n' : '') + p;
            } else {
                push(buf);
                buf = p;
            }
        }
        push(buf);
    }
    // 短文档兜底:全文不足 MIN_CHUNK 时保留为单块(用户随手的一句话笔记也应可检索)
    if (chunks.length === 0) {
        const whole = text.trim();
        if (whole) chunks.push(whole.length > maxLen ? whole.slice(0, maxLen) : whole);
    }
    return chunks;
}
