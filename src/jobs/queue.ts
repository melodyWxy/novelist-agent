/**
 * 本地 JSON 任务队列
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getJobsRoot } from '../config.js';
import { ensureDir, readJsonFile, writeJsonAtomic } from '../lib/atomic-fs.js';
import {
  Job,
  JobSchema,
  JobType,
  JobPayload,
  Schedule,
  ScheduleSchema,
  QueueFileSchema,
  SchedulesFileSchema,
} from './types.js';
import { computeRetryRunAt, isJobDue } from './retry-backoff.js';
import { MAX_CYCLE_ATTEMPTS } from '../narrative/cycle-retry.js';

function queuePath(): string {
  return path.join(getJobsRoot(), 'queue.json');
}

function schedulesPath(): string {
  return path.join(getJobsRoot(), 'schedules.json');
}

async function loadQueue(): Promise<Job[]> {
  const data = await readJsonFile(path.join(getJobsRoot(), 'queue.json'), { jobs: [] });
  return QueueFileSchema.parse(data).jobs;
}

async function saveQueue(jobs: Job[]): Promise<void> {
  await ensureDir(getJobsRoot());
  await writeJsonAtomic(queuePath(), { jobs });
}

async function loadSchedules(): Promise<Schedule[]> {
  const data = await readJsonFile(schedulesPath(), { schedules: [] });
  return SchedulesFileSchema.parse(data).schedules;
}

async function saveSchedules(schedules: Schedule[]): Promise<void> {
  await ensureDir(getJobsRoot());
  await writeJsonAtomic(schedulesPath(), { schedules });
}

export async function listJobs(limit = 50): Promise<Job[]> {
  const jobs = await loadQueue();
  return jobs
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export async function listJobsForNovel(novelId: string, limit = 20): Promise<Job[]> {
  const jobs = await loadQueue();
  return jobs
    .filter((j) => j.novelId === novelId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export async function getJob(jobId: string): Promise<Job | null> {
  const jobs = await loadQueue();
  return jobs.find((j) => j.id === jobId) ?? null;
}

export async function hasRunningJobForNovel(novelId: string): Promise<boolean> {
  const jobs = await loadQueue();
  return jobs.some((j) => j.novelId === novelId && j.status === 'running');
}

export async function hasPendingOrRunningForNovel(novelId: string, type?: JobType): Promise<boolean> {
  const jobs = await loadQueue();
  return jobs.some(
    (j) =>
      j.novelId === novelId &&
      (j.status === 'pending' || j.status === 'running') &&
      (type ? j.type === type : true)
  );
}

export async function countPendingJobsForNovel(novelId: string): Promise<number> {
  const jobs = await loadQueue();
  return jobs.filter((j) => j.novelId === novelId && j.status === 'pending').length;
}

/** 取消排队中和执行中的任务；执行中的进程可能仍会跑完当前 LLM 调用，但队列不再显示 running */
export async function cancelActiveJobsForNovel(novelId: string): Promise<{
  pending: number;
  running: number;
}> {
  const jobs = await loadQueue();
  const now = new Date().toISOString();
  let pending = 0;
  let running = 0;

  for (const job of jobs) {
    if (job.novelId !== novelId || (job.status !== 'pending' && job.status !== 'running')) continue;
    const wasRunning = job.status === 'running';
    job.status = 'failed';
    job.error = wasRunning
      ? '用户停止产出（执行中任务已从队列标记为停止）'
      : '用户停止产出';
    job.finishedAt = now;
    if (wasRunning) {
      running++;
    } else {
      pending++;
    }
  }

  if (pending + running > 0) {
    await saveQueue(jobs);
  }
  return { pending, running };
}

/** @deprecated use cancelActiveJobsForNovel */
export async function cancelPendingJobsForNovel(novelId: string): Promise<number> {
  const cancelled = await cancelActiveJobsForNovel(novelId);
  return cancelled.pending;
}

export interface EnqueueJobMeta {
  attempt?: number;
  maxAttempts?: number;
  parentJobId?: string;
  runAt?: string;
}

/**
 * 入队新任务。同一作品 + 同一 `type` 同时只能有一个 pending/running。
 * 周期链故意使用 4 种不同 type，从而可串行多阶段；勿对链内阶段复用同一 type。
 */
export async function enqueueJob(
  novelId: string,
  type: JobType,
  payload: JobPayload = {},
  meta: EnqueueJobMeta = {}
): Promise<Job> {
  if (await hasPendingOrRunningForNovel(novelId, type)) {
    throw new Error(`作品 ${novelId} 已有相同类型的待执行/执行中任务`);
  }

  const job: Job = JobSchema.parse({
    id: randomUUID(),
    novelId,
    type,
    payload,
    status: 'pending',
    createdAt: new Date().toISOString(),
    attempt: meta.attempt ?? 1,
    maxAttempts: meta.maxAttempts ?? 1,
    parentJobId: meta.parentJobId,
    runAt: meta.runAt,
  });

  const jobs = await loadQueue();
  jobs.push(job);
  await saveQueue(jobs);
  return job;
}

export async function retryJob(jobId: string): Promise<Job> {
  const original = await getJob(jobId);
  if (!original) throw new Error(`任务 ${jobId} 不存在`);
  if (original.status !== 'failed') {
    throw new Error('只能重试失败的任务');
  }

  const payload: JobPayload = { ...original.payload };

  if (original.type === 'narrative-cycle') {
    const { loadNarrativeCycleLog } = await import('../narrative/store.js');
    const { applyResumeToPayload } = await import('../narrative/cycle-retry.js');
    const log = await loadNarrativeCycleLog(original.novelId);
    applyResumeToPayload(payload, log?.resume);
  }

  const nextAttempt = (original.attempt ?? 1) + 1;
  return enqueueJob(original.novelId, original.type, payload, {
    attempt: nextAttempt,
    maxAttempts: original.maxAttempts ?? MAX_CYCLE_ATTEMPTS,
    parentJobId: original.id,
    runAt: computeRetryRunAt(nextAttempt),
  });
}

export async function enqueueNarrativeCycleRetry(novelId: string): Promise<Job> {
  const { resumeCycleChain } = await import('../narrative/cycle-chain.js');
  const { job } = await resumeCycleChain(novelId);
  return job;
}

export function selectNextPendingJob(jobs: Job[], nowMs: number = Date.now()): Job | null {
  const runningNovels = new Set(jobs.filter((j) => j.status === 'running').map((j) => j.novelId));

  return (
    jobs
      .filter(
        (j) =>
          j.status === 'pending' &&
          !runningNovels.has(j.novelId) &&
          isJobDue(j, nowMs)
      )
      .sort((a, b) => {
        const aRun = a.runAt ? new Date(a.runAt).getTime() : 0;
        const bRun = b.runAt ? new Date(b.runAt).getTime() : 0;
        if (aRun !== bRun) return aRun - bRun;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      })[0] ?? null
  );
}

export async function claimNextPendingJob(): Promise<Job | null> {
  const jobs = await loadQueue();
  const next = selectNextPendingJob(jobs);
  if (!next) return null;

  next.status = 'running';
  next.startedAt = new Date().toISOString();
  await saveQueue(jobs);
  return next;
}

export async function updateJob(jobId: string, patch: Partial<Job>): Promise<Job> {
  const jobs = await loadQueue();
  const idx = jobs.findIndex((j) => j.id === jobId);
  if (idx < 0) throw new Error(`任务 ${jobId} 不存在`);

  const updated = JobSchema.parse({ ...jobs[idx], ...patch });
  jobs[idx] = updated;
  await saveQueue(jobs);
  return updated;
}

export async function listSchedules(): Promise<Schedule[]> {
  return loadSchedules();
}

export async function getScheduleForNovel(novelId: string): Promise<Schedule | null> {
  const schedules = await loadSchedules();
  return schedules.find((s) => s.novelId === novelId) ?? null;
}

export async function upsertSchedule(
  novelId: string,
  input: Partial<
    Pick<
      Schedule,
      | 'enabled'
      | 'cron'
      | 'targetWords'
      | 'maxChapters'
      | 'mode'
      | 'tickDays'
      | 'autoDiscoverCollisions'
      | 'maxCollisions'
    >
  >
): Promise<Schedule> {
  const schedules = await loadSchedules();
  const idx = schedules.findIndex((s) => s.novelId === novelId);
  const now = new Date().toISOString();

  if (idx >= 0) {
    const updated = ScheduleSchema.parse({
      ...schedules[idx],
      ...input,
      updatedAt: now,
    });
    schedules[idx] = updated;
    await saveSchedules(schedules);
    return updated;
  }

  const created = ScheduleSchema.parse({
    id: randomUUID(),
    novelId,
    enabled: input.enabled ?? false,
    cron: input.cron ?? '0 9 * * *',
    targetWords: input.targetWords ?? 3500,
    maxChapters: input.maxChapters,
    mode: input.mode ?? 'classic',
    tickDays: input.tickDays ?? 1,
    autoDiscoverCollisions: input.autoDiscoverCollisions ?? true,
    maxCollisions: input.maxCollisions ?? 6,
    updatedAt: now,
  });
  schedules.push(created);
  await saveSchedules(schedules);
  return created;
}

export async function markScheduleTriggered(
  novelId: string,
  triggeredAt: string
): Promise<Schedule | null> {
  const schedules = await loadSchedules();
  const idx = schedules.findIndex((s) => s.novelId === novelId);
  if (idx < 0) return null;

  const updated = ScheduleSchema.parse({
    ...schedules[idx],
    lastTriggeredAt: triggeredAt,
  });
  schedules[idx] = updated;
  await saveSchedules(schedules);
  return updated;
}
