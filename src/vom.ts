/**
 * canvas VOM 纯函数层(任务 N):eval 桥——把"发现 / 读像素 / 坐标点击"编译成在页面
 * 上下文执行的 JS 字符串,经 `opencli browser eval` 单一通道下发。
 *
 * 为什么用 eval 桥:上游 browser 交互族全部 selector-first(DESIGN-canvas-vom.md §1.1
 * 实测,2026-10-21),canvas 是一张位图——内部无 DOM/AX 目标,click 无处可点;screenshot
 * 无区域参数;而 browser eval 是唯一能触及 canvas 数据面的通道(同文档能力矩阵 #2/#6)。
 * CDP 直连方案(同文档 §3 的 Input.dispatchMouseEvent / captureScreenshot clip)是后续
 * 里程碑,本层刻意只产出"字符串",不触碰 RPC/宿主/文件系统——工具接线与审批门在
 * src/index.ts(registerVomTools)。
 *
 * 生成物契约(三条,违反即测试红):
 * ① 恒为单行表达式(求值即得结果):换行会在 shell 回落形态(命令串按空白切词)放大
 *   脆弱性——browser_do eval 同款先例,不新增第二种形态;
 * ② 数值一律经 JSON.stringify 内插:禁止裸字符串拼接,杜绝把页面输入变成注入面;
 * ③ 页面侧异常自捕获并折成 {"error":…} JSON 返回:裸 throw 在 eval 通道只留下不可
 *   解析的 stderr,拿不到结构化错误(跨域画布 toDataURL 的 SecurityError 是常态路径)。
 * @module dsh-opencli/vom
 */

/** canvas 坐标点击的已知边界:eval 合成事件非 trusted,如实进工具描述,不夸大能力。 */
export const CANVAS_CLICK_UNTRUSTED_NOTE =
  '合成事件 isTrusted=false,校验 isTrusted 的页面(如部分验证码/游戏)不生效——这是 eval 桥的边界,不是 bug'

/**
 * 发现页面上所有 canvas:返回一段页面 JS,求值结果为
 * {"count":N,"canvases":[{index,x,y,w,h,id?}]} JSON 字符串。
 * 坐标系=视口坐标(getBoundingClientRect),与 buildCoordClickJs 的 elementFromPoint
 * 同系配对;id 仅在元素带 id 时携带(省字段,与 CanvasCard 的可选字段约定同款)。
 */
export function buildCanvasDiscoveryJs(): string {
  return "(function(){try{var o=[],l=document.querySelectorAll('canvas');for(var i=0;i<l.length;i++){var r=l[i].getBoundingClientRect();var t={index:i,x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};if(l[i].id)t.id=l[i].id;o.push(t)}return JSON.stringify({count:o.length,canvases:o})}catch(e){return JSON.stringify({error:String(e&&e.message||e)})}})()"
}

/**
 * 读取指定 canvas 内容:返回一段页面 JS,求值结果为
 * {"index":i,"w":画布宽,"h":画布高,"b64":"PNG base64"} JSON 字符串。
 * w/h 取 canvas.width/height(后端缓冲分辨率,与 CSS 矩形是两套数——DPR>1 时缓冲大于
 * 显示尺寸,DESIGN-canvas-vom.md §1.3 #325 的坑位),给模型对图做尺度判断用。
 * 脏索引(非有限数/负数)折成错误表达式而不是默认读 0 号:静默改目标=读错画布还拉
 * 全量 base64,比明确失败更糟。
 */
export function buildCanvasReadJs(canvasIndex: number): string {
  const i = Math.floor(Number(canvasIndex))
  if (!Number.isFinite(i) || i < 0) {
    return `(function(){return JSON.stringify({error:${JSON.stringify(`invalid canvas index: ${String(canvasIndex)}`)}})})()`
  }
  const idx = JSON.stringify(i)
  return `(function(){try{var i=${idx},l=document.querySelectorAll('canvas'),c=l[i];if(!c)return JSON.stringify({error:'no canvas at index '+i+' (page has '+l.length+')'});var u=c.toDataURL('image/png');return JSON.stringify({index:i,w:c.width,h:c.height,b64:u.slice(u.indexOf(',')+1)})}catch(e){return JSON.stringify({error:String(e&&e.message||e)})}})()`
}

/**
 * 坐标点击:返回一段页面 JS,对 elementFromPoint(x,y) 命中的元素合成 click(),求值结果
 * {"clicked":true,"tag":…,"id":…} 或 {"clicked":false,"error":…}。坐标系=视口坐标,与
 * buildCanvasDiscoveryJs 同系;页面滚动后旧坐标失效,应重新 discover。
 * 注意顶层键不用 "ok":插件侧 unwrapCli2(src/index.ts)按 `{"ok"` 前缀识别 CLI 2.0
 * 信封,页面返回值若以 {"ok" 开头会被误当信封拆包吃掉 stdout——键名错开是最便宜的免疫。
 * 脏坐标(非有限数)折成错误表达式,不下发注定点错的代码。
 */
export function buildCoordClickJs(x: number, y: number): string {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return `(function(){return JSON.stringify({error:${JSON.stringify(`invalid coordinates x=${String(x)} y=${String(y)}`)}})})()`
  }
  return `(function(){try{var e=document.elementFromPoint(${JSON.stringify(x)},${JSON.stringify(y)});if(!e)return JSON.stringify({clicked:false,error:'no element at point'});e.click();return JSON.stringify({clicked:true,tag:e.tagName,id:e.id||null})}catch(e){return JSON.stringify({error:String(e&&e.message||e)})}})()`
}

/** buildRegionCropJs 的结果:cropped=false 表示按设计走"全图+坐标标注"档。 */
export interface RegionCropResult {
  /** 是否真的裁出了区域图(false=返回全图) */
  cropped: boolean
  /** 回传给调用方的图像 base64(cropped=false 时与入参逐字相同) */
  imageB64: string
  /** 坐标标注:请求区域 + 坐标系说明,拼进工具输出让模型自己在全图上定位 */
  note: string
}

/**
 * 区域裁剪决策(Node 侧,不走 eval;命名沿用 build*Js 家族保持任务一致性,但它不是
 * 页面脚本)。依赖树无 sharp(2026-10-26 实测 node_modules 与 package.json 均无),手写
 * PNG 解码+重编码(zlib 解压/像素行过滤/再压缩)是百行级高风险代码,收益只是省一点
 * 上下文——按设计落"不裁剪,全图返回+坐标标注"档:把请求区域与坐标系原样带给调用
 * 方。若未来引入 sharp,在此函数内补真裁剪即可,签名不用动。
 */
export function buildRegionCropJs(screenshotB64: string, x: number, y: number, w: number, h: number): RegionCropResult {
  return {
    cropped: false,
    imageB64: String(screenshotB64 ?? ''),
    note: `未裁剪(依赖树无 sharp,按设计走全图档):请求区域 x=${String(x)},y=${String(y)},w=${String(w)},h=${String(h)}(视口坐标);返回全图,请按该坐标自行定位`,
  }
}
