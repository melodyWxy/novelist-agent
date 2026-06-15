/**
 * 生产 worker 入口：轮询任务队列 + 执行定时调度。
 *
 * 开发态仍可使用 scripts/worker.ts；容器/远端部署使用编译后的 dist/worker.js，
 * 避免生产镜像依赖 tsx 等 devDependency。
 */
import { bootstrapEnvSync } from './config.js';
import { processOneJob } from './jobs/worker.js';
import { recoverRunningJobsOnStartup } from './jobs/queue.js';
import { runSchedulerTick } from './jobs/scheduler.js';

bootstrapEnvSync();

const pollMs = Number(process.env.WORKER_POLL_MS ?? '3000');

async function loop(): Promise<void> {
  await runSchedulerTick();

  const job = await processOneJob({ verbose: true });
  if (job) {
    console.log(`[worker] 完成任务 ${job.id} (${job.type})`);
  }
}

console.log(`[worker] 启动 poll=${pollMs}ms`);

const recovered = await recoverRunningJobsOnStartup();
if (recovered.length > 0) {
  console.log(
    `[worker] 启动恢复 ${recovered.length} 个遗留 running 任务：` +
      recovered.map((job) => `${job.id}(${job.type})`).join(', ')
  );
}

setInterval(() => {
  loop().catch((err) => console.error('[worker] 循环错误:', err));
}, pollMs);

loop().catch((err) => console.error('[worker] 首次循环错误:', err));
