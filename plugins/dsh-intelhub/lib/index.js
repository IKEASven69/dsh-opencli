// .build-tools/tmp-src/index.js
import { Service } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { TypertRemoteService, Remote } from "@deepseek-ai/dsh-typert-protocol";
import { homedir } from "node:os";
import { createHash as createHash2 } from "node:crypto";
import { mkdir as mkdir3, readFile as readFile4, writeFile as writeFile3, readdir, stat as stat2 } from "node:fs/promises";
import { join as join3, resolve, sep } from "node:path";

// .build-tools/tmp-src/chunker.js
var DEFAULT_MAX_CHUNK = 400;
var MIN_CHUNK = 24;
var MAX_CHUNKS_PER_FILE = 2e3;
var HEADING = /^#{1,6} .*$/;
function embedTextOf(chunk) {
  return chunk.replace(/^#{1,6}[ \t]+/gm, "").replace(/\*\*/g, "").replace(/`{1,3}/g, "").replace(/^[-*+>]+[ \t]*/gm, "").replace(/^\|/gm, "").replace(/[ \t]+/g, " ").trim();
}
function chunkText(input, maxLen = DEFAULT_MAX_CHUNK) {
  const text = input.replace(/\r\n/g, "\n");
  if (!text.trim()) return [];
  const lines = text.split("\n");
  const sections = [];
  let cur = [];
  for (const line of lines) {
    if (HEADING.test(line.trim()) && cur.some((l) => l.trim() !== "")) {
      sections.push(cur.join("\n"));
      cur = [
        line
      ];
    } else {
      cur.push(line);
    }
  }
  sections.push(cur.join("\n"));
  const chunks = [];
  const push = (s) => {
    const t = s.trim();
    const firstLine = t.split("\n", 1)[0] ?? "";
    if ((t.length >= MIN_CHUNK || HEADING.test(firstLine)) && chunks.length < MAX_CHUNKS_PER_FILE) chunks.push(t);
  };
  for (const section of sections) {
    const paras = section.split(/\n[ \t]*\n/).map((p) => p.trim()).filter((p) => p !== "");
    let buf = "";
    for (const p of paras) {
      if (p.length > maxLen) {
        if (buf) {
          push(buf);
          buf = "";
        }
        for (let i = 0; i < p.length && chunks.length < MAX_CHUNKS_PER_FILE; i += maxLen) push(p.slice(i, i + maxLen));
        continue;
      }
      if (buf.length + p.length + 1 <= maxLen) {
        buf += (buf ? "\n" : "") + p;
      } else {
        push(buf);
        buf = p;
      }
    }
    push(buf);
  }
  if (chunks.length === 0) {
    const whole = text.trim();
    if (whole) chunks.push(whole.length > maxLen ? whole.slice(0, maxLen) : whole);
  }
  return chunks;
}

// .build-tools/tmp-src/embedder.js
var Q_PREFIX = "query: ";
var D_PREFIX = "passage: ";
var E5Embedder = class {
  dim = 384;
  ready;
  extractor = null;
  constructor(cacheDir) {
    this.ready = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = cacheDir;
      const ex = await pipeline("feature-extraction", "Xenova/multilingual-e5-small", {
        dtype: "q8"
      });
      this.extractor = ex;
    })().catch((err) => {
      this.loadError = err instanceof Error ? err.message : String(err);
      throw err;
    });
  }
  loadError = null;
  get error() {
    return this.loadError;
  }
  async embed(texts, isQuery = false) {
    if (this.extractor === null) throw new Error(this.loadError ?? "embedding \u6A21\u578B\u672A\u5C31\u7EEA");
    const out = [];
    for (const t of texts) {
      const r = await this.extractor((isQuery ? Q_PREFIX : D_PREFIX) + t, {
        pooling: "mean",
        normalize: true
      });
      out.push(Array.from(r.data));
    }
    return out;
  }
};

// .build-tools/tmp-src/store.js
import { ZVecCreateAndOpen, ZVecOpen, ZVecCollectionSchema, ZVecDataType, ZVecIndexType, ZVecGetDefaultJiebaDictDir } from "@zvec/zvec";
var SCHEMA_VERSION = 2;
function buildFilter(f) {
  const parts = [];
  const q = (v) => v.replace(/["\\]/g, "");
  if (f.author) parts.push(`author = "${q(f.author)}"`);
  if (f.stage) parts.push(`stage = "${q(f.stage)}"`);
  if (f.tag) parts.push(`tag = "${q(f.tag)}"`);
  if (f.src) parts.push(`src = "${q(f.src)}"`);
  if (f.likesMin !== void 0 && Number.isFinite(f.likesMin)) parts.push(`likes >= ${Math.floor(f.likesMin)}`);
  return parts.length === 0 ? void 0 : parts.join(" AND ");
}
var KbStore = class {
  dir;
  dim;
  col = null;
  openError = null;
  constructor(dir, dim) {
    this.dir = dir;
    this.dim = dim;
  }
  /** 打开(或首次创建)collection;失败记录错误,后续调用返回空结果而不是抛。 */
  open() {
    const schema = new ZVecCollectionSchema({
      name: "kbchunks",
      vectors: {
        name: "emb",
        dataType: ZVecDataType.VECTOR_FP32,
        dimension: this.dim
      },
      fields: [
        {
          name: "text",
          dataType: ZVecDataType.STRING,
          indexParams: {
            indexType: ZVecIndexType.FTS,
            tokenizerName: "jieba",
            extraParams: JSON.stringify({
              jieba_dict_dir: ZVecGetDefaultJiebaDictDir()
            })
          }
        },
        {
          name: "file",
          dataType: ZVecDataType.STRING
        },
        {
          name: "chunk",
          dataType: ZVecDataType.INT64
        },
        // frontmatter 标量(schema v2):过滤与展示用;空值用默认占位,永不匹配正向过滤
        {
          name: "author",
          dataType: ZVecDataType.STRING
        },
        {
          name: "stage",
          dataType: ZVecDataType.STRING
        },
        {
          name: "tag",
          dataType: ZVecDataType.STRING
        },
        {
          name: "src",
          dataType: ZVecDataType.STRING
        },
        {
          name: "date",
          dataType: ZVecDataType.STRING
        },
        {
          name: "type",
          dataType: ZVecDataType.STRING
        },
        {
          name: "likes",
          dataType: ZVecDataType.INT64
        }
      ]
    });
    try {
      this.col = ZVecCreateAndOpen(this.dir, schema);
    } catch {
      try {
        this.col = ZVecOpen(this.dir);
      } catch (err) {
        this.openError = err instanceof Error ? err.message : String(err);
        this.col = null;
      }
    }
  }
  get error() {
    return this.openError;
  }
  get ok() {
    return this.col !== null;
  }
  insert(fileId, texts, vectors, scalars) {
    if (this.col === null) throw new Error(this.openError ?? "store \u672A\u6253\u5F00");
    const sc = scalars ?? {};
    const docs = texts.map((text, i) => ({
      // zvec 文档 id 不允许 ':',用 '#' 分隔
      id: `${fileId}#${i}`,
      vectors: {
        emb: vectors[i]
      },
      fields: {
        text,
        file: fileId,
        chunk: i,
        author: sc.author ?? "",
        stage: sc.stage ?? "",
        tag: sc.tag ?? "",
        src: sc.src ?? "",
        date: sc.date ?? "",
        type: sc.type ?? "",
        likes: sc.likes ?? 0
      }
    }));
    for (let i = 0; i < docs.length; i += 1024) this.col.insertSync(docs.slice(i, i + 1024));
  }
  deleteFile(fileId) {
    if (this.col === null) throw new Error(this.openError ?? "store \u672A\u6253\u5F00");
    this.col.deleteByFilterSync(`file = "${fileId}"`);
  }
  /**
  * 手动 RRF 混合检索:向量腿 + FTS 腿各自取 topk*2,按排名融合(0.75/0.25)。
  * 不用 zvec weighted 融合——余弦(0.7~0.9)与 BM25 原始分(1~15)尺度悬殊,
  * 直接加权会让 FTS 的弱词法匹配压过向量排序(真模型 E2E 实证);RRF 只看排名,天然免疫尺度差。
  */
  /** 手动 RRF 混合检索:向量腿 + FTS 腿各自取 topk*2,按排名融合(0.75/0.25)。
  *  不用 zvec weighted 融合——余弦(0.7~0.9)与 BM25 原始分(1~15)尺度悬殊,
  *  直接加权会让 FTS 的弱词法匹配压过向量排序(真模型 E2E 实证);RRF 只看排名,天然免疫尺度差。
  *  filter:标量预过滤(author/stage/tag/src/likes),两腿同滤。 */
  search(queryVec, query, topk, filter) {
    if (this.col === null) return [];
    const mapRow = (r) => ({
      file: String(r.fields.file ?? ""),
      chunk: Number(r.fields.chunk ?? 0),
      score: Number(r.score ?? 0),
      text: String(r.fields.text ?? "")
    });
    const fetch2 = Math.max(topk * 2, 10);
    const filterOpts = filter !== void 0 && filter !== "" ? {
      filter
    } : {};
    const vecRows = queryVec === null ? [] : this.col.querySync({
      fieldName: "emb",
      vector: queryVec,
      topk: fetch2,
      ...filterOpts
    }).map(mapRow);
    let ftsRows = [];
    const ftsQuery = query.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
    if (ftsQuery !== "") {
      try {
        ftsRows = this.col.querySync({
          fieldName: "text",
          fts: {
            queryString: ftsQuery
          },
          topk: fetch2,
          ...filterOpts
        }).map(mapRow);
      } catch {
      }
    }
    const W_VEC = 0.75;
    const W_FTS = 0.25;
    const K = 60;
    const merged = /* @__PURE__ */ new Map();
    const add = (rows, w) => {
      rows.forEach((r, i) => {
        const key = `${r.file}#${r.chunk}`;
        const cur = merged.get(key);
        const contrib = w / (K + i + 1);
        if (cur === void 0) merged.set(key, {
          hit: r,
          rrf: contrib
        });
        else cur.rrf += contrib;
      });
    };
    add(vecRows, W_VEC);
    add(ftsRows, W_FTS);
    return [
      ...merged.values()
    ].sort((a, b) => b.rrf - a.rrf).slice(0, topk).map((m) => ({
      ...m.hit,
      score: m.rrf
    }));
  }
  close() {
    if (this.col !== null) {
      try {
        this.col.closeSync();
      } catch {
      }
      this.col = null;
    }
  }
};

// .build-tools/tmp-src/extract.js
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extname } from "node:path";

// .build-tools/tmp-src/frontmatter.js
function parseFrontmatter(raw) {
  if (!raw.startsWith("---")) return {
    meta: {},
    body: raw
  };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return {
    meta: {},
    body: raw
  };
  const fmBlock = raw.slice(3, end);
  const bodyStart = raw.indexOf("\n", end + 1);
  const body = bodyStart === -1 ? "" : raw.slice(bodyStart + 1);
  const meta = {};
  for (const line of fmBlock.split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const k = line.slice(0, i).trim().toLowerCase();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (v === "") continue;
    if (k === "author") meta.author = v;
    else if (k === "stage") meta.stage = v;
    else if (k === "tags" || k === "tag") meta.tag = v;
    else if (k === "source") meta.src = v;
    else if (k === "date" || k === "collected") meta.date = v;
    else if (k === "type") meta.type = v;
    else if (k === "likes") {
      const n = parseInt(v, 10);
      if (Number.isFinite(n)) meta.likes = n;
    }
  }
  return {
    meta,
    body
  };
}

// .build-tools/tmp-src/extract.js
var TEXT_EXTS = /* @__PURE__ */ new Set([
  ".md",
  ".markdown",
  ".txt",
  ".log",
  ".csv",
  ".json",
  ".yaml",
  ".yml",
  ".xml",
  ".html",
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".c",
  ".h",
  ".cpp",
  ".sh"
]);
var PDF_EXTS = /* @__PURE__ */ new Set([
  ".pdf"
]);
var DOCX_EXTS = /* @__PURE__ */ new Set([
  ".docx"
]);
var SUPPORTED_EXTS = /* @__PURE__ */ new Set([
  ...TEXT_EXTS,
  ...PDF_EXTS,
  ...DOCX_EXTS
]);
var MAX_FILE_BYTES = 8 * 1024 * 1024;
function htmlToText(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<(nav|footer|header|aside|noscript)[\s\S]*?<\/\1>/gi, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote|pre)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#(\d+);/g, (_m, d) => {
    try {
      return String.fromCodePoint(Number(d));
    } catch {
      return "";
    }
  }).replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
async function extractText(path) {
  const ext = extname(path).toLowerCase();
  let rawHash;
  try {
    rawHash = createHash("sha256").update(await readFile(path)).digest("hex").slice(0, 16);
    if (TEXT_EXTS.has(ext)) {
      const raw = await readFile(path, "utf8");
      const { meta, body } = parseFrontmatter(raw);
      const text = body.replace(/\u0000/g, "").trim() || null;
      return {
        text,
        rawHash,
        meta,
        reason: text === null ? "\u7A7A\u6587\u4EF6" : void 0
      };
    }
    if (PDF_EXTS.has(ext)) {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const doc = await pdfjs.getDocument({
        data: new Uint8Array(await readFile(path)),
        useSystemFonts: true
      }).promise;
      const parts = [];
      const pages = Math.min(doc.numPages, 500);
      for (let i = 1; i <= pages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        parts.push(content.items.map((it) => "str" in it ? it.str : "").join(" "));
      }
      const text = parts.join("\n\n").replace(/\u0000/g, "").trim();
      return text ? {
        text,
        rawHash
      } : {
        text: null,
        reason: "PDF \u65E0\u53EF\u62BD\u53D6\u6587\u672C(\u53EF\u80FD\u4E3A\u626B\u63CF\u4EF6)"
      };
    }
    if (DOCX_EXTS.has(ext)) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({
        path
      });
      return {
        text: value.trim() || null,
        rawHash,
        reason: "\u7A7A\u6587\u6863"
      };
    }
    return {
      text: null,
      reason: `\u4E0D\u652F\u6301\u7684\u6269\u5C55\u540D ${ext}`
    };
  } catch (err) {
    return {
      text: null,
      reason: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200)
    };
  }
}

// .build-tools/tmp-src/watch.js
import { watch } from "node:fs";
import { mkdir, readFile as readFile2, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
var normKey = (p) => p.replace(/[\\/]+/g, "/").replace(/\/$/, "").toLowerCase();
var WorkspaceManager = class {
  homeDir;
  trigger;
  debounceMs;
  scanMs;
  workspaces = /* @__PURE__ */ new Map();
  watchers = /* @__PURE__ */ new Map();
  timers = /* @__PURE__ */ new Map();
  debounces = /* @__PURE__ */ new Map();
  loaded = false;
  constructor(homeDir, trigger, debounceMs = 4e3, scanMs = 5 * 60 * 1e3) {
    this.homeDir = homeDir;
    this.trigger = trigger;
    this.debounceMs = debounceMs;
    this.scanMs = scanMs;
  }
  async load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = JSON.parse(await readFile2(join(this.homeDir, "workspaces.json"), "utf8"));
      for (const w of raw.workspaces ?? []) this.workspaces.set(normKey(w.path), w);
    } catch {
    }
  }
  async persist() {
    await mkdir(this.homeDir, {
      recursive: true
    });
    await writeFile(join(this.homeDir, "workspaces.json"), JSON.stringify({
      version: 1,
      workspaces: [
        ...this.workspaces.values()
      ]
    }, null, 2), "utf8");
  }
  list() {
    return [
      ...this.workspaces.values()
    ].sort((a, b) => a.addedAt - b.addedAt);
  }
  async add(path, label) {
    const resolved = path.trim().replace(/^~(?=$|[/\\])/, "").length >= 0 ? path : path;
    let st;
    try {
      st = await stat(resolved);
    } catch {
      return {
        ok: false,
        error: `\u76EE\u5F55\u4E0D\u5B58\u5728:${resolved}`
      };
    }
    if (!st.isDirectory()) return {
      ok: false,
      error: `\u4E0D\u662F\u76EE\u5F55:${resolved}`
    };
    await this.load();
    const key = normKey(resolved);
    this.workspaces.set(key, {
      path: resolved,
      label: label?.trim() || resolved.split(/[\\/]/).pop() || resolved,
      addedAt: this.workspaces.get(key)?.addedAt ?? Date.now()
    });
    await this.persist();
    this.startWatching(key);
    await this.trigger(resolved).catch(() => {
    });
    return {
      ok: true
    };
  }
  async remove(path) {
    await this.load();
    const key = normKey(path);
    const existed = this.workspaces.delete(key);
    if (!existed) return false;
    this.stopWatching(key);
    await this.persist();
    return true;
  }
  startAll() {
    void this.load().then(() => {
      for (const key of this.workspaces.keys()) this.startWatching(key);
    });
  }
  stopAll() {
    for (const key of [
      ...this.watchers.keys()
    ]) this.stopWatching(key);
  }
  startWatching(key) {
    if (this.watchers.has(key)) return;
    const entry = this.workspaces.get(key);
    if (entry === void 0) return;
    try {
      const w = watch(entry.path, {
        recursive: true
      }, () => this.schedule(key));
      try {
        w.unref?.();
      } catch {
      }
      this.watchers.set(key, w);
    } catch {
    }
    const t = setInterval(() => this.schedule(key), this.scanMs);
    try {
      t.unref?.();
    } catch {
    }
    this.timers.set(key, t);
  }
  stopWatching(key) {
    this.watchers.get(key)?.close();
    this.watchers.delete(key);
    const t = this.timers.get(key);
    if (t !== void 0) clearInterval(t);
    this.timers.delete(key);
    const d = this.debounces.get(key);
    if (d !== void 0) clearTimeout(d);
    this.debounces.delete(key);
  }
  /** 事件防抖:静默 debounceMs 后触发一次增量导入。 */
  schedule(key) {
    const prev = this.debounces.get(key);
    if (prev !== void 0) clearTimeout(prev);
    const t = setTimeout(() => {
      this.debounces.delete(key);
      const entry = this.workspaces.get(key);
      if (entry === void 0) return;
      void this.trigger(entry.path).catch(() => {
      });
    }, this.debounceMs);
    try {
      t.unref?.();
    } catch {
    }
    this.debounces.set(key, t);
  }
};

// .build-tools/tmp-src/schedule.js
import { mkdir as mkdir2, readFile as readFile3, writeFile as writeFile2 } from "node:fs/promises";
import { join as join2 } from "node:path";
var normKey2 = (n) => n.trim().toLowerCase();
var AT_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
var ScheduleManager = class {
  homeDir;
  execute;
  entries = /* @__PURE__ */ new Map();
  timers = /* @__PURE__ */ new Map();
  loaded = false;
  constructor(homeDir, execute) {
    this.homeDir = homeDir;
    this.execute = execute;
  }
  async load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = JSON.parse(await readFile3(join2(this.homeDir, "schedules.json"), "utf8"));
      for (const e of raw.schedules ?? []) this.entries.set(normKey2(e.name), e);
    } catch {
    }
  }
  async persist() {
    await mkdir2(this.homeDir, {
      recursive: true
    });
    await writeFile2(join2(this.homeDir, "schedules.json"), JSON.stringify({
      version: 1,
      schedules: [
        ...this.entries.values()
      ]
    }, null, 2), "utf8");
  }
  list() {
    return [
      ...this.entries.values()
    ].sort((a, b) => a.createdAt - b.createdAt);
  }
  async set(entry) {
    await this.load();
    const name = String(entry.name ?? "").trim();
    if (name.length < 2 || name.length > 60) return {
      ok: false,
      error: "name \u9700 2-60 \u5B57\u7B26"
    };
    const kind = entry.kind === "daily" ? "daily" : "interval";
    let everyMin;
    let at;
    if (kind === "interval") {
      everyMin = Math.floor(Number(entry.everyMin));
      if (!Number.isFinite(everyMin) || everyMin < 1 || everyMin > 60 * 24 * 7) return {
        ok: false,
        error: "everyMin \u9700 1-10080 \u5206\u949F"
      };
    } else {
      at = String(entry.at ?? "").trim();
      if (!AT_RE.test(at)) return {
        ok: false,
        error: "at \u9700 HH:MM \u683C\u5F0F(24 \u5C0F\u65F6\u5236)"
      };
    }
    const action = entry.action === void 0 ? "scan" : String(entry.action);
    if (action !== "scan") return {
      ok: false,
      error: `\u6682\u4E0D\u652F\u6301\u7684\u52A8\u4F5C:${action}(v0.2 \u6269\u5C55 briefing/export)`
    };
    const prev = this.entries.get(normKey2(name));
    const next = {
      name,
      kind,
      everyMin,
      at,
      action: "scan",
      enabled: entry.enabled === void 0 ? prev?.enabled ?? true : Boolean(entry.enabled),
      createdAt: prev?.createdAt ?? Date.now(),
      lastRunAt: prev?.lastRunAt
    };
    this.entries.set(normKey2(name), next);
    await this.persist();
    this.startTimer(next);
    return {
      ok: true
    };
  }
  async remove(name) {
    await this.load();
    const key = normKey2(name);
    const t = this.timers.get(key);
    if (t !== void 0) {
      clearTimeout(t);
      this.timers.delete(key);
    }
    const ok = this.entries.delete(key);
    if (ok) await this.persist();
    return ok;
  }
  async setEnabled(name, enabled) {
    await this.load();
    const e = this.entries.get(normKey2(name));
    if (e === void 0) return {
      ok: false,
      error: `\u4E0D\u5B58\u5728:${name}`
    };
    e.enabled = enabled;
    await this.persist();
    if (enabled) this.startTimer(e);
    else {
      const t = this.timers.get(normKey2(name));
      if (t !== void 0) {
        clearTimeout(t);
        this.timers.delete(normKey2(name));
      }
    }
    return {
      ok: true
    };
  }
  startAll() {
    void this.load().then(() => {
      for (const e of this.entries.values()) if (e.enabled) this.startTimer(e);
    });
  }
  stopAll() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
  /** 到点执行并排下一次;interval 用自校准 setTimeout(防漂移),daily 算到明天的 HH:MM。 */
  startTimer(e) {
    const key = normKey2(e.name);
    const prev = this.timers.get(key);
    if (prev !== void 0) clearTimeout(prev);
    const delayMs = e.kind === "interval" ? Math.max(1, e.everyMin ?? 60) * 6e4 : this.msUntilTodayOrTomorrow(e.at ?? "09:00");
    const t = setTimeout(() => {
      void (async () => {
        const cur = this.entries.get(key);
        if (cur === void 0 || !cur.enabled) return;
        cur.lastRunAt = Date.now();
        await this.persist().catch(() => {
        });
        try {
          await this.execute(cur);
        } catch {
        }
        this.startTimer(cur);
      })();
    }, delayMs);
    try {
      t.unref?.();
    } catch {
    }
    this.timers.set(key, t);
  }
  msUntilTodayOrTomorrow(at) {
    const m = at.match(AT_RE);
    if (m === null) return 60 * 6e4;
    const now = /* @__PURE__ */ new Date();
    const target = new Date(now);
    target.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
    return target.getTime() - now.getTime();
  }
};

// .build-tools/tmp-src/index.js
function _apply_decs_2203_r(targetClass, memberDecs, classDecs, parentClass) {
  function createAddInitializerMethod(initializers, decoratorFinishedRef) {
    return function addInitializer(initializer) {
      assertNotFinished(decoratorFinishedRef, "addInitializer");
      assertCallable(initializer, "An initializer");
      initializers.push(initializer);
    };
  }
  function memberDec(dec, name, desc, initializers, kind, isStatic, isPrivate, metadata, value) {
    var kindStr;
    switch (kind) {
      case 1:
        kindStr = "accessor";
        break;
      case 2:
        kindStr = "method";
        break;
      case 3:
        kindStr = "getter";
        break;
      case 4:
        kindStr = "setter";
        break;
      default:
        kindStr = "field";
    }
    var ctx = {
      kind: kindStr,
      name: isPrivate ? "#" + name : name,
      static: isStatic,
      private: isPrivate,
      metadata
    };
    var decoratorFinishedRef = {
      v: false
    };
    ctx.addInitializer = createAddInitializerMethod(initializers, decoratorFinishedRef);
    var get, set;
    if (kind === 0) {
      if (isPrivate) {
        get = desc.get;
        set = desc.set;
      } else {
        get = function() {
          return this[name];
        };
        set = function(v) {
          this[name] = v;
        };
      }
    } else if (kind === 2) {
      get = function() {
        return desc.value;
      };
    } else {
      if (kind === 1 || kind === 3) {
        get = function() {
          return desc.get.call(this);
        };
      }
      if (kind === 1 || kind === 4) {
        set = function(v) {
          desc.set.call(this, v);
        };
      }
    }
    if (get) {
      var originalGet = get;
      get = function(target) {
        if (arguments.length === 0) {
          target = this;
        }
        return originalGet.call(target);
      };
    }
    if (set) {
      var originalSet = set;
      set = function(target, value2) {
        if (arguments.length === 1) {
          value2 = target;
          target = this;
        }
        return originalSet.call(target, value2);
      };
    }
    if (isPrivate) {
      ctx.access = get && set ? {
        get,
        set
      } : get ? {
        get
      } : {
        set
      };
    } else {
      var has = function(target) {
        return name in target;
      };
      ctx.access = get && set ? {
        has,
        get,
        set
      } : get ? {
        has,
        get
      } : {
        has,
        set
      };
    }
    var newValue = dec(value, ctx);
    decoratorFinishedRef.v = true;
    return newValue;
  }
  function assertNotFinished(decoratorFinishedRef, fnName) {
    if (decoratorFinishedRef.v) {
      throw new Error("attempted to call " + fnName + " after decoration was finished");
    }
  }
  function assertCallable(fn, hint) {
    if (typeof fn !== "function") {
      throw new TypeError(hint + " must be a function");
    }
  }
  function assertValidReturnValue(kind, value) {
    var type = typeof value;
    if (kind === 1) {
      if (type !== "object" || value === null) {
        throw new TypeError("accessor decorators must return an object with get, set, or init properties or void 0");
      }
      if (value.get !== void 0) {
        assertCallable(value.get, "accessor.get");
      }
      if (value.set !== void 0) {
        assertCallable(value.set, "accessor.set");
      }
      if (value.init !== void 0) {
        assertCallable(value.init, "accessor.init");
      }
    } else if (type !== "function") {
      var hint;
      if (kind === 0) {
        hint = "field";
      } else if (kind === 10) {
        hint = "class";
      } else {
        hint = "method";
      }
      throw new TypeError(hint + " decorators must return a function or void 0");
    }
  }
  function applyMemberDec(ret, base, decInfo, name, kind, isStatic, isPrivate, initializers, metadata) {
    var decs = decInfo[0];
    var desc, init, value;
    if (isPrivate) {
      if (kind === 0 || kind === 1) {
        desc = {
          get: decInfo[3],
          set: decInfo[4]
        };
      } else if (kind === 3) {
        desc = {
          get: decInfo[3]
        };
      } else if (kind === 4) {
        desc = {
          set: decInfo[3]
        };
      } else {
        desc = {
          value: decInfo[3]
        };
      }
    } else if (kind !== 0) {
      desc = Object.getOwnPropertyDescriptor(base, name);
    }
    if (kind === 1) {
      value = {
        get: desc.get,
        set: desc.set
      };
    } else if (kind === 2) {
      value = desc.value;
    } else if (kind === 3) {
      value = desc.get;
    } else if (kind === 4) {
      value = desc.set;
    }
    var newValue, get, set;
    if (typeof decs === "function") {
      newValue = memberDec(decs, name, desc, initializers, kind, isStatic, isPrivate, metadata, value);
      if (newValue !== void 0) {
        assertValidReturnValue(kind, newValue);
        if (kind === 0) {
          init = newValue;
        } else if (kind === 1) {
          init = newValue.init;
          get = newValue.get || value.get;
          set = newValue.set || value.set;
          value = {
            get,
            set
          };
        } else {
          value = newValue;
        }
      }
    } else {
      for (var i = decs.length - 1; i >= 0; i--) {
        var dec = decs[i];
        newValue = memberDec(dec, name, desc, initializers, kind, isStatic, isPrivate, metadata, value);
        if (newValue !== void 0) {
          assertValidReturnValue(kind, newValue);
          var newInit;
          if (kind === 0) {
            newInit = newValue;
          } else if (kind === 1) {
            newInit = newValue.init;
            get = newValue.get || value.get;
            set = newValue.set || value.set;
            value = {
              get,
              set
            };
          } else {
            value = newValue;
          }
          if (newInit !== void 0) {
            if (init === void 0) {
              init = newInit;
            } else if (typeof init === "function") {
              init = [
                init,
                newInit
              ];
            } else {
              init.push(newInit);
            }
          }
        }
      }
    }
    if (kind === 0 || kind === 1) {
      if (init === void 0) {
        init = function(instance, init2) {
          return init2;
        };
      } else if (typeof init !== "function") {
        var ownInitializers = init;
        init = function(instance, init2) {
          var value2 = init2;
          for (var i2 = 0; i2 < ownInitializers.length; i2++) value2 = ownInitializers[i2].call(instance, value2);
          return value2;
        };
      } else {
        var originalInitializer = init;
        init = function(instance, init2) {
          return originalInitializer.call(instance, init2);
        };
      }
      ret.push(init);
    }
    if (kind !== 0) {
      if (kind === 1) {
        desc.get = value.get;
        desc.set = value.set;
      } else if (kind === 2) {
        desc.value = value;
      } else if (kind === 3) {
        desc.get = value;
      } else if (kind === 4) {
        desc.set = value;
      }
      if (isPrivate) {
        if (kind === 1) {
          ret.push(function(instance, args) {
            return value.get.call(instance, args);
          });
          ret.push(function(instance, args) {
            return value.set.call(instance, args);
          });
        } else if (kind === 2) {
          ret.push(value);
        } else {
          ret.push(function(instance, args) {
            return value.call(instance, args);
          });
        }
      } else {
        Object.defineProperty(base, name, desc);
      }
    }
  }
  function applyMemberDecs(Class, decInfos, metadata) {
    var ret = [];
    var protoInitializers;
    var staticInitializers;
    var existingProtoNonFields = /* @__PURE__ */ new Map();
    var existingStaticNonFields = /* @__PURE__ */ new Map();
    for (var i = 0; i < decInfos.length; i++) {
      var decInfo = decInfos[i];
      if (!Array.isArray(decInfo)) continue;
      var kind = decInfo[1];
      var name = decInfo[2];
      var isPrivate = decInfo.length > 3;
      var isStatic = kind >= 5;
      var base;
      var initializers;
      if (isStatic) {
        base = Class;
        kind = kind - 5;
        staticInitializers = staticInitializers || [];
        initializers = staticInitializers;
      } else {
        base = Class.prototype;
        protoInitializers = protoInitializers || [];
        initializers = protoInitializers;
      }
      if (kind !== 0 && !isPrivate) {
        var existingNonFields = isStatic ? existingStaticNonFields : existingProtoNonFields;
        var existingKind = existingNonFields.get(name) || 0;
        if (existingKind === true || existingKind === 3 && kind !== 4 || existingKind === 4 && kind !== 3) {
          throw new Error("Attempted to decorate a public method/accessor that has the same name as a previously decorated public method/accessor. This is not currently supported by the decorators plugin. Property name was: " + name);
        } else if (!existingKind && kind > 2) {
          existingNonFields.set(name, kind);
        } else {
          existingNonFields.set(name, true);
        }
      }
      applyMemberDec(ret, base, decInfo, name, kind, isStatic, isPrivate, initializers, metadata);
    }
    pushInitializers(ret, protoInitializers);
    pushInitializers(ret, staticInitializers);
    return ret;
  }
  function pushInitializers(ret, initializers) {
    if (initializers) {
      ret.push(function(instance) {
        for (var i = 0; i < initializers.length; i++) initializers[i].call(instance);
        return instance;
      });
    }
  }
  function applyClassDecs(targetClass2, classDecs2, metadata) {
    if (classDecs2.length > 0) {
      var initializers = [];
      var newClass = targetClass2;
      var name = targetClass2.name;
      for (var i = classDecs2.length - 1; i >= 0; i--) {
        var decoratorFinishedRef = {
          v: false
        };
        var nextNewClass = classDecs2[i](newClass, {
          kind: "class",
          name,
          addInitializer: createAddInitializerMethod(initializers, decoratorFinishedRef),
          metadata
        });
        decoratorFinishedRef.v = true;
        if (nextNewClass !== void 0) {
          assertValidReturnValue(10, nextNewClass);
          newClass = nextNewClass;
        }
      }
      return [
        defineMetadata(newClass, metadata),
        function() {
          for (var i2 = 0; i2 < initializers.length; i2++) initializers[i2].call(newClass);
        }
      ];
    }
  }
  function defineMetadata(Class, metadata) {
    return Object.defineProperty(Class, Symbol.metadata || /* @__PURE__ */ Symbol.for("Symbol.metadata"), {
      configurable: true,
      enumerable: true,
      value: metadata
    });
  }
  _apply_decs_2203_r = function(targetClass2, memberDecs2, classDecs2, parentClass2) {
    if (parentClass2 !== void 0) {
      var parentMetadata = parentClass2[Symbol.metadata || /* @__PURE__ */ Symbol.for("Symbol.metadata")];
    }
    var metadata = Object.create(parentMetadata === void 0 ? null : parentMetadata);
    var e = applyMemberDecs(targetClass2, memberDecs2, metadata);
    if (!classDecs2.length) defineMetadata(targetClass2, metadata);
    return {
      e,
      get c() {
        return applyClassDecs(targetClass2, classDecs2, metadata);
      }
    };
  };
  return _apply_decs_2203_r(targetClass, memberDecs, classDecs, parentClass);
}
var _computedKey;
var _dec;
var _dec1;
var _dec2;
var _dec3;
var _dec4;
var _dec5;
var _dec6;
var _dec7;
var _dec8;
var _dec9;
var _dec10;
var _dec11;
var _dec12;
var _dec13;
var _dec14;
var _dec15;
var _dec16;
var _dec17;
var _initProto;
var SKIP_DIRS = /* @__PURE__ */ new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  ".venv",
  "venv",
  "__pycache__",
  ".idea",
  ".vscode",
  ".cache",
  ".obsidian",
  ".trash"
]);
var MAX_FILES_PER_IMPORT = 2e4;
var SNIPPET = 300;
var normKey3 = (p) => resolve(p).split(sep).join("/").toLowerCase();
var regKey = (kind, s) => kind === "fs" ? normKey3(s) : `${kind}:${s.trim().toLowerCase()}`;
var DEMO_NOTE_TITLE = "\u793A\u4F8B\xB7\u5458\u5DE5\u624B\u518C(\u6F14\u793A)";
var DEMO_NOTE_TEXT = `# \u5458\u5DE5\u624B\u518C(\u6F14\u793A\u6837\u4F8B)

## \u7F51\u7EDC\u4E0E\u8BBE\u5907

\u8FDE\u63A5\u516C\u53F8\u5185\u7F51\u540E,\u82E5\u95E8\u6237\u7CFB\u7EDF\u5728 30 \u79D2\u5185\u6CA1\u6709\u4EFB\u4F55\u54CD\u5E94,\u4F1A\u8BDD\u5C06\u88AB\u4E3B\u52A8\u4E2D\u65AD\u5E76\u91CA\u653E\u8D44\u6E90\u3002\u8BE5\u9608\u503C\u53EF\u5728\u9AD8\u7EA7\u8BBE\u7F6E\u7684\u4F1A\u8BDD\u9875\u7B7E\u4E2D\u8C03\u6574,\u9ED8\u8BA4\u503C\u5EFA\u8BAE\u4FDD\u6301\u4E0D\u53D8\u3002

## \u5DEE\u65C5\u62A5\u9500

\u51FA\u5DEE\u8FD4\u56DE\u540E\u4E03\u65E5\u5185\u53EF\u5728\u7CFB\u7EDF\u63D0\u4EA4\u62A5\u9500\u5355,\u7968\u636E\u626B\u63CF\u4E0A\u4F20,\u6B3E\u9879\u4E09\u4E2A\u5DE5\u4F5C\u65E5\u5185\u6253\u56DE\u5DE5\u8D44\u5361\u3002\u8DE8\u5E74\u5EA6\u7968\u636E\u4E0D\u4E88\u53D7\u7406\u3002

## \u8D26\u53F7\u6743\u9650

\u65B0\u5165\u804C\u5458\u5DE5\u7531\u76F4\u5C5E\u4E3B\u7BA1\u5728\u7BA1\u7406\u540E\u53F0\u63D0\u4EA4\u8D26\u53F7\u7533\u8BF7,\u7ECF\u90E8\u95E8\u8D1F\u8D23\u4EBA\u5BA1\u6279\u540E,\u7531\u7CFB\u7EDF\u7BA1\u7406\u5458\u5B8C\u6210\u89D2\u8272\u7ED1\u5B9A,\u5168\u7A0B\u65E0\u9700\u7EBF\u4E0B\u5355\u636E\u3002

(\u8FD9\u662F dsh-intelhub \u7684\u6F14\u793A\u6587\u6863,\u53EF\u5728\u6587\u4EF6\u5217\u8868\u4E2D\u5220\u9664)`;
_computedKey = Service.init, _dec = Remote("status"), _dec1 = Remote("list"), _dec2 = Remote("import"), _dec3 = Remote("remove"), _dec4 = Remote("search"), _dec5 = Remote("url-import"), _dec6 = Remote("note"), _dec7 = Remote("upload"), _dec8 = Remote("demo"), _dec9 = Remote("workspace-add"), _dec10 = Remote("workspace-remove"), _dec11 = Remote("workspace-list"), _dec12 = Remote("dashboard"), _dec13 = Remote("today"), _dec14 = Remote("schedule-list"), _dec15 = Remote("schedule-set"), _dec16 = Remote("schedule-remove"), _dec17 = Remote("schedule-toggle");
var ZvecKbService = class extends TypertRemoteService {
  static {
    ({ e: [_initProto] } = _apply_decs_2203_r(this, [
      [
        _dec,
        2,
        "rpcStatus"
      ],
      [
        _dec1,
        2,
        "rpcList"
      ],
      [
        _dec2,
        2,
        "rpcImport"
      ],
      [
        _dec3,
        2,
        "rpcRemove"
      ],
      [
        _dec4,
        2,
        "rpcSearch"
      ],
      [
        _dec5,
        2,
        "rpcUrlImport"
      ],
      [
        _dec6,
        2,
        "rpcNote"
      ],
      [
        _dec7,
        2,
        "rpcUpload"
      ],
      [
        _dec8,
        2,
        "rpcDemo"
      ],
      [
        _dec9,
        2,
        "rpcWorkspaceAdd"
      ],
      [
        _dec10,
        2,
        "rpcWorkspaceRemove"
      ],
      [
        _dec11,
        2,
        "rpcWorkspaceList"
      ],
      [
        _dec12,
        2,
        "rpcDashboard"
      ],
      [
        _dec13,
        2,
        "rpcToday"
      ],
      [
        _dec14,
        2,
        "rpcScheduleList"
      ],
      [
        _dec15,
        2,
        "rpcScheduleSet"
      ],
      [
        _dec16,
        2,
        "rpcScheduleRemove"
      ],
      [
        _dec17,
        2,
        "rpcScheduleToggle"
      ]
    ], []));
  }
  static inject = [
    "tools",
    "systemPrompt"
  ];
  homeDir;
  recoveryNote = (_initProto(this), null);
  pendingRawHash = void 0;
  pendingMeta = void 0;
  pendingSrc = void 0;
  workspaceMgr;
  scheduleMgr;
  embedder = null;
  store = null;
  registry = /* @__PURE__ */ new Map();
  registryLoaded = false;
  queueTail = Promise.resolve();
  queuedFiles = 0;
  promptText = "\u672C\u5730\u77E5\u8BC6\u5E93(dsh-intelhub):\u8FD8\u6CA1\u6709\u5DF2\u5BFC\u5165\u7684\u6587\u6863\u3002\u7528\u6237\u7ED9\u8DEF\u5F84\u65F6\u53EF\u8C03 kb_import \u5BFC\u5165(\u652F\u6301\u6574\u4E2A\u6587\u4EF6\u5939)\u3002";
  constructor(ctx) {
    super(ctx, "intelhub");
    this.homeDir = process.env.DSH_INTELHUB_HOME ?? join3(homedir(), ".dsh", "dsh-intelhub");
    this.workspaceMgr = new WorkspaceManager(this.homeDir, async (p) => {
      const r = await this.importPath(p);
      if (r.queued > 0) this.refreshPrompt();
      return r;
    });
    this.scheduleMgr = new ScheduleManager(this.homeDir, async (entry) => {
      for (const w of this.workspaceMgr.list()) await this.importPath(w.path);
    });
  }
  /** 测试注入点:子类覆盖以替换向量器。 */
  createEmbedder() {
    void mkdir3(join3(this.homeDir, "hf-cache"), {
      recursive: true
    });
    return new E5Embedder(join3(this.homeDir, "hf-cache"));
  }
  // ── 生命周期:工具 + systemPrompt ─────────────────────────
  async [_computedKey]() {
    await this.loadRegistry();
    this.registerTools();
    this.ctx.systemPrompt.section({
      name: "intelhub",
      order: 160,
      text: () => this.promptText
    });
    this.refreshPrompt();
    this.workspaceMgr.startAll();
    this.scheduleMgr.startAll();
  }
  refreshPrompt() {
    const done = [
      ...this.registry.values()
    ].filter((f) => f.status === "done");
    if (done.length === 0) {
      this.promptText = "\u672C\u5730\u77E5\u8BC6\u5E93(dsh-intelhub):\u8FD8\u6CA1\u6709\u5DF2\u5BFC\u5165\u7684\u6587\u6863\u3002\u5BFC\u5165\u65B9\u5F0F:kb_import(\u6587\u4EF6/\u6587\u4EF6\u5939,Obsidian \u5E93\u76F4\u63A5\u6307\u5E93\u76EE\u5F55)\u3001kb_import_url(\u7F51\u9875\u5B58\u6863)\u3001kb_note(\u76F4\u63A5\u5199\u6587\u672C\u2014\u2014\u5BF9\u8BDD\u957F\u6587\u3001\u8C03\u7814\u7ED3\u8BBA\u3001opencli \u7B49\u5DE5\u5177\u6293\u5230\u7684\u793E\u4EA4\u5185\u5BB9\u90FD\u5B58\u8FD9\u91CC)\u3002";
      return;
    }
    const sample = done.slice(-5).map((f) => f.path).join("\u3001");
    this.promptText = `\u672C\u5730\u77E5\u8BC6\u5E93(dsh-intelhub):\u5DF2\u5BFC\u5165 ${done.length} \u4E2A\u6765\u6E90(\u5982 ${sample})\u3002\u7528\u6237\u95EE\u9898\u6D89\u53CA\u8FD9\u4E9B\u5185\u5BB9\u65F6,\u5148\u7528 kb_search \u68C0\u7D22(\u8BED\u4E49+\u5173\u952E\u8BCD\u6DF7\u5408,\u80FD\u6309\u610F\u601D\u627E\u5230\u6362\u4E86\u8BF4\u6CD5\u7684\u6BB5\u843D),\u7ED3\u679C\u5E26 \u6765\u6E90#\u5757\u53F7,\u5F15\u7528\u65F6\u6CE8\u660E\u3002\u68C0\u7D22\u4E0D\u5230\u518D\u95EE\u7528\u6237\u6216\u770B\u539F\u6587\u4EF6\u3002\u65B0\u589E:kb_import(\u6587\u4EF6\u5939)/kb_import_url(\u7F51\u9875)/kb_note(\u6587\u672C);\u79FB\u9664\u7528 kb_delete\u3002`;
  }
  registerTools() {
    this.ctx.tools.register(defineTool({
      name: "kb_search",
      description: "\u5728\u7528\u6237\u7684\u672C\u5730\u77E5\u8BC6\u5E93\u91CC\u68C0\u7D22(\u8BED\u4E49+\u5173\u952E\u8BCD\u6DF7\u5408:\u6309\u610F\u601D\u80FD\u627E\u5230\u6362\u8BF4\u6CD5\u7684\u6BB5\u843D,\u7CBE\u786E\u8BCD/\u9519\u8BEF\u7801\u4E5F\u80FD\u547D\u4E2D)\u3002\u7528\u6237\u95EE\u9898\u6D89\u53CA\u5DF2\u5BFC\u5165\u6587\u6863\u65F6\u5148\u7528\u5B83,\u7ED3\u679C\u5E26 \u6587\u4EF6\u8DEF\u5F84#\u5757\u53F7 \u6765\u6E90\u3002\u53EF\u9009\u8FC7\u6EE4:\u4F5C\u8005/\u9636\u6BB5(\u7CBE\u9009 selected/raw)/\u6807\u7B7E/\u6700\u4F4E\u70B9\u8D5E\u3002",
      parameters: {
        query: {
          type: "string",
          description: "\u68C0\u7D22\u8BCD:\u81EA\u7136\u8BED\u8A00\u95EE\u9898\u6216\u5173\u952E\u8BCD\u5747\u53EF"
        },
        topk: {
          type: "number",
          description: "\u8FD4\u56DE\u6761\u6570,\u9ED8\u8BA4 5"
        },
        author: {
          type: "string",
          description: "\u53EF\u9009:\u53EA\u641C\u67D0\u4F5C\u8005\u7684\u91C7\u96C6(\u5982 \u5B9D\u7389xp)"
        },
        stage: {
          type: "string",
          description: "\u53EF\u9009:\u7CBE\u9009\u5C42 selected / \u5168\u96C6\u5C42 raw / reviewed"
        },
        tag: {
          type: "string",
          description: "\u53EF\u9009:\u6309\u6807\u7B7E\u8FC7\u6EE4(\u5982 AI/\u89C2\u70B9)"
        },
        likesMin: {
          type: "number",
          description: "\u53EF\u9009:\u6700\u4F4E\u70B9\u8D5E\u6570"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const q = String(a.query ?? "").trim();
        if (!q) return {
          text: "query \u4E0D\u80FD\u4E3A\u7A7A\u3002"
        };
        const topk = Math.min(Math.max(Number(a.topk) || 5, 1), 20);
        const filter = {
          author: a.author === void 0 ? void 0 : String(a.author),
          stage: a.stage === void 0 ? void 0 : String(a.stage),
          tag: a.tag === void 0 ? void 0 : String(a.tag),
          likesMin: a.likesMin === void 0 ? void 0 : Number(a.likesMin)
        };
        const r = await this.search(q, topk, filter);
        if (!r.ok) return {
          text: `\u68C0\u7D22\u5931\u8D25:${r.error ?? "\u672A\u77E5"}`
        };
        if (r.hits.length === 0) return {
          text: `\u77E5\u8BC6\u5E93\u4E2D\u6CA1\u6709\u5339\u914D"${q}"\u7684\u5185\u5BB9${r.note ? `(${r.note})` : ""}\u3002`
        };
        const lines = r.hits.map((h, i) => `[${i + 1}] ${h.score.toFixed(3)} \xB7 ${h.ref}
${h.text.length > SNIPPET ? h.text.slice(0, SNIPPET) + "\u2026" : h.text}`);
        return {
          text: `\u77E5\u8BC6\u5E93\u68C0\u7D22"${q}"(${r.mode}${r.note ? "," + r.note : ""}),${r.hits.length} \u6761:

${lines.join("\n\n")}`
        };
      }
    }));
    this.ctx.tools.register(defineTool({
      name: "kb_import",
      description: "\u5BFC\u5165\u6587\u4EF6\u6216\u6574\u4E2A\u6587\u4EF6\u5939\u5230\u672C\u5730\u77E5\u8BC6\u5E93(md/txt/pdf/docx/\u4EE3\u7801\u7B49)\u3002\u540E\u53F0\u5EFA\u7D22\u5F15,\u7ACB\u5373\u8FD4\u56DE\u961F\u5217\u60C5\u51B5;\u91CD\u590D\u5BFC\u5165\u53EA\u5904\u7406\u65B0\u589E/\u53D8\u66F4\u6587\u4EF6\u3002",
      parameters: {
        path: {
          type: "string",
          description: "\u6587\u4EF6\u6216\u6587\u4EF6\u5939\u7684\u7EDD\u5BF9\u8DEF\u5F84(\u652F\u6301 ~)"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const r = await this.importPath(String(a.path ?? ""));
        if (!r.ok) return {
          text: `\u5BFC\u5165\u5931\u8D25:${r.error ?? "\u672A\u77E5"}`
        };
        const parts = [
          `\u5DF2\u52A0\u5165\u7D22\u5F15\u961F\u5217:${r.queued} \u4E2A\u6587\u4EF6`
        ];
        if (r.skippedUnchanged > 0) parts.push(`\u65E0\u53D8\u5316\u8DF3\u8FC7:${r.skippedUnchanged}`);
        if (r.failedScan.length > 0) parts.push(`\u626B\u63CF\u5931\u8D25:${r.failedScan.join("\u3001")}(\u524D 5)`);
        parts.push("\u540E\u53F0\u7D22\u5F15\u8FDB\u884C\u4E2D,\u5B8C\u6210\u540E\u5373\u53EF\u68C0\u7D22;\u8FDB\u5EA6\u53EF\u770B dsh \u8BBE\u7F6E\u2192\u672C\u5730\u77E5\u8BC6\u5E93\u3002");
        return {
          text: parts.join(";") + "."
        };
      }
    }));
    this.ctx.tools.register(defineTool({
      name: "kb_import_url",
      description: "\u628A\u7F51\u9875\u5B58\u5165\u77E5\u8BC6\u5E93(\u8C03\u7814\u6512\u94FE\u63A5\u5E38\u7528):\u6293\u53D6\u6B63\u6587 \u2192 \u5206\u5757\u5165\u5E93,\u6765\u6E90\u663E\u793A\u4E3A URL\u3002\u4E5F\u63A5\u53D7 opencli \u7B49\u5DE5\u5177\u6293\u5230\u7684\u5185\u5BB9\u2014\u2014\u90A3\u79CD\u60C5\u51B5\u6539\u7528 kb_note \u76F4\u63A5\u5199\u5165\u3002",
      parameters: {
        urls: {
          type: "array",
          items: {
            type: "string"
          },
          description: "\u8981\u5B58\u6863\u7684\u7F51\u9875 URL \u5217\u8868"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const urls = Array.isArray(a.urls) ? a.urls.map(String) : [];
        if (urls.length === 0) return {
          text: "urls \u4E0D\u80FD\u4E3A\u7A7A\u3002"
        };
        const r = await this.importUrls(urls.slice(0, 20));
        if (!r.ok) return {
          text: `\u5BFC\u5165\u5931\u8D25:${r.error ?? "\u672A\u77E5"}`
        };
        if (r.failedScan.length > 0) return {
          text: `\u4EE5\u4E0B URL \u65E0\u6CD5\u5BFC\u5165:${r.failedScan.join("\u3001")}`
        };
        return {
          text: `\u5DF2\u52A0\u5165\u7D22\u5F15\u961F\u5217:${r.queued} \u4E2A\u7F51\u9875,\u540E\u53F0\u6293\u53D6\u5EFA\u7D22\u5F15\u4E2D\u3002`
        };
      }
    }));
    this.ctx.tools.register(defineTool({
      name: "kb_note",
      description: "\u628A\u4E00\u6BB5\u6587\u672C\u76F4\u63A5\u5199\u5165\u77E5\u8BC6\u5E93(\u5BF9\u8BDD\u91CC\u7684\u957F\u6587\u3001\u4F60\u7684\u8C03\u7814\u7ED3\u8BBA\u3001\u5176\u4ED6\u5DE5\u5177\u6293\u5230\u7684\u793E\u4EA4\u5185\u5BB9\u5982\u5FAE\u535A,\u90FD\u5B58\u8FD9\u91CC)\u3002\u6309\u6807\u9898\u53BB\u91CD,\u540C\u6807\u9898\u91CD\u590D\u5199\u5165\u4F1A\u8986\u76D6\u3002",
      parameters: {
        title: {
          type: "string",
          description: '\u7B14\u8BB0\u6807\u9898(\u552F\u4E00\u952E,\u5982 "\u5FAE\u535A-\u67D0\u67D0-2026-09" \u6216 "\u8C03\u7814-XX\u7ED3\u8BBA")'
        },
        text: {
          type: "string",
          description: "\u6B63\u6587\u5185\u5BB9(markdown/\u7EAF\u6587\u672C)"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const r = await this.importNote(String(a.title ?? ""), String(a.text ?? ""));
        if (!r.ok) return {
          text: `\u5199\u5165\u5931\u8D25:${r.error ?? "\u672A\u77E5"}`
        };
        return {
          text: "\u5DF2\u5199\u5165\u77E5\u8BC6\u5E93\u5E76\u5F00\u59CB\u5EFA\u7D22\u5F15\u3002"
        };
      }
    }));
    this.ctx.tools.register(defineTool({
      name: "kb_list",
      description: "\u5217\u51FA\u672C\u5730\u77E5\u8BC6\u5E93\u5DF2\u5BFC\u5165\u7684\u6587\u4EF6\u3001\u5757\u6570\u4E0E\u7D22\u5F15\u72B6\u6001\u3002",
      parameters: {},
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async () => {
        const files = [
          ...this.registry.values()
        ].sort((x, y) => y.importedAt - x.importedAt);
        if (files.length === 0) return {
          text: "\u77E5\u8BC6\u5E93\u4E3A\u7A7A\u3002\u7528 kb_import \u5BFC\u5165\u6587\u4EF6\u6216\u6587\u4EF6\u5939\u3002"
        };
        const rows = files.map((f) => `${f.status === "done" ? "\u2713" : f.status === "failed" ? "\u2717" : "\u2026"} ${f.chunks}\u5757 ${f.path}${f.error ? ` (${f.error})` : ""}`);
        return {
          text: `\u77E5\u8BC6\u5E93 ${files.length} \u4E2A\u6587\u4EF6:
${rows.join("\n")}`
        };
      }
    }));
    this.ctx.tools.register(defineTool({
      name: "kb_delete",
      description: "\u4ECE\u77E5\u8BC6\u5E93\u79FB\u9664\u4E00\u4E2A\u5DF2\u5BFC\u5165\u7684\u6587\u4EF6(\u6309\u5BFC\u5165\u8DEF\u5F84,\u652F\u6301\u53EA\u7ED9\u7ED3\u5C3E\u4E00\u6BB5\u552F\u4E00\u8DEF\u5F84)\u3002",
      parameters: {
        path: {
          type: "string",
          description: "\u5BFC\u5165\u65F6\u7684\u6587\u4EF6\u8DEF\u5F84(\u6216\u5176\u552F\u4E00\u540E\u7F00)"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const r = await this.remove(String(a.path ?? ""));
        if (!r.ok) return {
          text: `\u5220\u9664\u5931\u8D25:${r.error ?? "\u672A\u77E5"}`
        };
        return {
          text: r.removed ? "\u5DF2\u4ECE\u77E5\u8BC6\u5E93\u79FB\u9664\u3002" : "\u6CA1\u6709\u5339\u914D\u7684\u5DF2\u5BFC\u5165\u6587\u4EF6\u3002"
        };
      }
    }));
    this.ctx.tools.register(defineTool({
      name: "kb_watch",
      description: "\u628A\u4E00\u4E2A\u76EE\u5F55\u6CE8\u518C\u4E3A\u77E5\u8BC6\u5E93\u5E38\u9A7B workspace:\u6B64\u540E\u8BE5\u76EE\u5F55\u7684\u65B0\u589E/\u53D8\u66F4\u6587\u4EF6\u88AB\u81EA\u52A8\u589E\u91CF\u7D22\u5F15(\u91C7\u96C6\u811A\u672C\u843D\u76D8\u5373\u5165\u5E93,\u65E0\u9700\u624B\u52A8\u5BFC\u5165)\u3002",
      parameters: {
        path: {
          type: "string",
          description: "\u8981\u5E38\u9A7B\u76D1\u542C\u7684\u76EE\u5F55\u7EDD\u5BF9\u8DEF\u5F84(\u652F\u6301 ~)"
        },
        label: {
          type: "string",
          description: "\u53EF\u9009\u6807\u7B7E(\u9762\u677F\u5C55\u793A\u7528)"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const r = await this.workspaceMgr.add(String(a.path ?? ""), a.label === void 0 ? void 0 : String(a.label));
        if (!r.ok) return {
          text: `\u6CE8\u518C\u5931\u8D25:${r.error ?? "\u672A\u77E5"}`
        };
        return {
          text: "\u5DF2\u6CE8\u518C\u4E3A\u5E38\u9A7B workspace:\u76EE\u5F55\u5185\u65B0\u589E/\u53D8\u66F4\u6587\u4EF6\u5C06\u81EA\u52A8\u589E\u91CF\u7D22\u5F15;\u9996\u6B21\u5168\u91CF\u5728\u540E\u53F0\u8FDB\u884C\u3002"
        };
      }
    }));
    this.ctx.tools.register(defineTool({
      name: "kb_schedule",
      description: "\u8BBE\u7F6E/\u67E5\u770B/\u5220\u9664\u77E5\u8BC6\u5E93\u7684\u6301\u4E45\u5316\u5B9A\u65F6\u4EFB\u52A1(\u91CD\u542F\u4E0D\u4E22)\u3002\u7528\u4F8B:\u6309\u535A\u4E3B\u53D1\u535A\u8282\u594F\u5B9A\u65F6\u626B\u63CF\u91C7\u96C6\u76EE\u5F55\u3002\u52A8\u4F5C scan=\u5168 workspace \u589E\u91CF\u7D22\u5F15\u3002",
      parameters: {
        action: {
          type: "string",
          enum: [
            "list",
            "set",
            "remove",
            "enable",
            "disable"
          ],
          description: "\u64CD\u4F5C"
        },
        name: {
          type: "string",
          description: "\u4EFB\u52A1\u540D(set/remove/enable/disable \u5FC5\u586B)"
        },
        kind: {
          type: "string",
          enum: [
            "interval",
            "daily"
          ],
          description: "set \u5FC5\u586B:interval=\u6BCF everyMin \u5206\u949F;daily=\u6BCF\u5929 at \u65F6\u523B"
        },
        everyMin: {
          type: "number",
          description: "interval \u578B:\u95F4\u9694\u5206\u949F\u6570(1-10080)"
        },
        at: {
          type: "string",
          description: "daily \u578B:HH:MM(24 \u5C0F\u65F6\u5236)"
        },
        enabled: {
          type: "boolean",
          description: "set \u65F6\u53EF\u9009,\u9ED8\u8BA4 true"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const action = String(a.action ?? "list");
        if (action === "list") {
          const rows = this.scheduleMgr.list().map((e) => `${e.enabled ? "\u2713" : "\u23F8"} ${e.name} (${e.kind === "daily" ? `\u6BCF\u5929 ${e.at}` : `\u6BCF ${e.everyMin} \u5206\u949F`}, scan, \u4E0A\u6B21 ${e.lastRunAt ? new Date(e.lastRunAt).toLocaleString() : "\u672A\u8FD0\u884C"})`);
          return {
            text: rows.length === 0 ? "\u6CA1\u6709\u5B9A\u65F6\u4EFB\u52A1\u3002\u7528 kb_schedule action=set \u521B\u5EFA\u3002" : `\u5B9A\u65F6\u4EFB\u52A1 ${rows.length} \u4E2A:
${rows.join("\n")}`
          };
        }
        if (action === "set") {
          const r2 = await this.scheduleMgr.set({
            name: a.name,
            kind: a.kind,
            everyMin: a.everyMin,
            at: a.at,
            enabled: a.enabled
          });
          return r2.ok ? {
            text: `\u5B9A\u65F6\u4EFB\u52A1\u5DF2\u4FDD\u5B58(\u91CD\u542F\u4E0D\u4E22),\u5F15\u64CE\u5C06\u6309\u8BA1\u5212\u6267\u884C scan\u3002`
          } : {
            text: `\u8BBE\u7F6E\u5931\u8D25:${r2.error ?? "\u672A\u77E5"}`
          };
        }
        if (action === "remove") {
          const ok = await this.scheduleMgr.remove(String(a.name ?? ""));
          return {
            text: ok ? "\u5DF2\u5220\u9664\u3002" : `\u4E0D\u5B58\u5728:${String(a.name)}`
          };
        }
        const r = await this.scheduleMgr.setEnabled(String(a.name ?? ""), action === "enable");
        return r.ok ? {
          text: action === "enable" ? "\u5DF2\u542F\u7528\u3002" : "\u5DF2\u505C\u7528\u3002"
        } : {
          text: `\u5931\u8D25:${r.error ?? "\u672A\u77E5"}`
        };
      }
    }));
    this.ctx.tools.register(defineTool({
      name: "kb_today",
      description: "\u4ECA\u5929\u91C7\u4E86\u4EC0\u4E48:\u4ECA\u65E5\u65B0\u589E\u6765\u6E90\u3001\u9AD8\u4EF7\u503C\u5E16(\u6309\u70B9\u8D5E\u6392\u5E8F)\u3001\u5F85\u5206\u8BCA\u961F\u5217\u5B58\u91CF\u3002\u590D\u76D8\u5DE5\u4F5C\u6D41\u7684\u5165\u53E3\u3002",
      parameters: {},
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async () => {
        await this.loadRegistry();
        const now = /* @__PURE__ */ new Date();
        const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        const files = [
          ...this.registry.values()
        ];
        const todayNew = files.filter((f) => f.meta?.date === ymd || new Date(f.importedAt).toDateString() === now.toDateString());
        const top = [
          ...todayNew
        ].filter((f) => (f.meta?.likes ?? 0) > 0).sort((x, y) => (y.meta?.likes ?? 0) - (x.meta?.likes ?? 0)).slice(0, 8);
        const rawPending = files.filter((f) => f.meta?.stage === "raw").length;
        const lines = [
          `\u4ECA\u65E5\u65B0\u589E ${todayNew.length} \u7BC7 \xB7 \u5F85\u5206\u8BCA(raw)\u5B58\u91CF ${rawPending}`,
          ...top.length > 0 ? [
            "\u9AD8\u4EF7\u503C TOP:"
          ].concat(top.map((f) => `\u25C6 ${f.meta?.author ?? f.path.split(/[\\/]/).pop()} \xB7 \u8D5E ${f.meta?.likes} \xB7 ${f.path.split(/[\\/]/).pop()}`)) : []
        ];
        return {
          text: lines.join("\n")
        };
      }
    }));
    this.ctx.tools.register(defineTool({
      name: "kb_export",
      description: "\u628A\u68C0\u7D22\u5230\u7684\u77E5\u8BC6\u5BFC\u51FA\u4E3A Markdown \u6587\u4EF6\u5199\u5165\u6307\u5B9A\u76EE\u5F55(\u5982 Obsidian \u5E93),\u5E26\u5BFC\u51FA frontmatter \u4E0E\u5168\u90E8\u6765\u6E90\u5F15\u7528\u3002\u53EA\u5199\u7528\u6237\u6307\u5B9A\u7684\u76EE\u5F55,\u7EDD\u4E0D\u52A8\u539F\u59CB\u91C7\u96C6\u6587\u4EF6\u3002",
      parameters: {
        query: {
          type: "string",
          description: "\u68C0\u7D22\u8BCD:\u5BFC\u51FA\u547D\u4E2D\u7684\u5185\u5BB9"
        },
        dir: {
          type: "string",
          description: "\u76EE\u6807\u76EE\u5F55(\u7528\u6237\u6307\u5B9A\u7684 Obsidian \u5E93\u76EE\u5F55\u7B49,\u652F\u6301 ~)"
        },
        title: {
          type: "string",
          description: "\u53EF\u9009:\u5BFC\u51FA\u6587\u4EF6\u540D\u4E3B\u4F53"
        },
        limit: {
          type: "number",
          description: "\u5BFC\u51FA\u6761\u6570\u4E0A\u9650,\u9ED8\u8BA4 5"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const q = String(a.query ?? "").trim();
        const dir = String(a.dir ?? "").trim();
        if (!q) return {
          text: "query \u4E0D\u80FD\u4E3A\u7A7A\u3002"
        };
        if (!dir) return {
          text: "dir \u4E0D\u80FD\u4E3A\u7A7A\u2014\u2014\u53EA\u5199\u7528\u6237\u660E\u786E\u6307\u5B9A\u7684\u76EE\u5F55\u3002"
        };
        const limit = Math.min(Math.max(Number(a.limit) || 5, 1), 20);
        const r = await this.exportTo(q, dir, a.title === void 0 ? void 0 : String(a.title), limit);
        if (!r.ok) return {
          text: `\u5BFC\u51FA\u5931\u8D25:${r.error ?? "\u672A\u77E5"}`
        };
        return {
          text: `\u5DF2\u5BFC\u51FA ${r.count} \u6761\u5230 ${r.path}(\u666E\u901A Markdown,Obsidian \u76F4\u63A5\u53EF\u7D22\u5F15)\u3002`
        };
      }
    }));
    this.ctx.tools.register(defineTool({
      name: "kb_evidence",
      description: "\u7ED9\u4E00\u6761\u5224\u65AD\u627E\u8BC1\u636E:\u6309\u5224\u65AD\u6587\u672C\u8BED\u4E49\u68C0\u7D22\u77E5\u8BC6\u5E93,\u6309\u6765\u6E90\u6587\u4EF6\u5F52\u7EC4,\u8FD4\u56DE\u652F\u6301\u7684 \u539F\u6587#\u5757\u53F7 \u6E05\u5355\u3002\u5224\u65AD\u53F0\u8D26\u590D\u76D8\u7528\u3002",
      parameters: {
        text: {
          type: "string",
          description: "\u5224\u65AD\u5185\u5BB9(\u4E00\u53E5\u8BDD)"
        },
        topk: {
          type: "number",
          description: "\u5019\u9009\u8BC1\u636E\u6761\u6570\u4E0A\u9650,\u9ED8\u8BA4 8"
        }
      },
      output: {
        schema: {
          type: "json"
        },
        render: (_a, v) => [
          {
            type: "text",
            text: v.text
          }
        ]
      },
      execute: async (a) => {
        const t = String(a.text ?? "").trim();
        if (!t) return {
          text: "text \u4E0D\u80FD\u4E3A\u7A7A\u3002"
        };
        const topk = Math.min(Math.max(Number(a.topk) || 8, 1), 20);
        const r = await this.search(t, topk);
        if (!r.ok) return {
          text: `\u68C0\u7D22\u5931\u8D25:${r.error ?? "\u672A\u77E5"}`
        };
        if (r.hits.length === 0) return {
          text: "\u77E5\u8BC6\u5E93\u4E2D\u6CA1\u6709\u627E\u5230\u76F8\u5173\u8BC1\u636E\u3002"
        };
        const seen = /* @__PURE__ */ new Set();
        const ev = [];
        for (const h of r.hits) {
          const file = h.ref.replace(/#\d+$/, "");
          if (seen.has(file)) continue;
          seen.add(file);
          ev.push(`\u25B8 ${h.ref} \xB7 ${h.text.length > 60 ? h.text.slice(0, 60) + "\u2026" : h.text}`);
        }
        return {
          text: `\u8BC1\u636E ${ev.length} \u4EF6(\u6309\u76F8\u5173\u5EA6):
${ev.join("\n")}
\u2014\u2014 \u5168\u90E8\u5E26 \u539F\u6587#\u5757\u53F7,\u53EF\u56DE\u6E90\u6838\u5BF9\u3002`
        };
      }
    }));
  }
  // ── 运行时(向量器 + 存储,惰性) ──────────────────────────
  async ensureRuntime() {
    if (this.embedder === null) {
      this.embedder = this.createEmbedder();
    }
    if (this.store === null) {
      await mkdir3(this.homeDir, {
        recursive: true
      });
      let s = new KbStore(join3(this.homeDir, `store-v${SCHEMA_VERSION}`), this.embedder.dim);
      s.open();
      if (!s.ok) {
        const alt = join3(this.homeDir, `store-recovery-${Date.now().toString(36)}`);
        s = new KbStore(alt, this.embedder.dim);
        s.open();
        if (!s.ok) return {
          error: `zvec \u5B58\u50A8\u6253\u5F00\u5931\u8D25:${s.error ?? "\u672A\u77E5"}`
        };
        this.recoveryNote = "\u68C0\u6D4B\u5230\u53E6\u4E00\u4E2A\u5B9E\u4F8B\u5360\u7528\u7D22\u5F15,\u672C\u6B21\u8FD0\u884C\u5199\u5165\u6062\u590D\u76EE\u5F55;\u5173\u95ED\u5176\u4ED6\u5B9E\u4F8B\u540E\u91CD\u542F dsh \u53EF\u56DE\u5230\u4E3B\u76EE\u5F55\u3002";
      }
      this.store = s;
    }
    return {
      embedder: this.embedder,
      store: this.store
    };
  }
  // ── 导入 ────────────────────────────────────────────────
  async importPath(input) {
    const raw = input.trim().replace(/^~(?=$|[/\\])/, homedir());
    const p = resolve(raw);
    let st;
    try {
      st = await stat2(p);
    } catch {
      return {
        ok: false,
        queued: 0,
        skippedUnchanged: 0,
        failedScan: [],
        error: `\u8DEF\u5F84\u4E0D\u5B58\u5728:${p}`
      };
    }
    await this.loadRegistry();
    const files = [];
    const failedScan = [];
    if (st.isFile()) {
      files.push(p);
    } else {
      const walk = async (dir) => {
        const entries = await readdir(dir, {
          withFileTypes: true
        });
        for (const e of entries) {
          if (files.length >= MAX_FILES_PER_IMPORT) return;
          const fp = join3(dir, e.name);
          if (e.isDirectory()) {
            if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) await walk(fp);
          } else if (!e.name.startsWith(".") && SUPPORTED_EXTS.has(extLower(e.name))) {
            files.push(fp);
          }
        }
      };
      try {
        await walk(p);
      } catch (err) {
        failedScan.push(err instanceof Error ? err.message.slice(0, 80) : "\u76EE\u5F55\u626B\u63CF\u9519\u8BEF");
      }
    }
    let queued = 0;
    let skippedUnchanged = 0;
    const candidates = [];
    for (const fp of files) {
      try {
        const s = await stat2(fp);
        if (s.size > MAX_FILE_BYTES) {
          failedScan.push(`${fp}(\u8D85\u8FC7 ${Math.round(MAX_FILE_BYTES / 1048576)}MB)`);
          continue;
        }
        candidates.push({
          path: fp,
          bytes: s.size
        });
      } catch {
        failedScan.push(`${fp}(\u4E0D\u53EF\u8BFB)`);
      }
    }
    for (const c of candidates) {
      const prev = this.registry.get(regKey("fs", c.path));
      if (prev !== void 0 && prev.status === "done" && prev.bytes === c.bytes) {
        let unchanged = false;
        try {
          if (prev.rawHash !== void 0) {
            unchanged = createHash2("sha256").update(await readFile4(c.path)).digest("hex").slice(0, 16) === prev.rawHash;
          } else {
            const { text } = await extractText(c.path);
            unchanged = text !== null && createHash2("sha256").update(Buffer.from(text, "utf8")).digest("hex").slice(0, 16) === prev.id;
          }
        } catch {
          unchanged = false;
        }
        if (unchanged) {
          skippedUnchanged++;
          continue;
        }
      }
      const prevEntry = prev ?? entryOf(c.path);
      this.registry.set(regKey("fs", c.path), {
        ...prevEntry,
        path: resolve(c.path),
        bytes: c.bytes,
        status: "indexing",
        chunks: prev?.chunks ?? 0
      });
      queued++;
      this.enqueueSource(regKey("fs", c.path), resolve(c.path), c.bytes, async () => {
        const { text, reason, rawHash, meta } = await extractText(c.path);
        if (text === null) throw new Error(reason ?? "\u65E0\u6CD5\u62BD\u53D6\u6587\u672C");
        this.pendingRawHash = rawHash;
        this.pendingMeta = meta;
        return text;
      });
    }
    if (queued > 0 || failedScan.length > 0) this.saveRegistry();
    this.refreshPrompt();
    return {
      ok: true,
      queued,
      skippedUnchanged,
      failedScan: failedScan.slice(0, 5)
    };
  }
  /** URL 导入:抓取网页 → 正文抽取 → 同一条分块/向量化管线;来源显示为 URL 本身。 */
  async importUrls(urls) {
    await this.loadRegistry();
    const failedScan = [];
    let queued = 0;
    for (const raw of urls) {
      const url = raw.trim();
      if (!/^https?:\/\//i.test(url)) {
        failedScan.push(`${url}(\u975E\u6CD5 URL)`);
        continue;
      }
      const key = regKey("url", url);
      const prevU = this.registry.get(key);
      this.registry.set(key, {
        ...prevU ?? entryOf(url),
        bytes: 0,
        status: "indexing",
        chunks: prevU?.chunks ?? 0
      });
      queued++;
      this.enqueueSource(key, url, 0, async () => {
        const html = await this.fetchText(url);
        const text = htmlToText(html);
        if (text.length < 40) throw new Error("\u9875\u9762\u65E0\u53EF\u62BD\u53D6\u6B63\u6587");
        this.pendingRawHash = void 0;
        this.pendingMeta = void 0;
        this.pendingSrc = "url";
        return text;
      });
    }
    if (queued > 0) this.saveRegistry();
    this.refreshPrompt();
    return {
      ok: true,
      queued,
      skippedUnchanged: 0,
      failedScan: failedScan.slice(0, 5)
    };
  }
  /** 直接文本导入:对话里贴的长文、agent 的调研结论、opencli 抓到的社交内容都走这里。 */
  async importNote(title, text) {
    await this.loadRegistry();
    const t = title.trim().slice(0, 120);
    if (t === "" || text.trim() === "") return {
      ok: false,
      queued: 0,
      skippedUnchanged: 0,
      failedScan: [],
      error: "\u6807\u9898\u4E0E\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A"
    };
    const key = regKey("note", t);
    const prevN = this.registry.get(key);
    this.registry.set(key, {
      ...prevN ?? entryOf(`note:${t}`),
      bytes: Buffer.byteLength(text, "utf8"),
      status: "indexing",
      chunks: prevN?.chunks ?? 0
    });
    this.pendingRawHash = void 0;
    this.pendingMeta = void 0;
    this.pendingSrc = "note";
    this.enqueueSource(key, `note:${t}`, Buffer.byteLength(text, "utf8"), async () => text);
    this.saveRegistry();
    this.refreshPrompt();
    return {
      ok: true,
      queued: 1,
      skippedUnchanged: 0,
      failedScan: []
    };
  }
  /** 测试注入点:URL 抓取(真实实现用全局 fetch)。 */
  async fetchText(url) {
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; dsh-intelhub/0.1)"
      },
      signal: AbortSignal.timeout(2e4)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  }
  /** 串行后台队列:逐源 抽取→分块→向量化→入库,失败记入注册表不阻断后续。 */
  enqueueSource(key, display, bytes, produce) {
    this.queuedFiles++;
    this.queueTail = this.queueTail.then(async () => {
      try {
        const text = await produce();
        const scalars = this.metaToScalars(this.pendingMeta, this.pendingSrc);
        await this.indexContent(key, display, text, bytes, this.pendingRawHash, scalars);
      } catch (err) {
        const cur = this.registry.get(key);
        this.registry.set(key, {
          ...cur ?? entryOf(display),
          bytes,
          status: "failed",
          error: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200)
        });
        this.saveRegistry();
        this.refreshPrompt();
      } finally {
        this.queuedFiles--;
      }
    });
  }
  /** frontmatter 标量 → zvec 行标量;URL/笔记来源补 src 标识。 */
  metaToScalars(meta, srcOverride) {
    return {
      author: meta?.author,
      stage: meta?.stage,
      tag: meta?.tag,
      src: srcOverride ?? meta?.src,
      date: meta?.date,
      type: meta?.type,
      likes: meta?.likes
    };
  }
  /** 反哺导出:检索结果组装为普通 Markdown(带导出 frontmatter 与来源),落盘到用户指定目录。 */
  async exportTo(query, dir, title, limit) {
    const target = resolve(dir.trim().replace(/^~(?=$|[/\\])/, homedir()));
    const r = await this.search(query, limit);
    if (!r.ok) return {
      ok: false,
      error: r.error ?? "\u68C0\u7D22\u5931\u8D25"
    };
    if (r.hits.length === 0) return {
      ok: false,
      error: `\u6CA1\u6709\u547D\u4E2D\u5185\u5BB9:${query}`
    };
    const now = /* @__PURE__ */ new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const safeTitle = (title ?? query).replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 40) || "\u5BFC\u51FA";
    const file = join3(target, `intelhub-${stamp}-${safeTitle}.md`);
    const md = [
      "---",
      `exported: ${now.toISOString()}`,
      `source: IntelHub \u77E5\u8BC6\u5E93\u68C0\u7D22 "${query.replace(/"/g, "")}"`,
      `count: ${r.hits.length}`,
      `query: ${query.replace(/"/g, "")}`,
      "---",
      "",
      `# ${title ?? query}`,
      "",
      ...r.hits.map((h, i) => `## [${i + 1}] ${h.ref}

${h.text}
`),
      "---",
      "_\u7531 dsh-intelhub(kb_export)\u5BFC\u51FA \xB7 \u539F\u6587\u53EF\u6309 \u6587\u4EF6#\u5757\u53F7 \u56DE\u6E90_",
      ""
    ].join("\n");
    try {
      await mkdir3(target, {
        recursive: true
      });
      await writeFile3(file, md, "utf8");
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message.slice(0, 160) : "\u5199\u5165\u5931\u8D25"
      };
    }
    return {
      ok: true,
      count: r.hits.length,
      path: file
    };
  }
  async indexContent(key, display, text, bytes, rawHash, scalars) {
    const rt = await this.ensureRuntime();
    if ("error" in rt) throw new Error(rt.error);
    const buf = Buffer.from(text, "utf8");
    const id = createHash2("sha256").update(buf).digest("hex").slice(0, 16);
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error("\u6CA1\u6709\u53EF\u7D22\u5F15\u7684\u5185\u5BB9");
    const prev = this.registry.get(key);
    const metaSig = JSON.stringify(scalars ?? {});
    if (prev !== void 0 && prev.id !== "" && prev.id === id && prev.status === "done" && prev.metaSig === metaSig) {
      this.registry.set(key, {
        ...prev,
        bytes,
        status: "done",
        rawHash
      });
      this.saveRegistry();
      return;
    }
    if (prev !== void 0 && prev.id !== "" && prev.id !== id) rt.store.deleteFile(prev.id);
    if (rt.embedder.ready !== null) await rt.embedder.ready;
    const vectors = await rt.embedder.embed(chunks.map((c) => embedTextOf(c)));
    rt.store.insert(id, chunks, vectors, scalars);
    this.registry.set(key, {
      id,
      path: display,
      bytes,
      chunks: chunks.length,
      status: "done",
      importedAt: Date.now(),
      rawHash,
      metaSig,
      meta: scalars
    });
    this.saveRegistry();
    this.refreshPrompt();
  }
  // ── 检索 ────────────────────────────────────────────────
  async search(query, topk, filter) {
    const rt = await this.ensureRuntime();
    if ("error" in rt) return {
      ok: false,
      mode: "none",
      hits: [],
      error: rt.error
    };
    let queryVec = null;
    let note;
    if (rt.embedder.ready === null) {
      queryVec = (await rt.embedder.embed([
        query
      ], true))[0];
    } else {
      const ready = await Promise.race([
        rt.embedder.ready.then(() => true),
        new Promise((res) => setTimeout(() => res(false), 1500))
      ]);
      if (ready) {
        queryVec = (await rt.embedder.embed([
          query
        ], true))[0];
      } else {
        note = "\u8BED\u4E49\u6A21\u578B\u52A0\u8F7D\u4E2D,\u672C\u6B21\u4E3A\u5173\u952E\u8BCD\u68C0\u7D22";
      }
    }
    const raw = rt.store.search(queryVec, query, topk, filter ? buildFilter(filter) : void 0);
    const byId = new Map([
      ...this.registry.values()
    ].map((f) => [
      f.id,
      f
    ]));
    const hits = raw.map((r) => ({
      ref: `${byId.get(r.file)?.path ?? r.file}#${r.chunk}`,
      score: r.score,
      text: r.text
    }));
    const out = {
      ok: true,
      mode: queryVec === null ? "fts" : "hybrid",
      hits
    };
    if (note !== void 0) out.note = note;
    return out;
  }
  // ── 列表 / 删除 / 状态 ───────────────────────────────────
  async remove(input) {
    await this.loadRegistry();
    const t = input.trim();
    const kind = /^https?:\/\//i.test(t) ? "url" : t.startsWith("note:") ? "note" : "fs";
    let entryKey = regKey(kind, t);
    let entry = this.registry.get(entryKey);
    if (entry === void 0) {
      const lower = t.toLowerCase();
      const matches = [
        ...this.registry.entries()
      ].filter(([, f]) => {
        const p = f.path.toLowerCase();
        return p === lower || p.endsWith(lower) || p.endsWith("/" + lower);
      });
      if (matches.length === 1) {
        entryKey = matches[0][0];
        entry = matches[0][1];
      } else if (matches.length > 1) {
        return {
          ok: false,
          removed: false,
          error: `\u8DEF\u5F84\u4E0D\u552F\u4E00(${matches.length} \u4E2A\u5339\u914D),\u8BF7\u7ED9\u5B8C\u6574\u8DEF\u5F84`
        };
      }
    }
    if (entry === void 0) return {
      ok: true,
      removed: false
    };
    if (this.store === null) {
      const rt = await this.ensureRuntime();
      if ("error" in rt) return {
        ok: false,
        removed: false,
        error: rt.error
      };
    }
    try {
      this.store?.deleteFile(entry.id);
    } catch (err) {
      return {
        ok: false,
        removed: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
    this.registry.delete(entryKey);
    this.saveRegistry();
    this.refreshPrompt();
    return {
      ok: true,
      removed: true
    };
  }
  async listFiles() {
    await this.loadRegistry();
    const files = [
      ...this.registry.values()
    ].sort((x, y) => y.importedAt - x.importedAt);
    return {
      ok: true,
      files,
      indexing: this.queuedFiles
    };
  }
  async statusInfo() {
    const rt = await this.ensureRuntime().catch(() => null);
    await this.loadRegistry();
    const files = [
      ...this.registry.values()
    ];
    let model = "absent";
    if (rt !== null && !("error" in rt)) {
      const e = rt.embedder;
      model = e.ready === null ? "ready" : await Promise.race([
        e.ready.then(() => "ready"),
        new Promise((res) => setTimeout(() => res("loading"), 50))
      ]);
    }
    const out = {
      ok: rt !== null && !("error" in rt),
      home: this.homeDir,
      files: files.length,
      chunks: files.reduce((s, f) => s + (f.status === "done" ? f.chunks : 0), 0),
      indexing: this.queuedFiles,
      model,
      dim: this.embedder?.dim ?? null
    };
    if (rt !== null && "error" in rt && rt.error != null) out.error = rt.error;
    if (this.recoveryNote !== null) out.note = this.recoveryNote;
    return out;
  }
  // ── RPC(面板) ────────────────────────────────────────────
  async rpcStatus() {
    return await this.statusInfo();
  }
  async rpcList() {
    return await this.listFiles();
  }
  async rpcImport(p) {
    return await this.importPath(p.path);
  }
  async rpcRemove(p) {
    return await this.remove(p.path);
  }
  async rpcSearch(p) {
    return await this.search(p.query, p.topk, {
      author: p.author,
      stage: p.stage,
      tag: p.tag,
      likesMin: p.likesMin
    });
  }
  async rpcUrlImport(p) {
    return await this.importUrls(Array.isArray(p.urls) ? p.urls.map(String) : []);
  }
  async rpcNote(p) {
    return await this.importNote(String(p.title ?? ""), String(p.text ?? ""));
  }
  /** 面板拖拽上传:浏览器端已读好的文本内容,逐个按笔记入库。 */
  async rpcUpload(p) {
    const files = Array.isArray(p.files) ? p.files.slice(0, 50) : [];
    let queued = 0;
    for (const f of files) {
      const r = await this.importNote(f.name, f.text);
      if (r.ok) queued += r.queued;
      else return r;
    }
    return {
      ok: true,
      queued,
      skippedUnchanged: 0,
      failedScan: []
    };
  }
  /** 空态演示:内置样例文档 + 陷阱查询,并排展示 关键词检索(找不到)vs 混合检索(命中)。 */
  async rpcDemo() {
    const key = regKey("note", DEMO_NOTE_TITLE);
    const existed = this.registry.get(key)?.status === "done";
    if (!existed) {
      await this.importNote(DEMO_NOTE_TITLE, DEMO_NOTE_TEXT);
      await this.drain();
    }
    const query = "\u600E\u4E48\u914D\u7F6E\u8D85\u65F6\u65F6\u95F4";
    const fts = await this.searchRaw(query, 3, true);
    const hybrid = await this.searchRaw(query, 3, false);
    const out = {
      ok: true,
      imported: !existed,
      query,
      fts: fts.hits,
      hybrid: hybrid.hits
    };
    if (fts.hits.length === 0) out.note = '\u5173\u952E\u8BCD\u68C0\u7D22\u627E\u4E0D\u5230\u2014\u2014\u6587\u6863\u91CC\u6CA1\u6709"\u8D85\u65F6"\u4E8C\u5B57';
    return out;
  }
  /** 面板:workspace 常驻目录管理。 */
  async rpcWorkspaceAdd(p) {
    return await this.workspaceMgr.add(String(p.path ?? ""), p.label === void 0 ? void 0 : String(p.label));
  }
  async rpcWorkspaceRemove(p) {
    return {
      ok: true,
      removed: await this.workspaceMgr.remove(String(p.path ?? ""))
    };
  }
  async rpcWorkspaceList() {
    return {
      ok: true,
      workspaces: this.workspaceMgr.list()
    };
  }
  /** 面板仪表盘:14 天趋势 / 渠道分布 / 阶段漏斗 / TOP 作者。 */
  async rpcDashboard() {
    await this.loadRegistry();
    const files = [
      ...this.registry.values()
    ];
    const now = /* @__PURE__ */ new Date();
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      days.push({
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        files: 0,
        chunks: 0
      });
    }
    const dayIdx = new Map(days.map((d, i) => [
      d.date,
      i
    ]));
    const srcChunks = /* @__PURE__ */ new Map();
    const stageCount = /* @__PURE__ */ new Map();
    const authors = /* @__PURE__ */ new Map();
    let chunksTotal = 0;
    let todayFiles = 0;
    let rawPending = 0;
    const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    for (const f of files) {
      if (f.status !== "done") continue;
      chunksTotal += f.chunks;
      const fk = f.meta;
      const src = fk?.src ?? (f.path.startsWith("note:") ? "note" : f.path.startsWith("http") ? "url" : "file");
      srcChunks.set(src, (srcChunks.get(src) ?? 0) + f.chunks);
      const stage = fk?.stage || "\u672A\u6807\u6CE8";
      stageCount.set(stage, (stageCount.get(stage) ?? 0) + 1);
      const dkey = new Date(f.importedAt);
      const key = `${dkey.getFullYear()}-${String(dkey.getMonth() + 1).padStart(2, "0")}-${String(dkey.getDate()).padStart(2, "0")}`;
      const di = dayIdx.get(key);
      if (di !== void 0) {
        days[di].files++;
        days[di].chunks += f.chunks;
      }
      if (f.meta?.date === ymd || new Date(f.importedAt).toDateString() === now.toDateString()) todayFiles++;
      if (fk?.stage === "raw") rawPending++;
      const author = fk?.author;
      if (author) {
        const a = authors.get(author) ?? {
          likes: 0,
          files: 0
        };
        a.likes = Math.max(a.likes, fk?.likes ?? 0);
        a.files++;
        authors.set(author, a);
      }
    }
    const bySrc = [
      ...srcChunks.entries()
    ].map(([k, c]) => ({
      k,
      chunks: c
    })).sort((a, b) => b.chunks - a.chunks);
    const byStage = [
      ...stageCount.entries()
    ].map(([k, count]) => ({
      k,
      count
    })).sort((a, b) => b.count - a.count);
    const topAuthors = [
      ...authors.entries()
    ].map(([author, a]) => ({
      author,
      likes: a.likes,
      files: a.files
    })).sort((a, b) => b.likes - a.likes).slice(0, 5);
    return {
      ok: true,
      totals: {
        files: files.filter((f) => f.status === "done").length,
        chunks: chunksTotal,
        indexing: this.queuedFiles,
        todayFiles,
        rawPending
      },
      daily: days,
      bySrc,
      byStage,
      topAuthors
    };
  }
  /** 面板/侧边栏:今日采集概览(kb_today 工具的同源数据面)。 */
  async rpcToday() {
    await this.loadRegistry();
    const now = /* @__PURE__ */ new Date();
    const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const files = [
      ...this.registry.values()
    ];
    const todayNew = files.filter((f) => f.meta?.date === ymd || new Date(f.importedAt).toDateString() === now.toDateString());
    const top = [
      ...todayNew
    ].filter((f) => (f.meta?.likes ?? 0) > 0).sort((x, y) => (y.meta?.likes ?? 0) - (x.meta?.likes ?? 0)).slice(0, 8);
    const rawPending = files.filter((f) => f.meta?.stage === "raw").length;
    const lines = [
      `\u4ECA\u65E5\u65B0\u589E ${todayNew.length} \u7BC7 \xB7 \u5F85\u5206\u8BCA(raw)\u5B58\u91CF ${rawPending}`,
      ...top.length > 0 ? [
        "\u9AD8\u4EF7\u503C TOP:"
      ].concat(top.map((f) => `\u25C6 ${f.meta?.author ?? f.path.split(/[\/]/).pop()} \xB7 \u8D5E ${f.meta?.likes} \xB7 ${f.path.split(/[\/]/).pop()}`)) : []
    ];
    return {
      ok: true,
      text: lines.join("\n")
    };
  }
  /** 面板:定时任务管理(AI 侧走 kb_schedule 工具,同一注册表)。 */
  async rpcScheduleList() {
    return {
      ok: true,
      schedules: JSON.parse(JSON.stringify(this.scheduleMgr.list()))
    };
  }
  async rpcScheduleSet(p) {
    return await this.scheduleMgr.set(p);
  }
  async rpcScheduleRemove(p) {
    return {
      ok: true,
      removed: await this.scheduleMgr.remove(String(p.name ?? ""))
    };
  }
  async rpcScheduleToggle(p) {
    return await this.scheduleMgr.setEnabled(String(p.name ?? ""), Boolean(p.enabled));
  }
  /** demo 用:可强制 FTS-only 的检索。 */
  async searchRaw(query, topk, ftsOnly) {
    const rt = await this.ensureRuntime();
    if ("error" in rt) return {
      ok: false,
      mode: "none",
      hits: [],
      error: rt.error
    };
    let queryVec = null;
    if (!ftsOnly) {
      if (rt.embedder.ready !== null) await rt.embedder.ready;
      queryVec = (await rt.embedder.embed([
        query
      ], true))[0];
    }
    const raw = rt.store.search(queryVec, query, topk);
    const byId = new Map([
      ...this.registry.values()
    ].map((f) => [
      f.id,
      f
    ]));
    return {
      ok: true,
      mode: queryVec === null ? "fts" : "hybrid",
      hits: raw.map((r) => ({
        ref: `${byId.get(r.file)?.path ?? r.file}#${r.chunk}`,
        score: r.score,
        text: r.text
      }))
    };
  }
  /** 队列排空(测试等待用)。 */
  async drain() {
    await this.queueTail;
    await this.saveTail;
  }
  /** 立即释放 zvec 写锁(进程内测试与优雅退出用)。 */
  shutdown() {
    this.store?.close();
    this.store = null;
  }
  // ── 注册表持久化 ─────────────────────────────────────────
  get registryPath() {
    return join3(this.homeDir, "registry.json");
  }
  async loadRegistry() {
    if (this.registryLoaded) return;
    this.registryLoaded = true;
    try {
      const raw = JSON.parse(await readFile4(this.registryPath, "utf8"));
      for (const f of raw.files ?? []) this.registry.set(normKey3(f.path), {
        ...f,
        bytes: f.bytes ?? 0
      });
    } catch {
    }
  }
  saveTail = Promise.resolve();
  /** 尾随式持久化:合并排队写盘,最后一次状态必然落盘。 */
  saveRegistry() {
    this.saveTail = this.saveTail.then(async () => {
      try {
        await mkdir3(this.homeDir, {
          recursive: true
        });
        await writeFile3(this.registryPath, JSON.stringify({
          version: 1,
          files: [
            ...this.registry.values()
          ]
        }, null, 2), "utf8");
      } catch {
      }
    });
  }
};
function entryOf(path) {
  return {
    id: "",
    path: resolve(path),
    chunks: 0,
    status: "indexing",
    importedAt: Date.now(),
    bytes: 0
  };
}
function extLower(name) {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i).toLowerCase();
}
var index_default = ZvecKbService;
export {
  ZvecKbService,
  index_default as default
};
