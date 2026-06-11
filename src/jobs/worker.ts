/**
 * Job Worker：从队列领取任务并委托 NovelistAgentRuntime 执行
 *
 * ## 周期执行的两种模式（勿混用）
 *
 * 1. **周期链（生产路径）** — UI、`narrative-auto` 调度、`POST /cycle`
 *    - 4 个独立 job：`universe-tick` → `cycle-pick-collision` → `plan-episode` → `write-episode`
 *    - `payload.cycleRunId` 关联 `cycle-run.json`；成功时 `completeJob` → `handleCycleJobSuccess` 推进下一阶段
 *    - 失败时 `handleCycleJobFailure` 仅重试当前阶段
 *
 * 2. **单体周期（遗留 / 测试）** — `narrative-cycle` 单 job 跑完全流程
 *    - 无 `cycleRunId`；失败走 `scheduleNarrativeCycleAutoRetry` + `narrative-cycle.json` resume
 *    - 新功能应挂在周期链上，不要扩展此分支
 */
import { NovelistAgentRuntime } from '../agent/runtime.js';
import * as store from '../novel/store.js';
import { claimNextPendingJob, enqueueJob, updateJob } from './queue.js';
import { computeRetryRunAt, formatRetryWait } from './retry-backoff.js';
import { isRetryableStandaloneLlmJobError, toErrorMessage } from '../lib/errors.js';
import type { Job, JobPayload, JobType } from './types.js';
import * as narrativeStore from '../narrative/store.js';
import { applyResumeToPayload, MAX_CYCLE_ATTEMPTS } from '../narrative/cycle-retry.js';
import {
  handleCycleJobSuccess,
  handleCycleJobFailure,
  type CycleJobOutcome,
} from '../narrative/cycle-chain.js';

export interface WorkerOptions {
  dryRun?: boolean;
  verbose?: boolean;
}

const STANDALONE_RETRYABLE_JOB_TYPES = new Set<JobType>([
  'build-universe',
  'discover-collisions',
  'plan-episode',
  'write-episode',
]);

/** 标记 job 完成；若属于周期链则顺带入队下一阶段（或触发归档） */
async function completeJob(
  job: Job,
  summary: string,
  outcome?: CycleJobOutcome
): Promise<void> {
  await updateJob(job.id, {
    status: 'completed',
    finishedAt: new Date().toISOString(),
    resultSummary: summary,
  });
  if (job.payload.cycleRunId) {
    await handleCycleJobSuccess(job, outcome);
  }
}

export async function executeJob(job: Job, options: WorkerOptions = {}): Promise<void> {
  const runtime = new NovelistAgentRuntime({
    dryRun: options.dryRun,
    verbose: options.verbose ?? true,
  });

  try {
    switch (job.type) {
      case 'plan-outline': {
        const count = job.payload.chapterCount ?? 10;
        const outline = await runtime.planOutline(job.novelId, count);
        await completeJob(job, `大纲已生成，共 ${outline.chapters.length} 章`);
        break;
      }
      case 'write-next-chapter': {
        const state = await store.loadStoryState(job.novelId);
        const nextChapter = state.lastChapterNumber + 1;
        const result = await runtime.writeChapter(job.novelId, nextChapter, {
          targetWords: job.payload.targetWords,
          skipReview: job.payload.skipReview,
        });
        await completeJob(
          job,
          `第${nextChapter}章《${result.title}》已生成，${result.wordCount} 字`
        );
        break;
      }
      case 'write-chapter': {
        const chapterNumber = job.payload.chapterNumber;
        if (!chapterNumber) throw new Error('write-chapter 需要 payload.chapterNumber');
        const result = await runtime.writeChapter(job.novelId, chapterNumber, {
          targetWords: job.payload.targetWords,
          skipReview: job.payload.skipReview,
        });
        await completeJob(job, `第${chapterNumber}章《${result.title}》已生成`);
        break;
      }
      case 'review-chapter': {
        const chapterNumber = job.payload.chapterNumber;
        if (!chapterNumber) throw new Error('review-chapter 需要 payload.chapterNumber');
        const review = await runtime.reviewChapter(job.novelId, chapterNumber);
        await completeJob(
          job,
          `审稿完成：${review.passed ? '通过' : '未通过'}，${review.summary}`
        );
        break;
      }
      case 'build-universe': {
        const result = await runtime.buildUniverse(job.novelId, {
          worldEventCount: job.payload.worldEventCount,
          heroEventCount: job.payload.heroEventCount,
        });
        await completeJob(
          job,
          `宇宙已生成：世界事件 ${result.world.events.length} 个，主角行动 ${result.hero.events.length} 个`
        );
        break;
      }
      case 'discover-collisions': {
        const collisions = await runtime.discoverCollisions(
          job.novelId,
          job.payload.maxCollisions ?? 6
        );
        await completeJob(job, `发现 ${collisions.length} 个碰撞候选`);
        break;
      }
      case 'plan-episode': {
        const collisionId = job.payload.collisionId;
        if (!collisionId) throw new Error('plan-episode 需要 payload.collisionId');
        const episode = await runtime.planEpisode(job.novelId, collisionId);
        await completeJob(
          job,
          `事件包 #${episode.episodeNumber}《${episode.title}》已生成`,
          {
            episodeNumber: episode.episodeNumber,
            episodeTitle: episode.title,
          }
        );
        break;
      }
      case 'write-episode': {
        const episodeNumber = job.payload.episodeNumber;
        if (!episodeNumber) throw new Error('write-episode 需要 payload.episodeNumber');
        const result = await runtime.writeEpisode(job.novelId, episodeNumber, {
          targetWords: job.payload.targetWords,
          skipReview: job.payload.skipReview,
        });
        await completeJob(
          job,
          `第${result.chapterNumber}章《${result.title}》已写出，${result.wordCount} 字` +
            (result.writingMeta.twoStage ? '（双阶段' : '（单阶段') +
            `${result.writingMeta.leakRetries > 0 ? `，泄露修复×${result.writingMeta.leakRetries}` : ''}` +
            `${result.writingMeta.reviewRewriteRetries > 0 ? `，审稿修订×${result.writingMeta.reviewRewriteRetries}` : ''}）`,
          {
            chapterNumber: result.chapterNumber,
            chapterTitle: result.title,
            wordCount: result.wordCount,
          }
        );
        break;
      }
      case 'universe-tick': {
        const result = await runtime.tickUniverse(job.novelId, {
          tickDays: job.payload.tickDays !== undefined ? job.payload.tickDays : 1,
          autoDiscoverCollisions: job.payload.autoDiscoverCollisions !== false,
          maxCollisions: job.payload.maxCollisions ?? 6,
        });
        await completeJob(
          job,
          `世界推进 第${result.fromDay}～${result.toDay}天：` +
            `+${result.newWorldEvents} 世界，+${result.newSupportEvents} 配角，+${result.newHeroEvents} 主角` +
            (result.resolvedWorldEvents > 0 ? `，${result.resolvedWorldEvents} 事件完结` : '') +
            `，碰撞池 ${result.collisions.filter((c) => c.status === 'candidate').length} 候选`,
          { tickToDay: result.toDay }
        );
        break;
      }
      case 'cycle-pick-collision': {
        const collision = await runtime.pickCycleCollision(job.novelId, {
          collisionId: job.payload.collisionId,
          autoDiscoverCollisions: job.payload.autoDiscoverCollisions !== false,
          maxCollisions: job.payload.maxCollisions ?? 6,
        });
        await completeJob(job, `选中碰撞「${collision.title}」`, {
          collisionId: collision.id,
          collisionTitle: collision.title,
        });
        break;
      }
      case 'narrative-cycle': {
        const result = await runtime.runNarrativeCycle(job.novelId, {
          tickDays: job.payload.tickDays !== undefined ? job.payload.tickDays : 1,
          autoDiscoverCollisions: job.payload.autoDiscoverCollisions !== false,
          maxCollisions: job.payload.maxCollisions ?? 6,
          collisionId: job.payload.collisionId,
          episodeNumber: job.payload.episodeNumber,
          targetWords: job.payload.targetWords,
          skipWrite: job.payload.skipWrite,
        });
        const ch = result.chapter;
        await completeJob(
          job,
          (result.ticked ? `推进至第${result.tickToDay}天 → ` : '') +
            `碰撞「${result.collision.title}」→ 事件包#${result.episode.episodeNumber}` +
            (ch ? ` → 第${ch.chapterNumber}章《${ch.title}》${ch.wordCount}字` : '（未写章）')
        );
        break;
      }
      default:
        throw new Error(`未知任务类型: ${job.type}`);
    }
  } catch (error) {
    const message = toErrorMessage(error);
    await updateJob(job.id, {
      status: 'failed',
      finishedAt: new Date().toISOString(),
      error: message,
    });

    // 周期链：按阶段重试（与单体 narrative-cycle 分支互斥）
    if (job.payload.cycleRunId) {
      try {
        const retry = await handleCycleJobFailure(job, message);
        if (retry) {
          const waitHint = retry.runAt ? `，${formatRetryWait(retry.runAt)}` : '';
          console.log(
            `[worker] 周期链阶段 ${job.type} 自动重试入队 (${retry.attempt}/${retry.maxAttempts})${waitHint}`
          );
        }
      } catch (retryErr) {
        console.error('[worker] 周期链失败处理出错:', retryErr);
      }
    } else if (job.type === 'narrative-cycle') {
      const attempt = job.attempt ?? 1;
      const maxAttempts = job.maxAttempts ?? MAX_CYCLE_ATTEMPTS;
      if (attempt < maxAttempts) {
        try {
          await scheduleNarrativeCycleAutoRetry(job);
        } catch (retryErr) {
          console.error('[worker] narrative-cycle 自动重试入队失败:', retryErr);
        }
      }
    } else if (STANDALONE_RETRYABLE_JOB_TYPES.has(job.type)) {
      const attempt = job.attempt ?? 1;
      const maxAttempts = job.maxAttempts ?? MAX_CYCLE_ATTEMPTS;
      if (attempt < maxAttempts && isRetryableStandaloneLlmJobError(message)) {
        try {
          await scheduleStandaloneJobAutoRetry(job);
        } catch (retryErr) {
          console.error(`[worker] ${job.type} 自动重试入队失败:`, retryErr);
        }
      }
    }

    throw error;
  }
}

async function scheduleStandaloneJobAutoRetry(failedJob: Job): Promise<void> {
  const nextAttempt = (failedJob.attempt ?? 1) + 1;
  const runAt = computeRetryRunAt(nextAttempt);
  await enqueueJob(failedJob.novelId, failedJob.type, { ...failedJob.payload }, {
    attempt: nextAttempt,
    maxAttempts: failedJob.maxAttempts ?? MAX_CYCLE_ATTEMPTS,
    parentJobId: failedJob.id,
    runAt,
  });
  console.log(
    `[worker] ${failedJob.type} 已自动入队重试 (${nextAttempt}/${failedJob.maxAttempts ?? MAX_CYCLE_ATTEMPTS})，${formatRetryWait(runAt)}`
  );
}

async function scheduleNarrativeCycleAutoRetry(failedJob: Job): Promise<void> {
  const log = await narrativeStore.loadNarrativeCycleLog(failedJob.novelId);
  const payload: JobPayload = { ...failedJob.payload };
  applyResumeToPayload(payload, log?.resume);

  const nextAttempt = (failedJob.attempt ?? 1) + 1;
  const runAt = computeRetryRunAt(nextAttempt);
  await enqueueJob(failedJob.novelId, 'narrative-cycle', payload, {
    attempt: nextAttempt,
    maxAttempts: failedJob.maxAttempts ?? MAX_CYCLE_ATTEMPTS,
    parentJobId: failedJob.id,
    runAt,
  });
  console.log(
    `[worker] narrative-cycle 已自动入队重试 (${nextAttempt}/${failedJob.maxAttempts ?? MAX_CYCLE_ATTEMPTS})，${formatRetryWait(runAt)}`
  );
}

export async function processOneJob(options: WorkerOptions = {}): Promise<Job | null> {
  const job = await claimNextPendingJob();
  if (!job) return null;
  await executeJob(job, options);
  return job;
}
