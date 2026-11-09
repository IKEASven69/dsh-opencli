/**
 * 本插件版本单一来源(package.json 同源,bundle 内联——发布脚本管同步)。
 * 独立成模块:lib/index.js(服务层自检)与 lib/client.js(面板「版本与更新」卡)各自
 * 打包时都内联同一常量;此前面板卡把写入当时的当前版本写死在组件里,升版不同步,
 * 出现过「同屏自检卡 v0.1.2 / 更新卡 v0.4.1」互相矛盾的陈年残留。
 * @module dsh-opencli/version
 */
export const PLUGIN_VERSION = '0.1.2'
