/**
 * 双线叙事聚合服务
 */
import * as narrativePipeline from '../narrative/pipeline.js';
import {
  cancelActiveJobsForNovel,
  countPendingJobsForNovel,
  enqueueJob,
  upsertSchedule,
} from '../jobs/queue.js';
import { MAX_CYCLE_ATTEMPTS } from '../narrative/cycle-retry.js';
import * as narrativeStore from '../narrative/store.js';
import type {
  WorldBible,
  WorldTimeline,
  HeroTimeline,
  SupportTimeline,
  Collision,
  EpisodePlan,
  UniverseSimState,
  NarrativeCycleLog,
  CycleRun,
  PowerSystemFile,
  CharacterAssetsFile,
} from '../narrative/types.js';
import { startCycleChain, stopCycleChain } from '../narrative/cycle-chain.js';
import { pickBestCollision } from '../narrative/disclosure.js';
import { computePacingRecommendation, collisionTypeBoost } from '../narrative/pacing.js';
import type { QualityMetrics } from '../narrative/quality-metrics.js';
import type {
  StoryArcsFile,
  ChapterMemoryIndex,
} from '../narrative/types.js';
import * as novelStore from '../novel/store.js';
import type { NovelMeta, StoryState } from '../novel/types.js';

export interface UniverseDetail {
  meta: NovelMeta;
  bible: WorldBible | null;
  world: WorldTimeline | null;
  hero: HeroTimeline | null;
  support: SupportTimeline | null;
  powerSystem: PowerSystemFile | null;
  characterAssets: CharacterAssetsFile | null;
  storyArcs: StoryArcsFile | null;
  chapterMemory: ChapterMemoryIndex | null;
  qualityMetrics: QualityMetrics;
  collisions: Collision[];
  episodes: EpisodePlan[];
  state: StoryState;
  chapterNumbers: number[];
  hasUniverse: boolean;
  candidateCollisions: number;
  nextRecommendedCollision: Collision | null;
  simState: UniverseSimState | null;
  cycleLog: NarrativeCycleLog | null;
  activeCycleRun: CycleRun | null;
  cycleRunHistory: CycleRun[];
}

export async function getUniverseDetail(novelId: string): Promise<UniverseDetail> {
  const summary = await narrativePipeline.getUniverseSummary(novelId);
  const candidates = summary.collisions.filter((c) => c.status === 'candidate');
  const pacing = computePacingRecommendation(
    summary.chapterMemory?.entries ?? [],
    await novelStore.listReviews(novelId),
    summary.state.lastChapterNumber
  );
  const nextRecommended = pickBestCollision(summary.collisions, (type) =>
    collisionTypeBoost(type, pacing)
  );

  const [simState, cycleLog, activeCycleRun, cycleRunHistoryFile] = await Promise.all([
    narrativeStore.loadUniverseSimState(novelId),
    narrativeStore.loadNarrativeCycleLog(novelId),
    narrativeStore.loadCycleRun(novelId),
    narrativeStore.loadCycleRunHistory(novelId),
  ]);

  return {
    ...summary,
    hasUniverse: Boolean(summary.bible && summary.world && summary.hero),
    candidateCollisions: candidates.length,
    nextRecommendedCollision: nextRecommended,
    simState,
    cycleLog,
    activeCycleRun: activeCycleRun?.status === 'running' ? activeCycleRun : null,
    cycleRunHistory: cycleRunHistoryFile.runs,
  };
}

export async function enqueueBuildUniverse(
  novelId: string,
  opts?: { worldEventCount?: number; heroEventCount?: number }
) {
  return enqueueJob(novelId, 'build-universe', opts ?? {}, {
    maxAttempts: MAX_CYCLE_ATTEMPTS,
  });
}

export async function enqueueDiscoverCollisions(novelId: string, maxCollisions = 6) {
  return enqueueJob(novelId, 'discover-collisions', { maxCollisions }, {
    maxAttempts: MAX_CYCLE_ATTEMPTS,
  });
}

export async function enqueuePlanEpisode(
  novelId: string,
  options?: {
    collisionId?: string;
    heroEventId?: string;
    autoDiscoverCollisions?: boolean;
    maxCollisions?: number;
  }
) {
  return enqueueJob(novelId, 'plan-episode', options ?? {}, {
    maxAttempts: MAX_CYCLE_ATTEMPTS,
  });
}

export async function enqueueWriteEpisode(
  novelId: string,
  episodeNumber: number,
  targetWords?: number
) {
  return enqueueJob(novelId, 'write-episode', { episodeNumber, targetWords }, {
    maxAttempts: MAX_CYCLE_ATTEMPTS,
  });
}

export async function enqueueUniverseTick(
  novelId: string,
  opts?: {
    tickDays?: number;
    autoDiscoverCollisions?: boolean;
    maxCollisions?: number;
  }
) {
  return enqueueJob(novelId, 'universe-tick', opts ?? {});
}

export async function enqueueNarrativeCycle(
  novelId: string,
  opts?: {
    tickDays?: number;
    autoDiscoverCollisions?: boolean;
    maxCollisions?: number;
    collisionId?: string;
    episodeNumber?: number;
    targetWords?: number;
    skipWrite?: boolean;
  }
) {
  const { job } = await startCycleChain(novelId, opts ?? {});
  return job;
}

export interface StopProductionResult {
  scheduleDisabled: boolean;
  cancelledCycle: boolean;
  cancelledPendingJobs: number;
  cancelledRunningJobs: number;
  runningJobNote: string | null;
}

/** 停止定时调度、取消排队/执行中任务、终止进行中的周期链 */
export async function stopNovelProduction(novelId: string): Promise<StopProductionResult> {
  const schedule = await upsertSchedule(novelId, { enabled: false });
  const cancelledCycle = Boolean(await stopCycleChain(novelId));
  const cancelledJobs = await cancelActiveJobsForNovel(novelId);

  return {
    scheduleDisabled: !schedule.enabled,
    cancelledCycle,
    cancelledPendingJobs: cancelledJobs.pending,
    cancelledRunningJobs: cancelledJobs.running,
    runningJobNote:
      cancelledJobs.running > 0
        ? '执行中任务已从队列标记为停止；底层 LLM 调用可能仍会自然返回，但不会续跑周期链'
        : null,
  };
}

export async function getPendingJobCount(novelId: string): Promise<number> {
  return countPendingJobsForNovel(novelId);
}
