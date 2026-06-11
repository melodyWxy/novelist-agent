#!/usr/bin/env tsx
/**
 * 指数退避延迟重试 smoke test
 */
import { bootstrapEnvSync } from '../src/config.js';
import {
  DEFAULT_RETRY_BACKOFF,
  computeRetryDelayMs,
  computeRetryRunAt,
  isJobDue,
} from '../src/jobs/retry-backoff.js';
import {
  enqueueJob,
  getJob,
  retryJob,
  selectNextPendingJob,
  updateJob,
} from '../src/jobs/queue.js';
import type { Job } from '../src/jobs/types.js';

bootstrapEnvSync();

const NO_JITTER = { baseMs: 10_000, maxMs: 80_000, jitter: false };
const novelId = `retry-backoff-test-${Date.now()}`;
const now = new Date().toISOString();

function stubJob(partial: Partial<Job> & Pick<Job, 'id' | 'novelId'>): Job {
  return {
    type: 'write-next-chapter',
    payload: {},
    status: 'pending',
    createdAt: now,
    attempt: 1,
    maxAttempts: 1,
    ...partial,
  };
}

async function main() {
  const d2 = computeRetryDelayMs(2, NO_JITTER);
  const d3 = computeRetryDelayMs(3, NO_JITTER);
  const d4 = computeRetryDelayMs(4, NO_JITTER);
  if (d2 !== 10_000 || d3 !== 20_000 || d4 !== 40_000) {
    console.error('退避公式错误', { d2, d3, d4 });
    process.exit(1);
  }
  console.log('✓ computeRetryDelayMs 指数序列');

  const futureRunAt = new Date(Date.now() + 60_000).toISOString();
  const future = stubJob({ id: 'f1', novelId: 'n1', runAt: futureRunAt });
  const ready = stubJob({ id: 'r1', novelId: 'n2' });
  const picked = selectNextPendingJob([future, ready]);
  if (!picked || picked.id !== 'r1') {
    console.error('selectNextPendingJob 未跳过未来任务', picked?.id);
    process.exit(1);
  }
  console.log('✓ selectNextPendingJob 跳过未到 runAt 的任务');

  const failed = await enqueueJob(novelId, 'narrative-cycle', { tickDays: 0 }, {
    maxAttempts: 3,
  });
  await updateJob(failed.id, {
    status: 'failed',
    error: 'smoke',
    finishedAt: new Date().toISOString(),
  });

  const beforeRetry = Date.now();
  const retried = await retryJob(failed.id);
  if (!retried.runAt || retried.attempt !== 2) {
    console.error('retryJob 未设置 runAt 或 attempt', retried);
    process.exit(1);
  }
  const actualDelay = new Date(retried.runAt).getTime() - beforeRetry;
  if (actualDelay < 0 || actualDelay > DEFAULT_RETRY_BACKOFF.maxMs + 2_000) {
    console.error('retryJob runAt 超出退避上限', {
      maxMs: DEFAULT_RETRY_BACKOFF.maxMs,
      actualDelay,
    });
    process.exit(1);
  }
  if (actualDelay > 0 && isJobDue(retried, beforeRetry)) {
    console.error('retry 任务在 runAt 之前被判定为 due');
    process.exit(1);
  }
  console.log('✓ retryJob 按 attempt 写入 runAt');

  const patched = await getJob(retried.id);
  if (!patched) {
    process.exit(1);
  }
  const dueIso = new Date(Date.now() - 1_000).toISOString();
  await updateJob(patched.id, { runAt: dueIso });
  const dueJob = await getJob(patched.id);
  const pickedRetry = selectNextPendingJob([dueJob!], Date.now());
  if (!pickedRetry || pickedRetry.id !== patched.id) {
    console.error('到期重试任务未被选中');
    process.exit(1);
  }
  console.log('✓ runAt 到期后可被选中');

  const runAtIso = computeRetryRunAt(3, NO_JITTER, 1_700_000_000_000);
  if (runAtIso !== new Date(1_700_000_020_000).toISOString()) {
    console.error('computeRetryRunAt 错误', runAtIso);
    process.exit(1);
  }
  console.log('✓ computeRetryRunAt 固定时钟');

  await updateJob(patched.id, {
    status: 'completed',
    finishedAt: new Date().toISOString(),
    resultSummary: 'cleanup',
  });

  console.log('\n指数退避延迟重试 smoke test 通过');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
