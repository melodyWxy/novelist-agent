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

const ADMIN_BUREAUCRACY_KEYWORDS = [
  '贡献点',
  '公示阁',
  '积分',
  '底簿',
  '巡视',
  '朱砂',
  '笔锋',
  '印泥',
  '核对',
  '查验',
  '登记',
  '查账',
  '核验',
  '远距观察',
  '偷看',
];

function isAdminHeavyChapter(m: ChapterMemoryEntry): boolean {
  const text = `${m.title} ${m.summary} ${m.keyEvents.join(' ')}`;
  const hits = ADMIN_BUREAUCRACY_KEYWORDS.filter((k) => text.includes(k)).length;
  return hits >= 2 || (hits >= 1 && /查账|核验|远距|偷看|对照|底簿/.test(text));
}

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

  const recentAdminCount = recentMemories.filter(isAdminHeavyChapter).length;
  const adminHeavyStreak =
    recentMemories.length >= 2 &&
    recentMemories.slice(-2).every(isAdminHeavyChapter);

  let suggestedCollisionTypes: CollisionType[];
  let pacingNote: string;

  if (adminHeavyStreak || recentAdminCount >= 3) {
    suggestedCollisionTypes = ['relationship', 'location', 'value', 'time'];
    pacingNote =
      '近期连续办事/查账/积分类章节过多，本章强制换大格戏：人物交锋、外出任务、公开试炼、同门恩怨或险境，制度细节仅作背景';
  } else if (avgRecentScore != null && avgRecentScore < 70) {
    suggestedCollisionTypes = ['information', 'relationship', 'location'];
    pacingNote = '近期审稿分偏低，优先选信息差/关系/场景型碰撞，降低混战复杂度';
  } else if (needsRecoveryChapter) {
    suggestedCollisionTypes = ['relationship', 'value', 'information'];
    pacingNote = '连续战力推进，建议休整章：人物关系、价值冲突、情报整理';
  } else if (needsUpgradeChapter) {
    suggestedCollisionTypes = ['relationship', 'value', 'location', 'information'];
    pacingNote =
      '多章无明确战力/资源收益，优先人物冲突、公开胜负、外出任务或情报破局，勿再堆贡献点/公示阁办事戏';
  } else if (recentPayoffRatio > 0.6) {
    suggestedCollisionTypes = ['time', 'relationship', 'information'];
    pacingNote = '爽点密度较高，穿插探索、关系与伏笔铺垫，避免连续硬升级';
  } else {
    suggestedCollisionTypes = ['relationship', 'location', 'value', 'information'];
    pacingNote = '维持升级与叙事平衡，人物/场景/价值类碰撞优先，资源类碰撞勿连续';
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
