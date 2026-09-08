# dsh-intelhub:个人情报站

把**刷到的信息变成问得到的知识**:社媒采集/文件夹/网页/随手贴 → 自动沉淀为本地知识库 → agent 语义+关键词混合检索,回答带出处 → 可反哺导出回 Obsidian。零守护进程、零 API key、文档不出本机。

## 何时使用

- 用户提到"我的文档/笔记/手册/资料/采集",希望 agent 查内容
- 用户说"刷到过/收藏过/记得看过"某内容——先 kb_search 按意思找,别信关键词记忆
- 用户给出文件夹(如 knowledge-base、Obsidian 库)——kb_watch 注册为常驻目录,落盘自动入库
- 调研结束要沉淀结论——kb_note 写入;要带回笔记软件——kb_export 导出
- 复盘——kb_today 看今日采集与高价值帖,kb_evidence 给判断找证据

## 工具(10+1 个)

| 工具 | 用途 |
|---|---|
| `kb_import` | 导入文件或**整个文件夹**(md/txt/pdf/docx/代码,支持 `~`)。后台建索引 |
| `kb_watch` | **注册常驻目录**:此后新增/变更自动增量索引(采集脚本落盘即入库) |
| `kb_import_url` | 网页存档:抓正文 → 入库,来源显示为 URL |
| `kb_note` | 直接写文本:对话长文、调研结论、其他工具抓到的内容 |
| `kb_search` | 混合检索 + **可选过滤** author/stage/tag/likesMin。返回 `来源#块号` |
| `kb_today` | 今日采集概览:新增数、高价值 TOP(按赞)、raw 待分诊存量 |
| `kb_evidence` | 给一条判断找证据:语义检索归组,证据全带 原文#块号 |
| `kb_export` | 导出检索结果为 Markdown 到**用户指定目录**(如 Obsidian 库) |
| `kb_schedule` | 定时任务:set/list/remove/enable/disable(如每天 09:00 扫描采集目录)。重启不丢 |
| `kb_list` / `kb_delete` | 清单 / 移除(只删索引,不动原文件) |


## 数据源配方(opencli 适配器 × 知识库)

采集执行在用户的采集管道(rotate/脚本);agent 侧的职责是**按需抓取 + 落库**。可用渠道(opencli 适配器现成):

| 渠道 | 抓法 | 落库 |
|---|---|---|
| X / Twitter | `opencli twitter <cmd>` | `kb_note("X-{账号}-{日期}", 正文)` |
| B站 | `opencli bilibili <cmd>`(UP主动态/视频简介) | `kb_note("B站-{UP主}-{标题}", …)` |
| 掘金 / 36kr / HN | 对应适配器文章页 | `kb_import_url` 或 `kb_note` |
| arxiv / GitHub trending | arxiv / github-trending 适配器 | `kb_import_url`(论文/仓库页) |
| 公众号 / 知乎 / 少数派 | wechat-channels / zhihu / sspai 适配器 | 同上 |

落盘约定:`{渠道}-{作者}-{日期}` 标题 + 正文原样;frontmatter 规范见用户知识库的 collections/README。

## 分诊辅助(语义增强)

规则分诊(triage.ts 的 明确 promote / 明确 skip)之外,agent 可用语义排序补盲区:
`kb_search <候选主题> stage:raw likesMin:500` —— 把高互动且与已沉淀判断相关的 raw 帖排到人工队列最前。

## 工作流拓展

引擎只提供上述原子;新工作流 = 一份 SKILL.md 把原子串成流程 + 选触发器(手动/定时/落盘事件)。示例:每日简报、判断自动验证、选题雷达——都不需要改引擎。

## 要点

- **元数据即过滤器**:采集文件的 frontmatter(author/source/stage/tags/likes)进索引,kb_search 可组合过滤("只要宝玉xp 的精选层、赞过千")
- **增量与去重**:内容哈希级,重复导入只处理新增/变更;等长编辑也能识别
- **降级安全**:模型未就绪时 kb_search 自动退化为关键词检索并在结果说明;单文件失败不阻断整批
- **隐私边界**:全部本机;原文永不修改;导出只写用户指定目录

## 不做什么

- 不做对话记忆(hindsight/mnemon/ReMe 的领域)——只管用户主动喂进来的外部信息
- 不做文件管理器(重命名/移动是文件系统与 git 的事)——只管索引与检索
- 不上传任何数据,不需要任何 API key
