# dsh-opencli 能力面对账(第三方静态扫描口径)

> 背景:dsh-xray 等仓库级静态扫描给本仓库打出 7 项敏感标记,综合评级 C3。本文逐条对账:每项标记是什么、在**发布物**(npm 包)中的真实形态、为什么存在,并给出一条可当场复现的验证命令。所有数字的取证时点为 2026-11-22(opencli-release 分支);仓库会演进,请以命令实测为准,勿引用快照值。

## 一、核心事实:三项计数标记全部来自开发脚手架目录,发布物不含

xray 的 7 项标记中,`eval`、`base64`、`system commands` 三类的计数对象是仓库树里的 `.build-tools/` 目录——那是本仓库的**开发脚手架**(本机构建脚本、真机演练工具、性能基准),服务于开发过程,不属于插件运行时。

npm 发布物由 `package.json` 的 `files` 白名单决定,只含 `lib/`、`knowledge/`、`SKILL.md`、`bin/`、文档与补丁清单,**不含 `.build-tools/`、`tests/`、`docs/`**。复核命令:

```sh
npm pack --dry-run          # 列出发布物全部文件(14 个,2026-11-22 时点),无 .build-tools
```

## 二、逐项对账

| # | 扫描标记 | 发布物中的真实形态 | 性质 | 复现命令 |
|---|---|---|---|---|
| 1 | patch runtime | `cordis.patch.yml`:宿主(dsh)官方声明的插件补丁清单机制,内容为公开可读的 YAML,随包分发 | 宿主 sanctioned 扩展点 | `cat cordis.patch.yml` |
| 2 | rewrite systemPrompt | 插件向宿主 systemPrompt 注册「适配器蒸馏目录」section——插件的核心功能:让 agent 首轮即选对站点命令 | 声明式注册,非改写宿主行为 | `grep -n "systemPrompt.section" lib/index.js` |
| 3 | gates tool execution | 写操作审批门:发帖/删评类写命令默认弹审批窗,允许才执行;权限不明按写处理(fail-closed)。这是本插件的**安全特性** | 防护层,非劫持 | README「安全不变量」节 |
| 4 | system commands ×51 | 全部命中 `.build-tools/`(39 个文件,2026-11-22 时点)。发布物内的进程创建仅 **4 处 `spawn`**,目标为经 `resolveBin` 定位的 OpenCLI CLI 及宿主 node——插件的本质就是驱动该 CLI | 脚手架误计 | `grep -c "\.spawn(" lib/index.js` |
| 5 | eval ×7 | 发布物内 `eval(` 命中 **0**(lib 中其余 `exec(` 命中为 `RegExp.prototype.exec`,是正则匹配不是进程执行) | 脚手架误计 | `grep -rn "\beval(" lib/ \| wc -l` |
| 6 | base64 ×5 | 发布物内 **1 处**,用途是知识库分页游标的编解码(`encodeCursor`/`decodeCursor`,无秘密、无混淆) | 脚手架误计 + 1 处正当用途 | `grep -n "base64url" lib/index.js` |

## 三、发布物边界

- 安装面:`npm i -g @cold777/dsh-opencli` 或 GitHub tarball;两者内容以 `files` 白名单为准(见 §一)。
- 运行时进程面:spawn 驱动 OpenCLI CLI(`--version`/`daemon status`/site 命令等);浏览器操作经 OpenCLI daemon 与 BrowserBridge 扩展在用户已登录的真实浏览器内完成,插件本身不内嵌浏览器内核。
- 写操作面:全部经审批门(见 §二#3);读操作只读,不上传本机数据(数据面 = 命令输出落本机快照/轨迹目录)。

## 四、对扫描器的建议(待用户批准后另行反馈上游)

仓库树 ≠ 发布物:对 npm 分发的插件,能力面扫描应以 `npm pack` 产物为对象。以仓库树计数会把开发脚手架计成插件能力,得出与真实安装面不符的评级。此反馈涉及向第三方仓库提交 issue/PR,按本仓库的对外提交纪律,须经仓库所有者逐字批准后才会发出——本文档仅备料,不代提。
