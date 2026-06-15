#!/usr/bin/env tsx
/**
 * 独立 worker 进程：轮询任务队列 + 定时调度
 *
 * 用法：
 *   npm run dev:worker
 *   npm run dev:worker -- --dry-run
 *   npm run worker:dry-run   # 处理一条后退出
 */
import { bootstrapEnvSync } from '../src/config.js';
import { processOneJob } from '../src/jobs/worker.js';
import { recoverRunningJobsOnStartup } from '../src/jobs/queue.js';
import { runSchedulerTick } from '../src/jobs/scheduler.js';
import { toErrorMessage } from '../src/lib/errors.js';

bootstrapEnvSync();

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const once = args.includes('--once');
const pollMs = 3000;

/** dry-run 单条验证：队列为空时自动为 test-xiaoshuo 入队写下一章 */
async function ensureDryRunJob(): Promise<void> {
  if (!dryRun || !once) return;
  const { listJobs, enqueueJob } = await import('../src/jobs/queue.js');
  const pending = (await listJobs(100)).some((j) => j.status === 'pending');
  if (!pending) {
    await enqueueJob('test-xiaoshuo', 'write-next-chapter', { targetWords: 2000 });
    console.log('[worker] dry-run: 已为 test-xiaoshuo 入队 write-next-chapter');
  }
}

async function loop(): Promise<void> {
  await runSchedulerTick();

  const job = await processOneJob({ dryRun, verbose: true });
  if (job) {
    console.log(`[worker] 完成任务 ${job.id} (${job.type})`);
  }

  if (once) {
    process.exit(0);
  }
}

console.log(`[worker] 启动 poll=${pollMs}ms dryRun=${dryRun} once=${once}`);

const recovered = await recoverRunningJobsOnStartup();
if (recovered.length > 0) {
  console.log(
    `[worker] 启动恢复 ${recovered.length} 个遗留 running 任务：` +
      recovered.map((job) => `${job.id}(${job.type})`).join(', ')
  );
}

if (once) {
  await ensureDryRunJob();
  await loop();
} else {
  setInterval(() => {
    loop().catch((err) => console.error('[worker] 循环错误:', toErrorMessage(err)));
  }, pollMs);
}
