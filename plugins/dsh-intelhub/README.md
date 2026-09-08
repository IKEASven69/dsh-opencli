# dsh-intelhub · 情报站

**第一个 zvec 原生情报站** —— 把刷到的信息,变成问得到的知识。

> 社媒采集 / 文件夹 / 网页 / 随手贴 → 自动沉淀 → 语义+关键词混合检索带出处 → Obsidian 反哺
> 零守护进程 · 零 API key · 文档不出本机

## 为什么需要它

已有的知识库插件是**仓库**:你手动拖文档,关键词搜索,用完留在插件里。
dsh-intelhub 是**活水**:信息自动流进来(采集脚本落盘即入库),按**意思**可搜(搜"怎么配置超时"能找到写"30 秒无响应则中断"的文档),元数据可过滤(只要宝玉xp 的精选层、赞过千),还能**流出去**(一键导出回 Obsidian)。

真实库实测(6300+ 篇微博采集,2.6 万块):换说法查询 6/6 第一名命中原帖,延迟 100-450ms。

## 用户故事

| 场景 | 做法 |
|---|---|
| "把 D:\knowledge-base 喂给你" | `kb_watch` 注册常驻目录,采集脚本每 3 小时落盘的内容**自动**增量入库 |
| "之前刷到过讲内容付费悖论的,说了啥" | `kb_search` 语义命中,回答带 作者/赞数/文件#块号 |
| 调研做完,结论别丢 | `kb_note` 写入判断;下次问"我的判断是什么"直接召回 |
| "把付费相关的导出到 Obsidian" | `kb_export` 落盘普通 md,Obsidian 零插件直接索引 |
| 按发博节奏定时扫描 | `kb_schedule` 每天 09:00(或任意间隔),重启不丢 |

## 十个工具

`kb_import`(文件/文件夹,Obsidian 库直指) · `kb_watch`(常驻目录自动跟随) · `kb_import_url`(网页存档) · `kb_note`(直接写文本) · `kb_search`(混合检索+标量过滤) · `kb_today`(今日概览) · `kb_evidence`(判断找证据) · `kb_export`(反哺导出) · `kb_schedule`(定时任务) · `kb_list`/`kb_delete`

设置面板「情报站」:拖拽导入、常驻目录管理、定时任务、作者/阶段过滤检索、文件管理。

## 与同类插件的差别

| | dsh-intelhub | 通用文档库 | 对话记忆类 |
|---|---|---|---|
| 数据从哪来 | **自动长**(采集管道+落盘监听) | 手动拖 | 自动(但记对话) |
| 检索 | **语义+关键词+标量过滤** | 关键词 | 语义(记忆向) |
| 数据形态 | 带元数据的活信息 | 静态文件 | 会衰减的记忆 |
| 出口 | **反哺 Obsidian 等工作流** | 孤岛 | — |

## 安装

```sh
dsh plugin add dsh-intelhub
```

首次导入自动下载本地向量化模型(约 30MB)到 `~/.dsh/dsh-intelhub/`,之后全程离线。

## 架构

```
采集(opencli/rotate 定时) ─┐
文件夹 / Obsidian 库        ├→ 抽取(md/txt/pdf/docx)→ 标题边界分块
网页 URL / 对话粘贴        ─┘      → 本地向量化(e5-small,去语法嵌入)
                                   → zvec 进程内存储(WAL,标量字段)
                                   → RRF 混合检索(向量 0.75 + jieba FTS 0.25)
                                   → 带来源返回 ──→ kb_export 反哺
```

- workspace 常驻目录:fs.watch 实时 + 5 分钟兜底轮询,双保险增量
- frontmatter 标量(author/source/stage/tags/likes)进索引,可组合过滤
- 引擎(skill 组合工作流)与数据(md 真相源)三层解耦,可持续演进

- **安装提示(pnpm 用户)**:若 `dsh plugin add` 报 ERR_PNPM_IGNORED_BUILDS,在 profile 的 pnpm-workspace.yaml 追加 `ignoredBuiltDependencies: [@zvec/zvec, onnxruntime-node, protobufjs, sharp]`;弱网环境可再加 `supportedArchitectures: os/cpu/libc = current` 跳过跨平台包下载

## 已知限制

- 索引目录版本升级(schema 变更)会触发一次重建,旧目录自动弃用
- 双机同时写同一索引目录不支持(索引目录随仓走的设计在路线图)
- 极难例(运维近邻概念如"超时"vs"回滚")33M 本地模型区分度为零,嵌入层可配置升级

## License

MIT
