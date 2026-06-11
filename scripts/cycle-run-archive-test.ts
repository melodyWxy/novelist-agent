#!/usr/bin/env tsx
/**
 * 周期链历史归档 smoke test
 */
import { randomUUID } from 'node:crypto';
import { bootstrapEnvSync } from '../src/config.js';
import { startCycleChain } from '../src/narrative/cycle-chain.js';
import { processOneJob } from '../src/jobs/worker.js';
import * as narrativeStore from '../src/narrative/store.js';
import * as store from '../src/novel/store.js';
import type { CycleRun } from '../src/narrative/types.js';

bootstrapEnvSync();

const novelId = 'test-xiaoshuo';

async function cleanupActiveCycleChain(): Promise<void> {
  await narrativeStore.archiveTerminalCycleRun(novelId);
  const { listJobs, updateJob } = await import('../src/jobs/queue.js');
  for (const j of await listJobs(200)) {
    if (
      j.novelId === novelId &&
      j.payload.cycleRunId &&
      (j.status === 'pending' || j.status === 'running')
    ) {
      await updateJob(j.id, {
        status: 'completed',
        finishedAt: new Date().toISOString(),
        resultSummary: 'archive-test cleanup',
      });
    }
  }
}

function stubTerminalRun(status: 'completed' | 'failed'): CycleRun {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    novelId,
    startedAt: now,
    updatedAt: now,
    status,
    config: {
      tickDays: 1,
      autoDiscoverCollisions: true,
      maxCollisions: 6,
    },
    stages: {
      tick: { status: 'completed', finishedAt: now },
      collision: { status: 'completed', finishedAt: now },
      plan: { status: status === 'completed' ? 'completed' : 'failed', finishedAt: now },
      write: {
        status: status === 'completed' ? 'completed' : 'pending',
        finishedAt: status === 'completed' ? now : undefined,
      },
    },
    collisionTitle: status === 'completed' ? '归档测试碰撞' : undefined,
    chapterNumber: status === 'completed' ? 1 : undefined,
    failedStage: status === 'failed' ? 'plan' : undefined,
    lastError: status === 'failed' ? 'smoke' : undefined,
  };
}

async function runOneCycleChain(): Promise<void> {
  await cleanupActiveCycleChain();
  await startCycleChain(novelId, {
    tickDays: 1,
    autoDiscoverCollisions: true,
    targetWords: 1200,
  });

  let steps = 0;
  while (steps < 8) {
    const job = await processOneJob({ dryRun: true, verbose: false });
    if (!job) {
      const active = await narrativeStore.loadCycleRun(novelId);
      if (!active) break;
      if (active.status === 'completed') break;
      throw new Error(`队列空但周期链未完成: ${active.status}`);
    }
    steps++;
    const active = await narrativeStore.loadCycleRun(novelId);
    if (!active) break;
  }
}

async function main() {
  await cleanupActiveCycleChain();

  if (!(await store.novelExists(novelId))) {
    console.error(`作品 ${novelId} 不存在`);
    process.exit(1);
  }
  if (!(await narrativeStore.hasUniverse(novelId))) {
    console.error('缺少叙事宇宙');
    process.exit(1);
  }

  const completedStub = stubTerminalRun('completed');
  await narrativeStore.saveCycleRun(novelId, completedStub);
  const archivedCompleted = await narrativeStore.archiveTerminalCycleRun(novelId);
  if (!archivedCompleted || archivedCompleted.id !== completedStub.id) {
    console.error('completed 归档失败');
    process.exit(1);
  }
  if (await narrativeStore.loadCycleRun(novelId)) {
    console.error('归档后 cycle-run.json 应已清除');
    process.exit(1);
  }
  let history = await narrativeStore.loadCycleRunHistory(novelId);
  if (!history.runs.some((r) => r.id === completedStub.id)) {
    console.error('历史未包含 completed 记录');
    process.exit(1);
  }
  console.log('✓ completed 周期链归档并清除当前文件');

  const failedStub = stubTerminalRun('failed');
  await narrativeStore.saveCycleRun(novelId, failedStub);
  await narrativeStore.archiveTerminalCycleRun(novelId);
  history = await narrativeStore.loadCycleRunHistory(novelId);
  if (!history.runs.some((r) => r.id === failedStub.id && r.status === 'failed')) {
    console.error('历史未包含 failed 记录');
    process.exit(1);
  }
  console.log('✓ failed 周期链归档');

  const beforeCount = history.runs.length;
  await runOneCycleChain();

  const activeAfter = await narrativeStore.loadCycleRun(novelId);
  if (activeAfter) {
    console.error('周期链完成后 cycle-run.json 应已清除', activeAfter.status);
    process.exit(1);
  }

  history = await narrativeStore.loadCycleRunHistory(novelId);
  if (history.runs.length <= beforeCount) {
    console.error('完整周期链未写入历史');
    process.exit(1);
  }
  const latest = history.runs[0];
  if (latest.status !== 'completed' || !latest.chapterNumber) {
    console.error('最新历史记录不完整', latest);
    process.exit(1);
  }
  console.log(`✓ 完整周期链归档 → 第${latest.chapterNumber}章`);

  const { run: secondRun } = await startCycleChain(novelId, { tickDays: 0, skipWrite: true });
  if (secondRun.status !== 'running') {
    console.error('新一轮周期链未启动');
    process.exit(1);
  }
  console.log('✓ 归档后可启动新周期链');

  for (let i = 0; i < 6; i++) {
    const job = await processOneJob({ dryRun: true, verbose: false });
    if (!job) break;
    if (!(await narrativeStore.loadCycleRun(novelId))) break;
  }
  await narrativeStore.archiveTerminalCycleRun(novelId);

  await cleanupActiveCycleChain();

  console.log('\n周期链历史归档 smoke test 通过');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
