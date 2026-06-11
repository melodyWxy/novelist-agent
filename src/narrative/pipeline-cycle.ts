/**
 * 单体叙事周期 — tick → 选碰撞 → 事件包 → 写章（单进程一次跑完）
 *
 * 生产环境请用 `cycle-chain.ts` 拆成多 job；本模块供 dry-run、smoke test、`narrative-cycle` job 使用。
 * 指定 `episodeNumber` / `collisionId` 时自动 `tickDays=0`，与周期链断点语义一致。
 */
import { LlmClient } from '../llm/client.js';
import { toErrorMessage } from '../lib/errors.js';
import * as narrativeStore from './store.js';
import { tickUniverse } from './world-simulator.js';
import { discoverCollisions, planEpisodeFromCollision, writeEpisodeChapter } from './pipeline.js';
import { pickBestCollision } from './disclosure.js';
import { recordCycleFailure, type CycleStage } from './cycle-retry.js';
import type { Collision, EpisodePlan, NarrativeCycleLog, WriteEpisodeOptions } from './types.js';

export interface NarrativeCycleOptions {
  /** 推进天数；0 表示跳过 tick */
  tickDays?: number;
  autoDiscoverCollisions?: boolean;
  maxCollisions?: number;
  /** 指定碰撞；未指定则自动选最优候选 */
  collisionId?: string;
  /** 断点续跑：已有事件包，跳过 plan 直接写章 */
  episodeNumber?: number;
  skipWrite?: boolean;
  targetWords?: number;
  writeOptions?: Omit<WriteEpisodeOptions, 'targetWords'>;
}

export interface NarrativeCycleResult {
  ticked: boolean;
  tickToDay?: number;
  collision: Collision;
  episode: EpisodePlan;
  chapter?: {
    chapterNumber: number;
    title: string;
    wordCount: number;
  };
  log: NarrativeCycleLog;
}

export async function pickCycleCollision(
  llm: LlmClient,
  novelId: string,
  collisionId: string | undefined,
  autoDiscover: boolean,
  maxCollisions: number
): Promise<Collision> {
  let file = await narrativeStore.loadCollisions(novelId);
  let collisions = file?.collisions ?? [];

  if (collisionId) {
    const picked = collisions.find((c) => c.id === collisionId);
    if (!picked) throw new Error(`碰撞点 ${collisionId} 不存在`);
    if (picked.status !== 'candidate' && picked.status !== 'accepted') {
      throw new Error(`碰撞「${picked.title}」状态为 ${picked.status}，无法用于写章`);
    }
    return picked;
  }

  let best = pickBestCollision(collisions);
  if (!best && autoDiscover) {
    collisions = await discoverCollisions(llm, novelId, maxCollisions);
    best = pickBestCollision(collisions);
  }

  if (!best) {
    throw new Error('无可用碰撞候选，请先推进世界或手动发现碰撞');
  }
  return best;
}

async function resolveEpisode(
  llm: LlmClient,
  novelId: string,
  collision: Collision,
  episodeNumber: number | undefined
): Promise<EpisodePlan> {
  if (episodeNumber) {
    const existing = await narrativeStore.loadEpisode(novelId, episodeNumber);
    if (!existing) throw new Error(`事件包 #${episodeNumber} 不存在`);
    return existing;
  }
  return planEpisodeFromCollision(llm, novelId, collision.id);
}

export async function runNarrativeCycle(
  llm: LlmClient,
  novelId: string,
  options: NarrativeCycleOptions = {}
): Promise<NarrativeCycleResult> {
  const autoDiscover = options.autoDiscoverCollisions !== false;
  const maxCollisions = options.maxCollisions ?? 6;
  const skipWrite = options.skipWrite === true;
  const now = new Date().toISOString();

  let tickDays = options.tickDays ?? 1;
  // 续跑：已有碰撞/事件包时不再推进世界
  if (options.episodeNumber || options.collisionId) {
    tickDays = 0;
  }

  let ticked = false;
  let tickToDay: number | undefined;
  let collision: Collision | undefined;
  let episode: EpisodePlan | undefined;
  let stage: CycleStage = 'tick';

  try {
    if (tickDays > 0) {
      stage = 'tick';
      const tickResult = await tickUniverse(llm, novelId, {
        tickDays,
        autoDiscoverCollisions: autoDiscover,
        maxCollisions,
      });
      ticked = true;
      tickToDay = tickResult.toDay;
    }

    stage = 'collision';
    collision = await pickCycleCollision(
      llm,
      novelId,
      options.collisionId,
      autoDiscover,
      maxCollisions
    );

    stage = 'plan';
    episode = await resolveEpisode(llm, novelId, collision, options.episodeNumber);

    let chapter: NarrativeCycleResult['chapter'];
    if (!skipWrite) {
      stage = 'write';
      const written = await writeEpisodeChapter(llm, novelId, episode.episodeNumber, {
        targetWords: options.targetWords,
        ...options.writeOptions,
      });
      chapter = {
        chapterNumber: written.chapterNumber,
        title: written.title,
        wordCount: written.wordCount,
      };
    }

    const prev = await narrativeStore.loadNarrativeCycleLog(novelId);
    const log: NarrativeCycleLog = {
      lastRunAt: now,
      tickDays: ticked ? tickDays : 0,
      skippedTick: !ticked,
      skippedWrite: skipWrite,
      collisionId: collision.id,
      collisionTitle: collision.title,
      episodeNumber: episode.episodeNumber,
      chapterNumber: chapter?.chapterNumber,
      chapterTitle: chapter?.title,
      wordCount: chapter?.wordCount,
      runsTotal: (prev?.runsTotal ?? 0) + 1,
      lastStatus: 'success',
      lastError: undefined,
      failedStage: undefined,
      lastFailedAt: undefined,
      consecutiveFailures: 0,
      resume: undefined,
    };
    await narrativeStore.saveNarrativeCycleLog(novelId, log);

    return { ticked, tickToDay, collision, episode, chapter, log };
  } catch (error) {
    const message = toErrorMessage(error);
    await recordCycleFailure(novelId, {
      stage,
      error: message,
      ticked,
      tickDays,
      collision,
      episodeNumber: episode?.episodeNumber ?? options.episodeNumber,
    });
    throw error;
  }
}
