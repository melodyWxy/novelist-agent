/**
 * 长篇连载质量指标聚合
 */
import * as novelStore from '../novel/store.js';
import * as narrativeStore from './store.js';
import { computePacingRecommendation } from './pacing.js';
import { getCurrentStoryArc } from './memory.js';
import type { StoryArc, ChapterMemoryEntry } from './types.js';

export interface QualityMetrics {
  totalChapters: number;
  totalWords: number;
  avgReviewScore: number | null;
  passRate: number | null;
  recentScores: Array<{ chapterNumber: number; score: number; wordCount: number; passed: boolean }>;
  openForeshadowing: number;
  resolvedForeshadowing: number;
  currentArc: StoryArc | null;
  pacingNote: string;
  recentMemories: ChapterMemoryEntry[];
}

export async function getQualityMetrics(novelId: string): Promise<QualityMetrics> {
  const [state, memory, storyArcs, chapterNumbers, reviews] = await Promise.all([
    novelStore.loadStoryState(novelId),
    narrativeStore.loadChapterMemoryIndex(novelId),
    narrativeStore.loadStoryArcs(novelId),
    novelStore.listChapterNumbers(novelId),
    novelStore.listReviews(novelId),
  ]);

  const entries = memory?.entries ?? [];
  const totalWords = entries.reduce((sum, e) => sum + e.wordCount, 0);
  const scores = reviews.map((r) => r.score).filter((s): s is number => s != null);
  const passed = reviews.filter((r) => r.passed).length;

  const lastChapter = state.lastChapterNumber;
  const pacing = computePacingRecommendation(entries, reviews, lastChapter);
  const currentArc = getCurrentStoryArc(storyArcs, lastChapter + 1);

  const recentScores = reviews
    .slice(-8)
    .map((r) => {
      const mem = entries.find((e) => e.chapterNumber === r.chapterNumber);
      return {
        chapterNumber: r.chapterNumber,
        score: r.score ?? 0,
        wordCount: mem?.wordCount ?? 0,
        passed: r.passed,
      };
    });

  return {
    totalChapters: chapterNumbers.length,
    totalWords,
    avgReviewScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    passRate: reviews.length ? passed / reviews.length : null,
    recentScores,
    openForeshadowing: state.foreshadowing.filter((f) => !f.resolved).length,
    resolvedForeshadowing: state.foreshadowing.filter((f) => f.resolved).length,
    currentArc,
    pacingNote: pacing.pacingNote,
    recentMemories: entries.slice(-5),
  };
}
