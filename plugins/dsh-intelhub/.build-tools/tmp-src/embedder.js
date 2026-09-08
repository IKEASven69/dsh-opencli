/**
 * 向量化层:本地 e5-small(transformers.js,q8)惰性加载;测试用确定性假向量注入。
 * 与存储层解耦——换模型/换 API 只是换 Embedder 实现。
 * @module dsh-intelhub
 */ import { createHash } from 'node:crypto';
/** e5 家族查询/文档前缀。 */ const Q_PREFIX = 'query: ';
const D_PREFIX = 'passage: ';
/** 本地 e5-small。模型下载/加载第一次触发,之后走本地缓存。 */ export class E5Embedder {
    dim = 384;
    ready;
    extractor = null;
    constructor(cacheDir){
        this.ready = (async ()=>{
            const { pipeline, env } = await import('@huggingface/transformers');
            env.cacheDir = cacheDir;
            const ex = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', {
                dtype: 'q8'
            });
            this.extractor = ex;
        })().catch((err)=>{
            this.loadError = err instanceof Error ? err.message : String(err);
            throw err;
        });
    }
    loadError = null;
    get error() {
        return this.loadError;
    }
    async embed(texts, isQuery = false) {
        if (this.extractor === null) throw new Error(this.loadError ?? 'embedding 模型未就绪');
        const out = [];
        for (const t of texts){
            const r = await this.extractor((isQuery ? Q_PREFIX : D_PREFIX) + t, {
                pooling: 'mean',
                normalize: true
            });
            out.push(Array.from(r.data));
        }
        return out;
    }
}
/** 测试桩:内容哈希驱动的确定性向量,无语义,只验证机器。 */ export class FakeEmbedder {
    dim;
    ready = null;
    constructor(dim = 8){
        this.dim = dim;
    }
    async embed(texts) {
        return texts.map((t)=>{
            const v = new Array(this.dim).fill(0);
            const h = createHash('sha256').update(t).digest();
            for(let i = 0; i < this.dim; i++)v[i] = (h[i % h.length] - 128) / 128;
            const norm = Math.sqrt(v.reduce((s, x)=>s + x * x, 0)) || 1;
            return v.map((x)=>x / norm);
        });
    }
}
