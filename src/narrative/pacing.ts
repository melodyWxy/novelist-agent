/**
 * 连载节奏控制器 — 根据近期章节调整碰撞/事件包倾向
 */
import type { CollisionType, ChapterMemoryEntry } from './types.js';
import type { ReviewResult } from '../novel/types.js';

export interface PacingRecommendation {
  suggestedCollisionTypes: CollisionType[];
  pacingNote: string;
  recentPayoffRatio: number;
  needsUpgradeChapter: boolean;
  needsRecoveryChapter: boolean;
  avgRecentScore: number | null;
}

const ALL_TYPES: CollisionType[] = [
  'time',
  'location',
  'resource',
  'value',
  'information',
  'relationship',
];

export function computePacingRecommendation(
  memories: ChapterMemoryEntry[],
  reviews: ReviewResult[],
  lastChapterNumber: number
): PacingRecommendation {
  const recentMemories = memories
    .filter((m) => m.chapterNumber > lastChapterNumber - 6 && m.chapterNumber <= lastChapterNumber)
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  const recentReviews = reviews
    .filter((r) => r.chapterNumber > lastChapterNumber - 6 && r.chapterNumber <= lastChapterNumber)
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  const payoffChapters = recentMemories.filter(
    (m) => m.powerChanges.length > 0 || m.itemChanges.length > 0
  ).length;
  const recentPayoffRatio =
    recentMemories.length > 0 ? payoffChapters / recentMemories.length : 0;

  const scores = recentReviews.map((r) => r.score).filter((s): s is number => s != null);
  const avgRecentScore =
    scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  const needsUpgradeChapter =
    recentMemories.length >= 3 && payoffChapters === 0 && lastChapterNumber >= 3;
  const needsRecoveryChapter =
    recentMemories.length >= 2 &&
    recentMemories.slice(-2).every((m) => m.powerChanges.length > 0);

  let suggestedCollisionTypes: CollisionType[];
  let pacingNote: string;

  if (avgRecentScore != null && avgRecentScore < 70) {
    suggestedCollisionTypes = ['information', 'relationship', 'location'];
    pacingNote = '近期审稿分偏低，优先选信息差/关系/场景型碰撞，降低混战复杂度';
  } else if (needsRecoveryChapter) {
    suggestedCollisionTypes = ['relationship', 'value', 'information'];
    pacingNote = '连续战力推进，建议休整章：人物关系、价值冲突、情报整理';
  } else if (needsUpgradeChapter) {
    suggestedCollisionTypes = ['resource', 'information', 'value'];
    pacingNote = '多章无明确战力/资源收益，优先资源争夺、情报破局、价值冲突类碰撞';
  } else if (recentPayoffRatio > 0.6) {
    suggestedCollisionTypes = ['time', 'relationship', 'information'];
    pacingNote = '爽点密度较高，穿插探索、关系与伏笔铺垫，避免连续硬升级';
  } else {
    suggestedCollisionTypes = ['resource', 'location', 'information', 'value'];
    pacingNote = '维持升级与叙事平衡，资源/地点/信息类碰撞均可';
  }

  return {
    suggestedCollisionTypes,
    pacingNote,
    recentPayoffRatio,
    needsUpgradeChapter,
    needsRecoveryChapter,
    avgRecentScore,
  };
}

export function collisionTypeBoost(
  collisionType: CollisionType,
  recommendation: PacingRecommendation
): number {
  const idx = recommendation.suggestedCollisionTypes.indexOf(collisionType);
  if (idx === 0) return 3;
  if (idx > 0) return 2;
  if (ALL_TYPES.includes(collisionType)) return 0;
  return 0;
}
