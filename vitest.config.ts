import { defineConfig } from 'vitest/config'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 测试隔离:插件状态与运行轨迹都写到临时目录,绝不碰 ~/.dsh/ 下的真实用户数据
// (曾发生单测定时任务写进真实状态文件的污染事故;trace 同理隔离)
export default defineConfig({
  test: {
    globalSetup: './tests/lib-staleness-setup.ts',
    env: {
      DSH_OPENCLI_STATE: join(tmpdir(), `dsh-opencli-test-state-${process.pid}.json`),
      DSH_OPENCLI_REPORTS_DIR: join(tmpdir(), `dsh-opencli-test-reports-${process.pid}`),
      DSH_OPENCLI_TRACE_DIR: join(tmpdir(), `dsh-opencli-test-traces-${process.pid}`),
      // 直连总闸测试默认关:shell 桩测试断言 CLI argv 形态,直连层会先截走命令打到真 daemon
      // (compose 单测自管 fetch 桩,不经服务层,不受此闸影响)
      DSH_OPENCLI_DIRECT: '0',
      // 0.1.2 P0:测试环境零拟人延迟/挑战等待极短(调度链路单测不等真实时钟)
      DSH_OPENCLI_JITTER_MAX_MS: '0',
      DSH_OPENCLI_CHALLENGE_WAIT_MS: '10',
      DSH_OPENCLI_SNAPSHOTS_DIR: join(tmpdir(), `dsh-opencli-test-snapshots-${process.pid}`),
    },
  },
})
