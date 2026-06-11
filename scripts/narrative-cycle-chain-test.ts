#!/usr/bin/env tsx
/**
 * 周期链 smoke test：4 个独立 job 顺序执行
 */
import { bootstrapEnvSync } from '../src/config.js';
import { startCycleChain } from '../src/narrative/cycle-chain.js';
import { processOneJob } from '../src/jobs/worker.js';
import * as narrativeStore from '../src/narrative/store.js';
import * as store from '../src/novel/store.js';

bootstrapEnvSync();

const novelId = 'test-xiaoshuo';

async function main() {
  if (!(await store.novelExists(novelId))) {
    console.error(`作品 ${novelId} 不存在`);
    process.exit(1);
  }
  if (!(await narrativeStore.hasUniverse(novelId))) {
    console.error('缺少叙事宇宙');
    process.exit(1);
  }

  const chaptersBefore = (await store.listChapterNumbers(novelId)).length;

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
        resultSummary: 'chain-test cleanup',
      });
    }
  }

  const { run: initialRun } = await startCycleChain(novelId, {
    tickDays: 1,
    autoDiscoverCollisions: true,
    targetWords: 1200,
  });
  console.log(`✓ 周期链已启动 ${initialRun.id.slice(0, 8)}…`);

  let steps = 0;
  const maxSteps = 8;
  while (steps < maxSteps) {
    const job = await processOneJob({ dryRun: true, verbose: false });
    if (!job) {
      const active = await narrativeStore.loadCycleRun(novelId);
      if (!active) break;
      console.error('队列空但周期链未完成', active.status, active.stages);
      process.exit(1);
    }
    steps++;
    console.log(`  → ${job.type} 完成`);
    const active = await narrativeStore.loadCycleRun(novelId);
    if (!active) break;
  }

  const history = await narrativeStore.loadCycleRunHistory(novelId);
  const run = history.runs[0];
  const log = await narrativeStore.loadNarrativeCycleLog(novelId);

  if (!run || run.status !== 'completed') {
    console.error('周期链未完成或未归档', run);
    process.exit(1);
  }
  if (await narrativeStore.loadCycleRun(novelId)) {
    console.error('完成后 cycle-run.json 应已清除');
    process.exit(1);
  }
  console.log('✓ 四阶段均完成并已归档');
  console.log(`  tick: ${run.stages.tick.status}`);
  console.log(`  collision: ${run.stages.collision.status} · ${run.collisionTitle}`);
  console.log(`  plan: ${run.stages.plan.status} · #${run.episodeNumber}`);
  console.log(`  write: ${run.stages.write.status} · 第${run.chapterNumber}章`);

  if (log?.lastStatus !== 'success') {
    console.error('narrative-cycle.json 未标记成功');
    process.exit(1);
  }
  console.log(`✓ narrative-cycle.json runsTotal=${log.runsTotal}`);

  const chaptersAfter = (await store.listChapterNumbers(novelId)).length;
  console.log(`✓ 章节数 ${chaptersBefore} → ${chaptersAfter}`);

  console.log('\n周期链 smoke test 通过');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
