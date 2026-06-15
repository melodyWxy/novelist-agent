/**
 * 叙事周期链：tick → 事件包（主人公线）→ 写章（各阶段独立 job）
 *
 * collision 阶段保留用于兼容旧链路与 UI 展示，新周期默认跳过，由 plan 阶段按主人公线选点。
 *
 * - `cycle-run.json` 仅存进行中的链；终态写入 `cycle-run-history.json`
 * - 每阶段失败仅重试该阶段（`enqueueStageJob` 复用同一 `CycleRun.id`）
 * - `hasActiveCycleChain` 除 `running` 状态外，还检查带 `cycleRunId` 的 pending/running job
 */
import { randomUUID } from 'node:crypto';
import { enqueueJob, type EnqueueJobMeta } from '../jobs/queue.js';
import { computeRetryRunAt } from '../jobs/retry-backoff.js';
import type { Job, JobPayload, JobType } from '../jobs/types.js';
import * as narrativeStore from './store.js';
import { recordCycleFailure, MAX_CYCLE_ATTEMPTS } from './cycle-retry.js';
import type {
  CycleRun,
  CycleStageName,
  CycleStageRecord,
  NarrativeCycleLog,
} from './types.js';
import type { CycleResume } from './types.js';

const STAGE_ORDER: CycleStageName[] = ['tick', 'collision', 'plan', 'write'];

export interface CycleChainConfig {
  tickDays?: number;
  autoDiscoverCollisions?: boolean;
  maxCollisions?: number;
  targetWords?: number;
  skipWrite?: boolean;
  /** 手动指定碰撞时走旧版碰撞规划路径 */
  collisionId?: string;
  /** 手动指定主人公行动节点 */
  heroEventId?: string;
  episodeNumber?: number;
}

export interface CycleJobOutcome {
  tickToDay?: number;
  heroEventId?: string;
  heroEventTitle?: string;
  collisionId?: string;
  collisionTitle?: string;
  episodeNumber?: number;
  episodeTitle?: string;
  chapterNumber?: number;
  chapterTitle?: string;
  wordCount?: number;
}

function emptyStages(): CycleRun['stages'] {
  const pending = (): CycleStageRecord => ({ status: 'pending' });
  return { tick: pending(), collision: pending(), plan: pending(), write: pending() };
}

function jobTypeForStage(stage: CycleStageName): JobType {
  switch (stage) {
    case 'tick':
      return 'universe-tick';
    case 'collision':
      return 'cycle-pick-collision';
    case 'plan':
      return 'plan-episode';
    case 'write':
      return 'write-episode';
  }
}

function stageFromJobType(type: JobType): CycleStageName | null {
  switch (type) {
    case 'universe-tick':
      return 'tick';
    case 'cycle-pick-collision':
      return 'collision';
    case 'plan-episode':
      return 'plan';
    case 'write-episode':
      return 'write';
    default:
      return null;
  }
}

function buildPayload(run: CycleRun, stage: CycleStageName): JobPayload {
  const base: JobPayload = { cycleRunId: run.id };
  const cfg = run.config;

  switch (stage) {
    case 'tick':
      return {
        ...base,
        tickDays: cfg.tickDays,
        autoDiscoverCollisions: cfg.autoDiscoverCollisions,
        maxCollisions: cfg.maxCollisions,
      };
    case 'collision':
      return {
        ...base,
        collisionId: cfg.collisionId ?? run.collisionId,
        autoDiscoverCollisions: cfg.autoDiscoverCollisions,
        maxCollisions: cfg.maxCollisions,
      };
    case 'plan':
      return {
        ...base,
        collisionId: run.collisionId ?? cfg.collisionId,
        heroEventId: run.heroEventId ?? cfg.heroEventId,
        autoDiscoverCollisions: cfg.autoDiscoverCollisions,
        maxCollisions: cfg.maxCollisions,
      };
    case 'write':
      return {
        ...base,
        episodeNumber: run.episodeNumber ?? cfg.episodeNumber,
        targetWords: cfg.targetWords,
      };
  }
}

/** 断点续跑 / 手动指定参数时，决定从哪一阶段开跑（之前阶段标为 skipped） */
function resolveStartStage(config: CycleChainConfig, resume?: CycleResume): CycleStageName {
  if (resume?.episodeNumber || config.episodeNumber) return 'write';
  if (resume?.collisionId || config.collisionId || resume?.heroEventId || config.heroEventId) {
    return 'plan';
  }
  if (resume?.skipTick || (config.tickDays ?? 1) === 0) return 'plan';
  return 'tick';
}

/** 将 start 之前的阶段记为 skipped，便于 CycleProgress 与历史归档展示 */
function markSkippedBefore(run: CycleRun, start: CycleStageName): void {
  const startIdx = STAGE_ORDER.indexOf(start);
  for (let i = 0; i < startIdx; i++) {
    const name = STAGE_ORDER[i];
    run.stages[name] = { status: 'skipped', finishedAt: new Date().toISOString() };
  }
}

export async function hasActiveCycleChain(novelId: string): Promise<boolean> {
  const run = await narrativeStore.loadCycleRun(novelId);
  if (run?.status === 'running') return true;

  const { listJobsForNovel } = await import('../jobs/queue.js');
  const jobs = await listJobsForNovel(novelId, 30);
  return jobs.some(
    (j) =>
      j.payload.cycleRunId &&
      (j.status === 'pending' || j.status === 'running')
  );
}

export async function startCycleChain(
  novelId: string,
  config: CycleChainConfig = {},
  resume?: CycleResume
): Promise<{ run: CycleRun; job: Job }> {
  if (await hasActiveCycleChain(novelId)) {
    throw new Error('该作品已有进行中的周期链');
  }

  await narrativeStore.archiveTerminalCycleRun(novelId);

  const now = new Date().toISOString();
  const tickDays = resume?.skipTick ? 0 : (config.tickDays ?? 1);

  const run: CycleRun = {
    id: randomUUID(),
    novelId,
    startedAt: now,
    updatedAt: now,
    status: 'running',
    config: {
      tickDays,
      autoDiscoverCollisions: config.autoDiscoverCollisions !== false,
      maxCollisions: config.maxCollisions ?? 6,
      targetWords: config.targetWords,
      skipWrite: config.skipWrite === true,
      collisionId: resume?.collisionId ?? config.collisionId,
      heroEventId: resume?.heroEventId ?? config.heroEventId,
      episodeNumber: resume?.episodeNumber ?? config.episodeNumber,
    },
    stages: emptyStages(),
    collisionId: resume?.collisionId ?? config.collisionId,
    heroEventId: resume?.heroEventId ?? config.heroEventId,
    episodeNumber: resume?.episodeNumber ?? config.episodeNumber,
  };

  // 主人公线驱动：碰撞选取并入 plan 阶段，此处标记跳过
  run.stages.collision = { status: 'skipped', finishedAt: now };

  if (config.skipWrite) {
    run.stages.write = { status: 'skipped', finishedAt: now };
  }

  const startStage = resolveStartStage(config, resume);
  markSkippedBefore(run, startStage);

  await narrativeStore.saveCycleRun(novelId, run);

  const job = await enqueueStageJob(run, startStage);
  return { run, job };
}

async function enqueueStageJob(
  run: CycleRun,
  stage: CycleStageName,
  meta: EnqueueJobMeta = {}
): Promise<Job> {
  const jobType = jobTypeForStage(stage);
  const payload = buildPayload(run, stage);

  run.stages[stage] = {
    status: 'running',
    jobType,
  };
  run.updatedAt = new Date().toISOString();
  await narrativeStore.saveCycleRun(run.novelId, run);

  const job = await enqueueJob(run.novelId, jobType, payload, {
    maxAttempts: MAX_CYCLE_ATTEMPTS,
    ...meta,
  });

  run.stages[stage] = { ...run.stages[stage], jobId: job.id, jobType };
  run.updatedAt = new Date().toISOString();
  await narrativeStore.saveCycleRun(run.novelId, run);

  return job;
}

function nextStage(run: CycleRun, after: CycleStageName): CycleStageName | null {
  const idx = STAGE_ORDER.indexOf(after);
  for (let i = idx + 1; i < STAGE_ORDER.length; i++) {
    const name = STAGE_ORDER[i];
    if (run.stages[name].status === 'skipped') continue;
    if (run.config.skipWrite && name === 'write') continue;
    return name;
  }
  return null;
}

async function finalizeCycleSuccess(run: CycleRun): Promise<void> {
  const now = new Date().toISOString();
  run.status = 'completed';
  run.updatedAt = now;

  const prev = await narrativeStore.loadNarrativeCycleLog(run.novelId);
  const ticked = run.stages.tick.status === 'completed';
  const log: NarrativeCycleLog = {
    lastRunAt: now,
    tickDays: ticked ? run.config.tickDays : 0,
    skippedTick: !ticked,
    skippedWrite: run.config.skipWrite,
    collisionId: run.collisionId,
    collisionTitle: run.collisionTitle,
    episodeNumber: run.episodeNumber,
    chapterNumber: run.chapterNumber,
    chapterTitle: run.chapterTitle,
    wordCount: run.wordCount,
    runsTotal: (prev?.runsTotal ?? 0) + 1,
    lastStatus: 'success',
    consecutiveFailures: 0,
    resume: undefined,
  };
  await narrativeStore.saveNarrativeCycleLog(run.novelId, log);
  await narrativeStore.archiveTerminalCycleRun(run.novelId, run);
}

export async function handleCycleJobSuccess(
  job: Job,
  outcome: CycleJobOutcome = {}
): Promise<Job | null> {
  const cycleRunId = job.payload.cycleRunId;
  if (!cycleRunId) return null;

  const stage = stageFromJobType(job.type);
  if (!stage) return null;

  const run = await narrativeStore.loadCycleRun(job.novelId);
  if (!run || run.id !== cycleRunId) return null;

  const now = new Date().toISOString();
  run.stages[stage] = {
    ...run.stages[stage],
    status: 'completed',
    jobId: job.id,
    jobType: job.type,
    finishedAt: now,
  };

  if (outcome.tickToDay !== undefined) run.tickToDay = outcome.tickToDay;
  if (outcome.heroEventId) run.heroEventId = outcome.heroEventId;
  if (outcome.heroEventTitle) run.heroEventTitle = outcome.heroEventTitle;
  if (outcome.collisionId) run.collisionId = outcome.collisionId;
  if (outcome.collisionTitle) run.collisionTitle = outcome.collisionTitle;
  if (outcome.episodeNumber) run.episodeNumber = outcome.episodeNumber;
  if (outcome.episodeTitle) run.episodeTitle = outcome.episodeTitle;
  if (outcome.chapterNumber) run.chapterNumber = outcome.chapterNumber;
  if (outcome.chapterTitle) run.chapterTitle = outcome.chapterTitle;
  if (outcome.wordCount !== undefined) run.wordCount = outcome.wordCount;
  run.updatedAt = now;

  const upcoming = nextStage(run, stage);
  if (!upcoming) {
    await finalizeCycleSuccess(run);
    return null;
  }

  await narrativeStore.saveCycleRun(job.novelId, run);
  return enqueueStageJob(run, upcoming);
}

export async function handleCycleJobFailure(job: Job, error: string): Promise<Job | null> {
  const cycleRunId = job.payload.cycleRunId;
  if (!cycleRunId) return null;

  const stage = stageFromJobType(job.type);
  if (!stage) return null;

  const run = await narrativeStore.loadCycleRun(job.novelId);
  if (!run || run.id !== cycleRunId) return null;

  const now = new Date().toISOString();
  run.stages[stage] = {
    ...run.stages[stage],
    status: 'failed',
    jobId: job.id,
    jobType: job.type,
    error,
    finishedAt: now,
  };
  run.status = 'failed';
  run.failedStage = stage;
  run.lastError = error;
  run.updatedAt = now;
  await narrativeStore.saveCycleRun(job.novelId, run);

  const ticked = run.stages.tick.status === 'completed';
  let collision;
  if (run.collisionId) {
    const file = await narrativeStore.loadCollisions(job.novelId);
    collision = file?.collisions.find((c) => c.id === run.collisionId);
  }
  await recordCycleFailure(job.novelId, {
    stage,
    error,
    ticked,
    tickDays: run.config.tickDays,
    collision,
    heroEventId: run.heroEventId ?? run.config.heroEventId,
    episodeNumber: run.episodeNumber,
  });

  const attempt = job.attempt ?? 1;
  const maxAttempts = job.maxAttempts ?? MAX_CYCLE_ATTEMPTS;
  if (attempt >= maxAttempts) {
    await narrativeStore.archiveTerminalCycleRun(job.novelId, run);
    return null;
  }

  // 重试同一阶段：恢复为 running，避免 UI/归档把链当成已终结
  run.status = 'running';
  run.failedStage = undefined;
  run.lastError = undefined;
  run.updatedAt = new Date().toISOString();
  await narrativeStore.saveCycleRun(job.novelId, run);

  const nextAttempt = attempt + 1;
  return enqueueStageJob(run, stage, {
    attempt: nextAttempt,
    maxAttempts,
    parentJobId: job.id,
    runAt: computeRetryRunAt(nextAttempt),
  });
}

/** 停止进行中的周期链：归档 cycle-run，并依赖队列层取消 pending job */
export async function stopCycleChain(novelId: string): Promise<CycleRun | null> {
  const run = await narrativeStore.loadCycleRun(novelId);
  if (!run || run.status !== 'running') return null;

  const now = new Date().toISOString();
  run.status = 'cancelled';
  run.lastError = '用户停止产出';
  run.updatedAt = now;

  for (const name of STAGE_ORDER) {
    const stage = run.stages[name];
    if (stage.status === 'running' || stage.status === 'pending') {
      run.stages[name] = {
        ...stage,
        status: 'skipped',
        finishedAt: now,
      };
    }
  }

  await narrativeStore.saveCycleRun(novelId, run);
  return narrativeStore.archiveTerminalCycleRun(novelId, run);
}

/** 从失败记录续跑周期链 */
export async function resumeCycleChain(novelId: string): Promise<{ run: CycleRun; job: Job }> {
  const log = await narrativeStore.loadNarrativeCycleLog(novelId);
  if (!log?.resume && log?.lastStatus !== 'failed') {
    throw new Error('没有可续跑的失败周期');
  }
  await narrativeStore.archiveTerminalCycleRun(novelId);
  return startCycleChain(
    novelId,
    {
      tickDays: log?.tickDays,
      collisionId: log?.resume?.collisionId ?? log?.collisionId,
      heroEventId: log?.resume?.heroEventId,
      episodeNumber: log?.resume?.episodeNumber ?? log?.episodeNumber,
    },
    log?.resume
  );
}

export { CYCLE_STAGE_LABELS, stageStatusLabel } from './cycle-labels.js';
