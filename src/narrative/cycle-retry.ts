/**
 * 叙事周期失败记录与断点续跑
 *
 * 单体 `narrative-cycle` job 与周期链各阶段 job 共用同一套 resume 语义：
 * - tick 失败 → 从头含 tick
 * - collision 失败 → 若已 tick 则 skipTick
 * - plan / write 失败 → skipTick + 保留碰撞/事件包 ID
 */
import * as narrativeStore from './store.js';

/** 周期自动/手动重试的默认上限（worker、queue、cycle-chain 共用） */
export const MAX_CYCLE_ATTEMPTS = 3;
import type { Collision, CycleResume, NarrativeCycleLog } from './types.js';

export type CycleStage = 'tick' | 'collision' | 'plan' | 'write';

export interface CycleFailureContext {
  stage: CycleStage;
  error: string;
  ticked: boolean;
  tickDays: number;
  collision?: Collision;
  episodeNumber?: number;
}

export function buildResumeFromFailure(ctx: CycleFailureContext): CycleResume {
  switch (ctx.stage) {
    case 'tick':
      return { skipTick: false };
    case 'collision':
      return { skipTick: ctx.ticked };
    case 'plan':
      return {
        skipTick: true,
        collisionId: ctx.collision?.id,
      };
    case 'write':
      return {
        skipTick: true,
        collisionId: ctx.collision?.id,
        episodeNumber: ctx.episodeNumber,
      };
    default:
      return { skipTick: false };
  }
}

export async function recordCycleFailure(
  novelId: string,
  ctx: CycleFailureContext
): Promise<NarrativeCycleLog> {
  const prev = await narrativeStore.loadNarrativeCycleLog(novelId);
  const now = new Date().toISOString();
  const resume = buildResumeFromFailure(ctx);

  const log: NarrativeCycleLog = {
    lastRunAt: prev?.lastRunAt ?? now,
    tickDays: prev?.tickDays ?? 0,
    skippedTick: prev?.skippedTick ?? false,
    skippedWrite: prev?.skippedWrite ?? false,
    collisionId: ctx.collision?.id ?? prev?.collisionId,
    collisionTitle: ctx.collision?.title ?? prev?.collisionTitle,
    episodeNumber: ctx.episodeNumber ?? prev?.episodeNumber,
    chapterNumber: prev?.chapterNumber,
    chapterTitle: prev?.chapterTitle,
    wordCount: prev?.wordCount,
    runsTotal: prev?.runsTotal ?? 0,
    lastStatus: 'failed',
    lastError: ctx.error,
    failedStage: ctx.stage,
    lastFailedAt: now,
    consecutiveFailures:
      prev?.lastStatus === 'failed' ? (prev.consecutiveFailures ?? 0) + 1 : 1,
    resume,
    lastJobId: undefined,
  };

  await narrativeStore.saveNarrativeCycleLog(novelId, log);
  return log;
}

export function applyResumeToPayload(
  payload: {
    tickDays?: number;
    collisionId?: string;
    episodeNumber?: number;
  },
  resume?: CycleResume
): void {
  if (!resume) return;
  if (resume.skipTick) {
    payload.tickDays = 0;
  }
  if (resume.collisionId) {
    payload.collisionId = resume.collisionId;
  }
  if (resume.episodeNumber) {
    payload.episodeNumber = resume.episodeNumber;
  }
}
