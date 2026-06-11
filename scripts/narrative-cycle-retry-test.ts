#!/usr/bin/env tsx
/**
 * 叙事周期失败续跑 smoke test
 */
import { bootstrapEnvSync } from '../src/config.js';
import { NovelistAgentRuntime } from '../src/agent/runtime.js';
import {
  buildResumeFromFailure,
  recordCycleFailure,
  applyResumeToPayload,
} from '../src/narrative/cycle-retry.js';
import * as narrativeStore from '../src/narrative/store.js';
import * as store from '../src/novel/store.js';
import { enqueueJob, listJobs, retryJob, updateJob } from '../src/jobs/queue.js';

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

  const collisions = (await narrativeStore.loadCollisions(novelId))?.collisions ?? [];
  const candidate = collisions.find((c) => c.status === 'candidate' || c.status === 'accepted');
  if (!candidate) {
    console.error('无可用碰撞');
    process.exit(1);
  }

  const episodes = await narrativeStore.listEpisodes(novelId);
  const episode = episodes[episodes.length - 1];
  if (!episode) {
    console.error('无事件包');
    process.exit(1);
  }

  await recordCycleFailure(novelId, {
    stage: 'write',
    error: '模拟写章失败（smoke test）',
    ticked: true,
    tickDays: 1,
    collision: candidate,
    episodeNumber: episode.episodeNumber,
  });

  const log = await narrativeStore.loadNarrativeCycleLog(novelId);
  if (log?.lastStatus !== 'failed' || log.failedStage !== 'write') {
    console.error('失败记录未写入');
    process.exit(1);
  }
  console.log('✓ 失败记录写入 narrative-cycle.json');

  const resume = buildResumeFromFailure({
    stage: 'write',
    error: 'x',
    ticked: true,
    tickDays: 1,
    collision: candidate,
    episodeNumber: episode.episodeNumber,
  });
  if (!resume.skipTick || resume.episodeNumber !== episode.episodeNumber) {
    console.error('resume 构建错误', resume);
    process.exit(1);
  }
  console.log('✓ write 阶段 resume：跳过 tick + 保留事件包');

  const payload: { tickDays?: number; collisionId?: string; episodeNumber?: number } = {};
  applyResumeToPayload(payload, log.resume);
  if (payload.tickDays !== 0 || payload.episodeNumber !== episode.episodeNumber) {
    console.error('payload 续跑参数错误', payload);
    process.exit(1);
  }
  console.log('✓ 续跑 payload 正确');

  const runtime = new NovelistAgentRuntime({ dryRun: true, verbose: false });
  const result = await runtime.runNarrativeCycle(novelId, {
    tickDays: 0,
    collisionId: candidate.id,
    episodeNumber: episode.episodeNumber,
    targetWords: 1200,
  });

  if (result.log.lastStatus !== 'success') {
    console.error('续跑后未标记成功');
    process.exit(1);
  }
  console.log(`✓ 断点续跑成功 → 第${result.chapter?.chapterNumber}章`);

  const stale = (await listJobs(200)).filter((j) => j.novelId === novelId);
  for (const j of stale) {
    if (
      j.type === 'narrative-cycle' &&
      (j.status === 'pending' || j.status === 'running')
    ) {
      await updateJob(j.id, {
        status: 'completed',
        finishedAt: new Date().toISOString(),
        resultSummary: 'retry-test cleanup',
      });
    }
  }

  let failedJob;
  try {
    failedJob = await enqueueJob(
      novelId,
      'narrative-cycle',
      { tickDays: 0, collisionId: candidate.id, episodeNumber: episode.episodeNumber },
      { maxAttempts: 3 }
    );
    await updateJob(failedJob.id, {
      status: 'failed',
      error: 'smoke',
      finishedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('准备失败任务出错:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  let retried;
  try {
    retried = await retryJob(failedJob.id);
  } catch (e) {
    console.error('retryJob 失败:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
  if (retried.parentJobId !== failedJob.id || retried.attempt !== 2 || !retried.runAt) {
    console.error(
      `retryJob 元数据错误 parent=${retried.parentJobId} attempt=${retried.attempt} runAt=${retried.runAt}`
    );
    process.exit(1);
  }
  console.log('✓ retryJob 入队（attempt 2 + runAt）');

  console.log('\n叙事周期失败续跑 smoke test 通过');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
