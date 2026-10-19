# AGENT_INSTALL.md · 让你的 dsh 替你安装 dsh-opencli

> 用户请把这句话发给你的 dsh:
> **"请按 https://github.com/IKEASven69/dsh-opencli/blob/opencli-release/AGENT_INSTALL.md 的步骤安装 dsh-opencli,装完跑 opencli_doctor 自检并报告结果。"**

你好,agent。按下面的顺序装,每步先检测再动手,失败就把报错原样告诉用户,不要瞎试。

## 0. 前置检测(只读)

```sh
node --version        # 需要 ≥18
dsh --version         # 确认 dsh 在
opencli --version     # 已有则跳过第 1 步
```

## 1. 装 opencli CLI(若已装则跳过)

```sh
npm i -g @jackwener/opencli
opencli daemon restart
```

注意:
- 若 npm 报 install-scripts 拦截,按提示加 `--allow-scripts=@jackwener/opencli` 重跑。
- Windows 下 dsh 的 shell 是 PowerShell,涉及路径时 `.cmd` 结尾的 shim 才有效。

## 2. 装 BrowserBridge 扩展(🔴 这一步需要用户本人操作,你只能给指引)

扩展驱动用户带登录态的真实浏览器,agent 无法替用户点浏览器的扩展页。请对用户说:

> 请打开 https://github.com/jackwener/OpenCLI/releases 下载 opencli-extension-*.zip 并解压,然后在 Chrome/Edge 打开扩展管理页(chrome://extensions 或 edge://extensions),开"开发者模式",点"加载解压缩的扩展"选解压目录。装好回复我。

用户确认后,你运行 `opencli doctor` 验证:看到 `[OK] Extension: connected` 即通过。

## 3. 处理多浏览器档案(常见坑)

若 doctor 报 "Multiple Browser Bridge profiles are connected":

```sh
opencli profile list          # 看哪个是用户带登录态的浏览器
opencli profile use <档案名>   # 设为默认
```

若 `profile use` 后仍报多档案冲突,是 CLI 1.8.6 的 bug,升级即可:

```sh
npm i -g @jackwener/opencli@latest && opencli daemon restart
```

## 4. 安装插件

```sh
dsh plugin add IKEASven69/dsh-opencli
```

安装后**必须重启 dsh**(长驻进程不热加载插件):
- dsh 桌面版:退出应用重开;
- dsh web:重启对应 daemon 进程。

## 5. 自检与汇报

装完调用 **`opencli_doctor`** 工具(本插件注册),或跑 `opencli doctor`。四层全绿后,向用户汇报:

- 各层状态(CLI/daemon/BrowserBridge/插件)
- 冒烟建议:让用户在对话里说"用 site v2ex hot 拉一下 V2EX 热榜"(无需登录即可验证全链路);需要登录态的站点(知乎/B站等)先在浏览器登录,再在 dsh 设置 →「浏览器代理」面板点「重新巡检」。

## 常见失败速查

| 症状 | 处置 |
|---|---|
| `BROWSER_CONNECT / extension not connected` | 第 2 步没做或浏览器没开;`opencli daemon restart` 后重试 |
| `Multiple Browser Bridge profiles` | 第 3 步 |
| 命令返回 `[]` 且 P=0.00 | 该站未登录(登录墙),让用户在浏览器登录后重试 |
| Windows 下 CLI 找不到 | 用 `where opencli` 找 `.cmd` shim;或设 `DSH_OPENCLI_BIN` 指向它 |
