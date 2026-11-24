// cron 本地校验 + 下次触发预览(0.2.0 C-H7;从 client.ts 抽出为纯模块可测)。
// 语义与服务端 cronMatches 同款 5 段:*、数字、逗号、*/步长;域界 分0-59 时0-23 日1-31
// 月1-12 周0-7。预览逐分钟扫描上限 90 天,超过返回 null(UI 不渲染预览行,不撒谎)。
// 服务端仍是权威,此处只是提交前提示。

const CRON_BOUNDS: Array<[number, number]> = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]]

export function cronValid(cron: string): boolean {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return false
  return parts.every((spec, i) => {
    const [lo, hi] = CRON_BOUNDS[i]!
    return spec.split(',').every((tok) => {
      if (tok === '*') return true // 0.2.0 修:通配符此前 Number('*')=NaN 误判非法(实抓于真机预览)
      const step = tok.startsWith('*/')
      const n = Number(step ? tok.slice(2) : tok)
      return Number.isFinite(n) && Number.isInteger(n) && n >= (step ? 1 : lo) && n <= hi
    })
  })
}

export function nextCronFire(cron: string, from = new Date()): Date | null {
  if (!cronValid(cron)) return null
  const parts = cron.trim().split(/\s+/)
  const matchField = (spec: string, v: number, lo: number): boolean => {
    if (spec === '*') return true
    if (spec.startsWith('*/')) { const step = Number(spec.slice(2)); return Number.isFinite(step) && step > 0 && (v - lo) % step === 0 }
    return spec.split(',').some((tok) => Number(tok) === v)
  }
  const d = new Date(from.getTime())
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() + 1)
  for (let i = 0; i < 90 * 24 * 60; i++) {
    if (matchField(parts[0]!, d.getMinutes(), 0) && matchField(parts[1]!, d.getHours(), 0)
      && matchField(parts[2]!, d.getDate(), 1) && matchField(parts[3]!, d.getMonth() + 1, 1)
      && matchField(parts[4]!, d.getDay(), 0)) return d
    d.setMinutes(d.getMinutes() + 1)
  }
  return null
}
