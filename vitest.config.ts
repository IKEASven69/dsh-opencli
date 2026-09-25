import { defineConfig } from 'vitest/config'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 测试隔离:插件状态写到临时文件,绝不碰 ~/.dsh/dsh-opencli-state.json
// (曾发生单测定时任务写进真实状态文件的污染事故)
export default defineConfig({
  test: {
    env: {
      DSH_OPENCLI_STATE: join(tmpdir(), `dsh-opencli-test-state-${process.pid}.json`),
    },
  },
})
