/**
 * 小说聚合服务 — 供 API 与页面使用
 */
import * as store from '../novel/store.js';
import * as pipeline from '../novel/pipeline.js';
import * as narrativeStore from '../narrative/store.js';
import {
  buildStoryStateTailAfterDelete,
  removeChapterMemoryEntry,
} from '../narrative/memory.js';
import { listJobsForNovel, getScheduleForNovel } from '../jobs/queue.js';
import type { InitNovelInput, NovelMeta, Outline, ReviewResult, StoryState } from '../novel/types.js';
import type { Job, Schedule } from '../jobs/types.js';
import type { EpisodePlan } from '../narrative/types.js';

export interface NovelListItem {
  id: string;
  title: string;
  genre: string;
  protagonist: string;
  style: string;
  lastChapterNumber: number;
  hasOutline: boolean;
  plannedChapters: number;
  scheduleEnabled: boolean;
  hasUniverse: boolean;
  candidateCollisions: number;
  worldDay: number;
  updatedAt: string;
}

export interface NovelDetail {
  meta: NovelMeta;
  state: StoryState;
  outline: Outline | null;
  chapterNumbers: number[];
  recentJobs: Job[];
  schedule: Schedule | null;
}

export async function listNovelSummaries(): Promise<NovelListItem[]> {
  const ids = await store.listNovels();
  const items: NovelListItem[] = [];

  for (const id of ids) {
    try {
      const summary = await pipeline.getNovelSummary(id);
      const schedule = await getScheduleForNovel(id);
      const hasUniverse = await narrativeStore.hasUniverse(id);
      const world = await narrativeStore.loadWorldTimeline(id);
      const collisions = await narrativeStore.loadCollisions(id);
      const candidates = collisions?.collisions.filter((c) => c.status === 'candidate').length ?? 0;
      items.push({
        id: summary.meta.id,
        title: summary.meta.title,
        genre: summary.meta.genre,
        protagonist: summary.meta.protagonist,
        style: summary.meta.style,
        lastChapterNumber: summary.state.lastChapterNumber,
        hasOutline: Boolean(summary.outline),
        plannedChapters: summary.chapterCount,
        scheduleEnabled: schedule?.enabled ?? false,
        hasUniverse,
        candidateCollisions: candidates,
        worldDay: world?.currentDay ?? 0,
        updatedAt: summary.state.updatedAt,
      });
    } catch {
      // 跳过损坏的作品目录
    }
  }

  return items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getNovelDetail(novelId: string): Promise<NovelDetail> {
  const summary = await pipeline.getNovelSummary(novelId);
  const chapterNumbers = await store.listChapterNumbers(novelId);
  const recentJobs = await listJobsForNovel(novelId);
  const schedule = await getScheduleForNovel(novelId);

  return {
    meta: summary.meta,
    state: summary.state,
    outline: summary.outline,
    chapterNumbers,
    recentJobs,
    schedule,
  };
}

export async function createNovel(input: InitNovelInput): Promise<NovelMeta> {
  return store.initNovel(input);
}

export async function saveChapterContent(
  novelId: string,
  chapterNumber: number,
  content: string,
  title?: string
): Promise<{ title: string; chapterNumber: number; wordCount: number }> {
  const episodes = await narrativeStore.listEpisodes(novelId);
  const episode = episodes.find((e) => e.chapterNumber === chapterNumber);
  const outline = await store.loadOutline(novelId);
  const chapterOutline = outline?.chapters.find((c) => c.chapterNumber === chapterNumber);
  const resolvedTitle = title ?? episode?.title ?? chapterOutline?.title ?? `第${chapterNumber}章`;
  const wordCount = content.replace(/\s/g, '').length;

  await store.saveChapter(novelId, chapterNumber, resolvedTitle, content);

  if (episode && title && title !== episode.title) {
    const updated: EpisodePlan = { ...episode, title };
    await narrativeStore.saveEpisode(novelId, updated);
  }

  const memoryIndex = await narrativeStore.loadChapterMemoryIndex(novelId);
  const memoryEntry = memoryIndex?.entries.find((e) => e.chapterNumber === chapterNumber);
  if (memoryEntry) {
    const { appendChapterMemory } = await import('../narrative/memory.js');
    await appendChapterMemory(novelId, {
      ...memoryEntry,
      title: resolvedTitle,
      wordCount,
    });
  }

  return { title: resolvedTitle, chapterNumber, wordCount };
}

export interface DeleteChapterResult {
  chapterNumber: number;
  deletedFiles: string[];
  lastChapterNumber: number;
}

/** 删除章节正文并回滚关联叙事状态 */
export async function deleteChapter(
  novelId: string,
  chapterNumber: number
): Promise<DeleteChapterResult> {
  const exists = await store.loadChapter(novelId, chapterNumber);
  if (!exists) throw new Error(`第 ${chapterNumber} 章不存在`);

  const episodes = await narrativeStore.listEpisodes(novelId);
  const linkedEpisode = episodes.find((e) => e.chapterNumber === chapterNumber);

  const deletedFiles: string[] = [];
  if (await store.deleteChapterFile(novelId, chapterNumber)) {
    deletedFiles.push(`chapters/${String(chapterNumber).padStart(4, '0')}.md`);
  }
  if (await store.deleteReviewFile(novelId, chapterNumber)) {
    deletedFiles.push(`reviews/${String(chapterNumber).padStart(4, '0')}.json`);
  }

  await removeChapterMemoryEntry(novelId, chapterNumber);

  if (linkedEpisode) {
    const { chapterNumber: _removed, writingDrafts: _drafts, ...rest } = linkedEpisode;
    const reset: EpisodePlan = { ...rest, status: 'confirmed' };
    await narrativeStore.saveEpisode(novelId, reset);
  }

  const heroTimeline = await narrativeStore.loadHeroTimeline(novelId);
  let heroChanged = false;
  if (heroTimeline && linkedEpisode?.heroEventIds?.length) {
    for (const heroEventId of linkedEpisode.heroEventIds) {
      const idx = heroTimeline.events.findIndex((e) => e.id === heroEventId);
      if (idx < 0) continue;
      if (heroTimeline.events[idx].usedInChapter === chapterNumber) {
        delete heroTimeline.events[idx].usedInChapter;
        if (heroTimeline.events[idx].status === 'resolved') {
          heroTimeline.events[idx].status = 'planned';
        }
        heroChanged = true;
      }
    }
  }

  const remaining = await store.listChapterNumbers(novelId);
  const lastChapterNumber = remaining.length > 0 ? remaining[remaining.length - 1]! : 0;

  const state = await store.loadStoryState(novelId);
  const memory = await narrativeStore.loadChapterMemoryIndex(novelId);
  const tail = buildStoryStateTailAfterDelete(state, memory, lastChapterNumber);

  const newState: StoryState = {
    ...state,
    ...tail,
    updatedAt: new Date().toISOString(),
  };

  if (lastChapterNumber === 1) {
    const ep1 = episodes.find((e) => e.chapterNumber === 1) ?? episodes.find((e) => e.episodeNumber === 1);
    if (ep1) {
      newState.characters = [
        {
          name: '沈知闲',
          role: '主角',
          traits: ['观察力强', '算账精', '省力型选手'],
          currentStatus:
            '内门弟子，练气中期；完成登记造册，领到首月三十块下品灵石；清气护体玉符底子已废',
          relationships: {},
        },
        {
          name: '苏岁安',
          role: '同期内门弟子',
          traits: ['嘴碎', '消息灵通'],
          currentStatus: '摸底对练后主动搭话，暗示庶务殿新规与天机商会有关',
          relationships: {},
        },
        {
          name: '孙彪',
          role: '摸底对练对手',
          traits: ['练气后期', '外门苦修盟出身'],
          currentStatus: '事务堂侧殿摸底对练负于沈知闲',
          relationships: {},
        },
      ];
      newState.openThreads = [
        '查清贡献点兑换细则与庶务殿最新通告',
        '三个月内晋升真传候选人',
        '令牌灵纹异常原因待查',
        '补齐护体手段（玉符已废）',
      ];
      newState.foreshadowing = ep1.foreshadowing.map((desc, i) => ({
        id: `fs_${i + 1}`,
        description: desc,
        introducedInChapter: 1,
        resolved: false,
      }));
    }
  }

  if (heroTimeline && lastChapterNumber <= 1) {
    heroTimeline.crisis =
      '令牌灵纹校验异常；清气护体玉符底子已废；贡献点细则存在“以最新通告为准”的不确定性';
    heroTimeline.protagonistGoal =
      '在三个月内晋升真传候选人；摸清修炼资源与贡献点兑换流程';
    heroChanged = true;
  }
  if (heroTimeline && heroChanged) {
    heroTimeline.updatedAt = new Date().toISOString();
    await narrativeStore.saveHeroTimeline(novelId, heroTimeline);
  }

  await store.saveStoryState(novelId, newState);

  return { chapterNumber, deletedFiles, lastChapterNumber };
}

export async function getChapterContent(
  novelId: string,
  chapterNumber: number
): Promise<{ title: string; content: string; review: ReviewResult | null }> {
  const episodes = await narrativeStore.listEpisodes(novelId);
  const episode = episodes.find((e) => e.chapterNumber === chapterNumber);
  const outline = await store.loadOutline(novelId);
  const chapterOutline = outline?.chapters.find((c) => c.chapterNumber === chapterNumber);
  const title = episode?.title ?? chapterOutline?.title ?? `第${chapterNumber}章`;
  const content = await store.loadChapter(novelId, chapterNumber);
  if (!content) throw new Error(`第 ${chapterNumber} 章不存在`);

  const review = await store.loadReview(novelId, chapterNumber);
  return { title, content, review };
}
