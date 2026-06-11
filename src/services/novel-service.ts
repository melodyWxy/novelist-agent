/**
 * 小说聚合服务 — 供 API 与页面使用
 */
import * as store from '../novel/store.js';
import * as pipeline from '../novel/pipeline.js';
import * as narrativeStore from '../narrative/store.js';
import { listJobsForNovel, getScheduleForNovel } from '../jobs/queue.js';
import type { InitNovelInput, NovelMeta, Outline, ReviewResult, StoryState } from '../novel/types.js';
import type { Job, Schedule } from '../jobs/types.js';

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
): Promise<{ title: string; chapterNumber: number }> {
  const episodes = await narrativeStore.listEpisodes(novelId);
  const episode = episodes.find((e) => e.chapterNumber === chapterNumber);
  const outline = await store.loadOutline(novelId);
  const chapterOutline = outline?.chapters.find((c) => c.chapterNumber === chapterNumber);
  const resolvedTitle = title ?? episode?.title ?? chapterOutline?.title ?? `第${chapterNumber}章`;

  await store.saveChapter(novelId, chapterNumber, resolvedTitle, content);
  return { title: resolvedTitle, chapterNumber };
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
