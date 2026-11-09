import { defineConfig } from 'vitest/config'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 测试隔离:插件状态与运行轨迹都写到临时目录,绝不碰 ~/.dsh/ 下的真实用户数据
// (曾发生单测定时任务写进真实状态文件的污染事故;trace 同理隔离)
export default defineConfig({
  test: {
    // 门禁按数组序执行、先于一切用例:①知识卡⇄CLI manifest 漂移门禁挂首位(D#10,漂移即整轮拒跑)
    // ②lib 捆绑陈旧守卫(改 src 忘重建即拒跑)
    globalSetup: ['./tests/knowledge-gate-setup.ts', './tests/lib-staleness-setup.ts'],
    env: {
      DSH_OPENCLI_STATE: join(tmpdir(), `dsh-opencli-test-state-${process.pid}.json`),
      DSH_OPENCLI_REPORTS_DIR: join(tmpdir(), `dsh-opencli-test-reports-${process.pid}`),
      DSH_OPENCLI_TRACE_DIR: join(tmpdir(), `dsh-opencli-test-traces-${process.pid}`),
      // D#5 事件历史落盘隔离:pushIngestEvent 追加写的 jsonl 指向临时文件,绝不写进真实 ~/.dsh
      DSH_OPENCLI_EVENTS_FILE: join(tmpdir(), `dsh-opencli-test-events-${process.pid}.jsonl`),
      // 直连总闸测试默认关:shell 桩测试断言 CLI argv 形态,直连层会先截走命令打到真 daemon
      // (compose 单测自管 fetch 桩,不经服务层,不受此闸影响)
      DSH_OPENCLI_DIRECT: '0',
      // 0.1.2 P0:测试环境零拟人延迟/挑战等待极短(调度链路单测不等真实时钟)
      DSH_OPENCLI_JITTER_MAX_MS: '0',
      DSH_OPENCLI_CHALLENGE_WAIT_MS: '10',
      // #59 读写分频:测试环境关写轨间隔(同实例连续写的用例不等真实 3s;分频语义专项用例自设 env)
      DSH_OPENCLI_WRITE_MIN_DELAY_MS: '0',
      DSH_OPENCLI_SNAPSHOTS_DIR: join(tmpdir(), `dsh-opencli-test-snapshots-${process.pid}`),
    },
  },
})
