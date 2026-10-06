import { defineConfig } from 'vitest/config'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 测试隔离:插件状态与运行轨迹都写到临时目录,绝不碰 ~/.dsh/ 下的真实用户数据
// (曾发生单测定时任务写进真实状态文件的污染事故;trace 同理隔离)
export default defineConfig({
  test: {
    env: {
      DSH_OPENCLI_STATE: join(tmpdir(), `dsh-opencli-test-state-${process.pid}.json`),
      DSH_OPENCLI_REPORTS_DIR: join(tmpdir(), `dsh-opencli-test-reports-${process.pid}`),
      DSH_OPENCLI_TRACE_DIR: join(tmpdir(), `dsh-opencli-test-traces-${process.pid}`),
    },
  },
})
