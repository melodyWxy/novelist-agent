/**
 * 双线叙事 Pipeline
 *
 * WorldBuilder → WorldTimeline → HeroTimeline → CollisionDesigner → EpisodePlanner → ChapterWriter → DualLineReview → StateUpdater
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  LlmClient,
  TEXT_OUTPUT_TRUNCATED_ERROR,
  UNIVERSE_LLM_OPTIONS,
  type ChatMessage,
  type ChatOptions,
} from '../llm/client.js';
import * as novelStore from '../novel/store.js';
import * as narrativeStore from './store.js';
import { buildWorldBiblePrompt, buildWorldTimelinePrompt } from '../prompts/world-builder.js';
import { buildHeroTimelinePrompt } from '../prompts/hero-planner.js';
import { buildSupportTimelinePrompt } from '../prompts/support-planner.js';
import { buildCollisionDesignerPrompt } from '../prompts/collision-designer.js';
import { buildEpisodePlannerPrompt } from '../prompts/episode-planner.js';
import { buildHeroEpisodePlannerPrompt } from '../prompts/hero-episode-planner.js';
import { buildEpisodeWritePrompt } from '../prompts/episode-write.js';
import { buildEpisodeSurfaceWritePrompt } from '../prompts/episode-surface-write.js';
import { buildEpisodeShadowWeavePrompt } from '../prompts/episode-shadow-weave.js';
import { buildEpisodeLeakRewritePrompt } from '../prompts/episode-leak-rewrite.js';
import { buildEpisodeReviewRewritePrompt } from '../prompts/episode-review-rewrite.js';
import { buildConceptExplainerRewritePrompt } from '../prompts/concept-explainer-rewrite.js';
import { buildDualLineReviewPrompt } from '../prompts/dual-line-review.js';
import { buildDualLineStateUpdatePrompt } from '../prompts/dual-line-state-update.js';
import { buildPowerSystemPrompt } from '../prompts/power-system.js';
import { buildStoryArcsPrompt } from '../prompts/story-arcs.js';
import {
  appendChapterMemory,
  advanceStoryArcs,
  buildChapterMemoryEntry,
  buildCompactWritingContext,
  buildWorldOnboardingGuidance,
  formatRecentChaptersForPlanner,
  getCurrentStoryArc,
  isDuplicateEpisodeTitle,
} from './memory.js';
import { checkPowerConsistency } from './power-review.js';
import {
  findUnexplainedConceptsInContent,
  markConceptsExplained,
  syncConceptIntroductions,
} from './concept-introductions.js';
import { computePacingRecommendation, collisionTypeBoost } from './pacing.js';
import { getQualityMetrics } from './quality-metrics.js';
import {
  WorldBibleOutputSchema,
  WorldTimelineOutputSchema,
  HeroTimelineOutputSchema,
  SupportTimelineOutputSchema,
  CollisionsOutputSchema,
  EpisodePlanOutputSchema,
  DualLineReviewSchema,
  DualLineStateUpdateSchema,
  PowerSystemOutputSchema,
  StoryArcsOutputSchema,
  type StoryArcsFile,
  type ChapterMemoryIndex,
  type WorldBible,
  type WorldTimeline,
  type HeroTimeline,
  type SupportTimeline,
  type Collision,
  type EpisodePlan,
  type DualLineReview,
  type PowerSystemFile,
  type CharacterAssetsFile,
  type CharacterAsset,
  EpisodePlanSchema,
  type WriteEpisodeOptions,
  type WriteEpisodeMeta,
} from './types.js';
import type { NovelMeta, StoryState } from '../novel/types.js';
import {
  enrichCollisionScores,
  collisionRankScore,
  normalizeEpisodePlan,
  extractForbiddenTerms,
  detectHiddenLineLeak,
  applyHeroGainsToTimeline,
  sanitizeHeroEventFacts,
} from './disclosure.js';
import { mergeDiscoveredCollisions } from './timeline-editor.js';
import { normalizeEventSortOrders, nextSortOrderOnDay } from './timeline-sort.js';
import {
  pickNextHeroEvent,
  pickBestCollisionForHeroEvent,
  findNearbyWorldEvents,
  findNearbySupportEvents,
  isPlaceholderHeroEvent,
  markEpisodeHeroEventsUsed,
} from './hero-selection.js';
import { countChars } from '../lib/text.js';
import type { ReviewResult } from '../novel/types.js';

/** 双线审稿 issue.category → 经典 ReviewResult.category（落盘到 reviews/ 用） */
const DUAL_LINE_REVIEW_CATEGORY_MAP: Record<
  | 'world_causality'
  | 'hero_knowledge'
  | 'hidden_line_leak'
  | 'collision'
  | 'continuity'
  | 'pacing'
  | 'style'
  | 'power_consistency'
  | 'other',
  ReviewResult['issues'][number]['category']
> = {
  world_causality: 'logic',
  hero_knowledge: 'logic',
  collision: 'logic',
  hidden_line_leak: 'other',
  continuity: 'continuity',
  pacing: 'pacing',
  style: 'style',
  power_consistency: 'logic',
  other: 'other',
};

const STANDARD_XIANXIA_RANKS = ['练气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'];

const XIANXIA_RANK_REPLACEMENTS: Array<[RegExp, string]> = [
  [/引气序/g, '练气'],
  [/练气序/g, '练气'],
  [/筑基序/g, '筑基'],
  [/结丹序/g, '金丹'],
  [/金丹序/g, '金丹'],
  [/元婴序/g, '元婴'],
  [/化神序/g, '化神'],
  [/炼虚序/g, '炼虚'],
  [/合体序/g, '合体'],
  [/大乘序/g, '大乘'],
  [/渡劫序/g, '渡劫'],
  [/太虚九序/g, '通用修仙境界'],
];

function shouldUseStandardXianxiaRanks(meta: NovelMeta, bible: WorldBible): boolean {
  const source = `${meta.genre} ${meta.worldSetting ?? ''} ${bible.powerSystem ?? ''}`;
  return /修仙|仙侠/.test(source) && /练气/.test(source) && /筑基/.test(source);
}

function normalizeXianxiaRankText(text: string): string {
  return XIANXIA_RANK_REPLACEMENTS.reduce((next, [pattern, replacement]) => {
    return next.replace(pattern, replacement);
  }, text);
}

function normalizePowerSystemForMeta(
  meta: NovelMeta,
  bible: WorldBible,
  powerSystem: PowerSystemFile
): PowerSystemFile {
  if (!shouldUseStandardXianxiaRanks(meta, bible)) return powerSystem;

  return {
    ...powerSystem,
    systemName: normalizeXianxiaRankText(powerSystem.systemName).replace(/·清虚宗门道阶制/g, '体系'),
    coreEnergy: normalizeXianxiaRankText(powerSystem.coreEnergy),
    rankUnit: '境界',
    ranks: powerSystem.ranks.map((rank, index) => ({
      ...rank,
      name: STANDARD_XIANXIA_RANKS[index] ?? normalizeXianxiaRankText(rank.name),
      description: normalizeXianxiaRankText(rank.description),
      breakthroughRequirement: normalizeXianxiaRankText(rank.breakthroughRequirement),
      signatureAbilities: rank.signatureAbilities.map(normalizeXianxiaRankText),
      risks: rank.risks.map(normalizeXianxiaRankText),
      narrativeUse: normalizeXianxiaRankText(rank.narrativeUse),
    })),
    progressionRules: powerSystem.progressionRules.map(normalizeXianxiaRankText),
    bottlenecks: powerSystem.bottlenecks.map(normalizeXianxiaRankText),
  };
}

function createInitialCharacterAssets(
  meta: NovelMeta,
  bible: WorldBible,
  powerSystem: PowerSystemFile,
  now: string
): CharacterAssetsFile {
  const firstRank = [...powerSystem.ranks].sort((a, b) => a.order - b.order)[0];
  const protagonist: CharacterAsset = {
    characterId: 'protagonist',
    name: meta.protagonist,
    role: '主角',
    currentRankId: firstRank?.id,
    attributes: {
      战力定位: firstRank ? `${firstRank.name}初入` : '未入阶',
      核心目标: meta.worldSetting ?? meta.title,
      短板: '资源、经验与情报不足',
    },
    abilities: firstRank?.signatureAbilities.slice(0, 1) ?? [],
    inventory: [],
    injuries: [],
    notes: ['战力成长必须通过剧情收益、资源消耗或心性突破兑现'],
    updatedAt: now,
  };

  const support = bible.supportCharacters.map((c, index) => ({
    characterId: c.id,
    name: c.name,
    role: c.role,
    currentRankId: powerSystem.ranks[Math.min(index + 1, powerSystem.ranks.length - 1)]?.id ?? firstRank?.id,
    attributes: {
      阵营: c.factionId ?? '独立',
      当前动机: c.goals.join('；') || '未明',
    },
    abilities: c.traits.slice(0, 2),
    inventory: [],
    injuries: [],
    notes: ['配角战力变化应服务隐线目标，不得无因跃迁'],
    updatedAt: now,
  }));

  return {
    characters: [protagonist, ...support],
    updatedAt: now,
  };
}

const EPISODE_SOURCE_FILES = [
  'world-bible.json',
  'world-timeline.json',
  'hero-timeline.json',
  'support-timeline.json',
  'power-system.json',
  'character-assets.json',
  'story-arcs.json',
  'collisions.json',
];

async function latestExistingFileMtime(novelId: string, files: string[]): Promise<number> {
  const novelDir = novelStore.getNovelDir(novelId);
  const mtimes = await Promise.all(
    files.map(async (file) => {
      try {
        const stat = await fs.stat(path.join(novelDir, file));
        return stat.mtimeMs;
      } catch {
        return 0;
      }
    })
  );
  return Math.max(0, ...mtimes);
}

async function assertEpisodeContextFresh(novelId: string, episode: EpisodePlan): Promise<void> {
  const episodeGeneratedAt = new Date(episode.generatedAt).getTime();
  if (!Number.isFinite(episodeGeneratedAt)) return;

  const sourceUpdatedAt = await latestExistingFileMtime(novelId, EPISODE_SOURCE_FILES);
  // Atomic writes can land within the same millisecond on fast local filesystems.
  if (sourceUpdatedAt <= episodeGeneratedAt + 1000) return;

  const updatedAtText = new Date(sourceUpdatedAt).toISOString();
  throw new Error(
    [
      `事件包 #${episode.episodeNumber} 早于当前叙事设定：事件包生成于 ${episode.generatedAt}，设定最近更新于 ${updatedAtText}。`,
      '请先重新发现/选择碰撞并重新规划事件包，再写章节；否则正文会沿用旧概念。',
    ].join('')
  );
}

/**
 * LLM 输出的碰撞可能引用不存在的事件 ID；按 day/location 启发式回绑，无法匹配则丢弃该候选。
 */
function sanitizeCollisions(
  raw: Omit<Collision, 'id' | 'status' | 'episodeNumber'>[],
  world: WorldTimeline,
  hero: HeroTimeline,
  support?: SupportTimeline | null
): Omit<Collision, 'id' | 'status' | 'episodeNumber'>[] {
  const result: Omit<Collision, 'id' | 'status' | 'episodeNumber'>[] = [];

  for (const c of raw) {
    let worldIds = c.worldEventIds.filter((id) => world.events.some((e) => e.id === id));
    let heroIds = c.heroEventIds.filter((id) => hero.events.some((e) => e.id === id));
    let supportIds = (c.supportEventIds ?? []).filter((id) =>
      support?.events.some((e) => e.id === id)
    );

    if (worldIds.length === 0) {
      const match =
        world.events.find((e) => e.day === c.day && e.location === c.location) ??
        world.events.find((e) => e.day === c.day) ??
        world.events.find((e) => e.location === c.location);
      if (match) worldIds = [match.id];
    }
    if (heroIds.length === 0) {
      const match =
        hero.events.find((e) => e.day === c.day && e.location === c.location) ??
        hero.events.find((e) => Math.abs(e.day - c.day) <= 1) ??
        hero.events.find((e) => e.location === c.location);
      if (match) heroIds = [match.id];
    }

    if (worldIds.length > 0 && heroIds.length > 0) {
      result.push({
        ...c,
        worldEventIds: worldIds,
        heroEventIds: heroIds,
        supportEventIds: supportIds,
      });
    }
  }
  return result;
}

const DEFAULT_WORLD_EVENTS = 15;
const DEFAULT_HERO_EVENTS = 15;
const DEFAULT_COLLISIONS = 6;
/** 双阶段写章 + 审稿修订单次 LLM 调用可能较慢 */
const CHAPTER_LLM_TIMEOUT_MS = 600_000;
const CHAPTER_MIN_MAX_TOKENS = 12_000;
const CHAPTER_MAX_MAX_TOKENS = 32_000;

function computeChapterMaxTokens(targetWords?: number): number {
  const target = targetWords ?? 3500;
  // 中文章节的 tokens/字波动较大；修订 prompt 还会携带整章原文，输出端需留足余量。
  return Math.max(CHAPTER_MIN_MAX_TOKENS, Math.min(CHAPTER_MAX_MAX_TOKENS, target * 4));
}

function detectReaderHostileStyle(content: string): string[] {
  const issues: string[] = [];
  const vagueTerms = [
    '某种力量',
    '不可言说',
    '那个人',
    '那件事',
    '命运齿轮',
    '黑暗深处',
    '仿佛有什么',
    '无形之手',
  ];
  const vagueHits = vagueTerms.filter((term) => content.includes(term));
  if (vagueHits.length >= 3) {
    issues.push(`谜语化表达过多：${vagueHits.slice(0, 5).join('、')}`);
  }

  const dialogueCount = (content.match(/[“「『]/g) ?? []).length;
  if (countChars(content) > 1200 && dialogueCount < 4) {
    issues.push('对话与人物即时反应偏少，正文容易像设定说明或剧情摘要');
  }

  return issues;
}

function looksLikeCompleteNarrativeText(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  const tail = trimmed.slice(-24);
  return /[。！？.!?”’」』）)]$/.test(tail);
}

async function chatCompleteNarrativeText(
  llm: LlmClient,
  messages: ChatMessage[],
  options: ChatOptions
): Promise<string> {
  const maxAttempts = 2;
  let maxTokens = options.maxTokens ?? CHAPTER_MIN_MAX_TOKENS;
  let lastText = '';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const content = await llm.chat(messages, {
      ...options,
      maxTokens,
      timeoutMs: options.timeoutMs ?? CHAPTER_LLM_TIMEOUT_MS,
    });
    if (looksLikeCompleteNarrativeText(content)) return content;
    lastText = content;
    maxTokens = Math.min(maxTokens * 2, CHAPTER_MAX_MAX_TOKENS);
  }

  throw new Error(`${TEXT_OUTPUT_TRUNCATED_ERROR}: 章节正文末尾不像完整自然段：${lastText.slice(-80)}`);
}

export async function buildUniverse(
  llm: LlmClient,
  novelId: string,
  options?: { worldEventCount?: number; heroEventCount?: number }
): Promise<{ bible: WorldBible; world: WorldTimeline; support: SupportTimeline; hero: HeroTimeline }> {
  const meta = await novelStore.loadNovelMeta(novelId);
  const now = new Date().toISOString();

  const bibleOut = await llm.chatJson(buildWorldBiblePrompt(meta), WorldBibleOutputSchema, {
    ...UNIVERSE_LLM_OPTIONS,
    temperature: 0.72,
  });
  const bible: WorldBible = { ...bibleOut, generatedAt: now };
  await narrativeStore.saveWorldBible(novelId, bible);

  const powerOut = await llm.chatJson(buildPowerSystemPrompt(meta, bible), PowerSystemOutputSchema, {
    ...UNIVERSE_LLM_OPTIONS,
    temperature: 0.82,
  });
  const powerSystem: PowerSystemFile = normalizePowerSystemForMeta(meta, bible, {
    ...powerOut,
    ranks: powerOut.ranks.sort((a, b) => a.order - b.order),
    generatedAt: now,
    updatedAt: now,
  });
  await narrativeStore.savePowerSystem(novelId, powerSystem);
  await narrativeStore.saveCharacterAssets(
    novelId,
    createInitialCharacterAssets(meta, bible, powerSystem, now)
  );

  const arcsOut = await llm.chatJson(
    buildStoryArcsPrompt(meta, bible, powerSystem),
    StoryArcsOutputSchema,
    { ...UNIVERSE_LLM_OPTIONS, temperature: 0.75 }
  );
  const storyArcs: StoryArcsFile = {
    ...arcsOut,
    updatedAt: now,
  };
  await narrativeStore.saveStoryArcs(novelId, storyArcs);

  const worldOut = await llm.chatJson(
    buildWorldTimelinePrompt(meta, bible, options?.worldEventCount ?? DEFAULT_WORLD_EVENTS),
    WorldTimelineOutputSchema,
    { ...UNIVERSE_LLM_OPTIONS, temperature: 0.78 }
  );
  const worldEvents = normalizeEventSortOrders(narrativeStore.assignWorldEventIds(worldOut.events));
  const maxDay = Math.max(...worldEvents.map((e) => e.day), 0);
  const world: WorldTimeline = {
    currentDay: maxDay,
    events: worldEvents,
    updatedAt: now,
  };
  await narrativeStore.saveWorldTimeline(novelId, world);

  let support: SupportTimeline = { events: [], updatedAt: now };
  if (bible.supportCharacters.length > 0) {
    const supportOut = await llm.chatJson(
      buildSupportTimelinePrompt(meta, bible, world),
      SupportTimelineOutputSchema,
      { ...UNIVERSE_LLM_OPTIONS, temperature: 0.8 }
    );
    const validCharIds = new Set(bible.supportCharacters.map((c) => c.id));
    const supportEvents = normalizeEventSortOrders(
      narrativeStore.assignSupportEventIds(
        supportOut.events.filter((e) => validCharIds.has(e.characterId))
      )
    );
    support = { events: supportEvents, updatedAt: now };
  }
  await narrativeStore.saveSupportTimeline(novelId, support);

  const heroOut = await llm.chatJson(
    buildHeroTimelinePrompt(meta, world, options?.heroEventCount ?? DEFAULT_HERO_EVENTS),
    HeroTimelineOutputSchema,
    { ...UNIVERSE_LLM_OPTIONS, temperature: 0.82 }
  );
  const hero: HeroTimeline = {
    protagonistGoal: heroOut.protagonistGoal,
    crisis: heroOut.crisis,
    events: normalizeEventSortOrders(narrativeStore.assignHeroEventIds(heroOut.events)),
    updatedAt: now,
  };
  await narrativeStore.saveHeroTimeline(novelId, hero);

  return { bible, world, support, hero };
}

export async function discoverCollisions(
  llm: LlmClient,
  novelId: string,
  maxCollisions = DEFAULT_COLLISIONS
): Promise<Collision[]> {
  const meta = await novelStore.loadNovelMeta(novelId);
  const bible = await narrativeStore.loadWorldBible(novelId);
  const world = await narrativeStore.loadWorldTimeline(novelId);
  const hero = await narrativeStore.loadHeroTimeline(novelId);
  const support = await narrativeStore.loadSupportTimeline(novelId);
  const powerSystem = await narrativeStore.loadPowerSystem(novelId);
  const characterAssets = await narrativeStore.loadCharacterAssets(novelId);
  const [memory, reviews, storyState] = await Promise.all([
    narrativeStore.loadChapterMemoryIndex(novelId),
    novelStore.listReviews(novelId),
    novelStore.loadStoryState(novelId),
  ]);
  const pacing = computePacingRecommendation(
    memory?.entries ?? [],
    reviews,
    storyState.lastChapterNumber
  );

  if (!world || !hero) {
    throw new Error('请先生成宇宙（世界线 + 主人公线）');
  }

  const out = await llm.chatJson(
    buildCollisionDesignerPrompt(
      meta,
      world,
      hero,
      maxCollisions,
      support,
      bible,
      powerSystem,
      characterAssets,
      pacing.pacingNote
    ),
    CollisionsOutputSchema,
    { ...UNIVERSE_LLM_OPTIONS, temperature: 0.72 }
  );

  const sanitized = sanitizeCollisions(out.collisions, world, hero, support);
  const withIds = narrativeStore
    .assignCollisionIds(sanitized)
    .map(enrichCollisionScores)
    .sort(
      (a, b) =>
        collisionTypeBoost(b.collisionType, pacing) - collisionTypeBoost(a.collisionType, pacing) ||
        collisionRankScore(b) - collisionRankScore(a)
    );
  const existing = await narrativeStore.loadCollisions(novelId);
  const collisions = mergeDiscoveredCollisions(existing, withIds);
  const now = new Date().toISOString();
  await narrativeStore.saveCollisions(novelId, { collisions, updatedAt: now });
  return collisions;
}

export async function planEpisodeFromCollision(
  llm: LlmClient,
  novelId: string,
  collisionId: string
): Promise<EpisodePlan> {
  const meta = await novelStore.loadNovelMeta(novelId);
  const world = await narrativeStore.loadWorldTimeline(novelId);
  const hero = await narrativeStore.loadHeroTimeline(novelId);
  const collisionsFile = await narrativeStore.loadCollisions(novelId);
  const powerSystem = await narrativeStore.loadPowerSystem(novelId);
  const characterAssets = await narrativeStore.loadCharacterAssets(novelId);
  const [storyArcs, memory, reviews, storyState, bible] = await Promise.all([
    narrativeStore.loadStoryArcs(novelId),
    narrativeStore.loadChapterMemoryIndex(novelId),
    novelStore.listReviews(novelId),
    novelStore.loadStoryState(novelId),
    narrativeStore.loadWorldBible(novelId),
  ]);
  const nextChapter = storyState.lastChapterNumber + 1;
  const pacing = computePacingRecommendation(memory?.entries ?? [], reviews, storyState.lastChapterNumber);
  const arc = getCurrentStoryArc(storyArcs, nextChapter);
  const worldOnboarding = buildWorldOnboardingGuidance(bible, nextChapter, arc);
  const arcContext = arc
    ? [
        `第${arc.volumeNumber}卷《${arc.name}》：${arc.phaseGoal}（反派：${arc.antagonist}）`,
        worldOnboarding,
      ]
        .filter(Boolean)
        .join('\n')
    : undefined;

  if (!world || !hero || !collisionsFile) {
    throw new Error('缺少世界线/主人公线/碰撞数据');
  }

  const collision = collisionsFile.collisions.find((c) => c.id === collisionId);
  if (!collision) {
    throw new Error(`碰撞点 ${collisionId} 不存在`);
  }

  const out = await llm.chatJson(
    buildEpisodePlannerPrompt(
      meta,
      collision,
      world,
      hero,
      powerSystem,
      characterAssets,
      arcContext,
      pacing.pacingNote
    ),
    EpisodePlanOutputSchema,
    { ...UNIVERSE_LLM_OPTIONS, temperature: 0.68 }
  );

  const episodeNumber = await narrativeStore.getNextEpisodeNumber(novelId);
  const normalized = normalizeEpisodePlan(
    {
      ...out,
      episodeNumber,
      source: 'collision' as const,
      collisionId,
      heroEventIds: collision.heroEventIds,
      supportEventIds: collision.supportEventIds ?? [],
      status: 'confirmed' as const,
      generatedAt: new Date().toISOString(),
    },
    { fallbackCollisionType: collision.collisionType }
  );
  const episode: EpisodePlan = EpisodePlanSchema.parse(normalized);

  await narrativeStore.saveEpisode(novelId, episode);

  const updatedCollisions = collisionsFile.collisions.map((c) =>
    c.id === collisionId ? { ...c, status: 'accepted' as const, episodeNumber } : c
  );
  await narrativeStore.saveCollisions(novelId, {
    collisions: updatedCollisions,
    updatedAt: new Date().toISOString(),
  });

  return episode;
}

/** 从主人公线选取下一行动节点规划章节；若附近有碰撞则作为增强插入 */
export async function planEpisodeFromHeroTimeline(
  llm: LlmClient,
  novelId: string,
  options?: {
    heroEventId?: string;
    autoDiscoverCollisions?: boolean;
    maxCollisions?: number;
  }
): Promise<EpisodePlan> {
  const meta = await novelStore.loadNovelMeta(novelId);
  const bible = await narrativeStore.loadWorldBible(novelId);
  const world = await narrativeStore.loadWorldTimeline(novelId);
  const hero = await narrativeStore.loadHeroTimeline(novelId);
  const support = await narrativeStore.loadSupportTimeline(novelId);
  const powerSystem = await narrativeStore.loadPowerSystem(novelId);
  const characterAssets = await narrativeStore.loadCharacterAssets(novelId);
  const [storyArcs, memory, reviews, storyState] = await Promise.all([
    narrativeStore.loadStoryArcs(novelId),
    narrativeStore.loadChapterMemoryIndex(novelId),
    novelStore.listReviews(novelId),
    novelStore.loadStoryState(novelId),
  ]);

  if (!world || !hero) {
    throw new Error('缺少世界线/主人公线数据');
  }

  let collisionsFile = await narrativeStore.loadCollisions(novelId);
  if (options?.autoDiscoverCollisions !== false) {
    const discovered = await discoverCollisions(llm, novelId, options?.maxCollisions ?? DEFAULT_COLLISIONS);
    collisionsFile = { collisions: discovered, updatedAt: new Date().toISOString() };
  }

  const heroEvent = options?.heroEventId
    ? hero.events.find((e) => e.id === options.heroEventId)
    : pickNextHeroEvent(hero, { narrativeDay: world.currentDay });
  if (!heroEvent) {
    throw new Error('主人公线无待写章的行动节点，请先推进世界或补充主角事件');
  }

  const pacing = computePacingRecommendation(memory?.entries ?? [], reviews, storyState.lastChapterNumber);
  const enhancementCollision = pickBestCollisionForHeroEvent(
    collisionsFile?.collisions ?? [],
    heroEvent,
    (type) => collisionTypeBoost(type, pacing)
  );

  const nextChapter = storyState.lastChapterNumber + 1;
  const arc = getCurrentStoryArc(storyArcs, nextChapter);
  const worldOnboarding = buildWorldOnboardingGuidance(bible, nextChapter, arc);
  const arcContext = arc
    ? [`第${arc.volumeNumber}卷《${arc.name}》：${arc.phaseGoal}`, worldOnboarding].filter(Boolean).join('\n')
    : undefined;

  const nearbyWorldEvents = findNearbyWorldEvents(world, heroEvent);
  const nearbySupportEvents = findNearbySupportEvents(support, heroEvent);
  const supportNames = new Map((bible?.supportCharacters ?? []).map((c) => [c.id, c.name]));

  const recentChaptersBlock = formatRecentChaptersForPlanner(memory?.entries ?? [], 5);

  const out = await llm.chatJson(
    buildHeroEpisodePlannerPrompt({
      meta,
      hero,
      heroEvent,
      world,
      nearbyWorldEvents,
      nearbySupportEvents,
      supportNames,
      enhancementCollision,
      powerSystem,
      characterAssets,
      arcContext,
      pacingNote: pacing.pacingNote,
      recentChaptersBlock,
    }),
    EpisodePlanOutputSchema,
    { ...UNIVERSE_LLM_OPTIONS, temperature: 0.68 }
  );

  const recentTitles = (memory?.entries ?? []).map((e) => e.title);
  if (isDuplicateEpisodeTitle(out.title, recentTitles)) {
    throw new Error(
      `事件包标题「${out.title}」与近期章节重复，已拒绝落盘。主人公节点 [${heroEvent.id}] 可能未正确标记为已消费，请检查 hero-timeline 的 usedInChapter。`
    );
  }

  const episodeNumber = await narrativeStore.getNextEpisodeNumber(novelId);
  const normalized = normalizeEpisodePlan(
    {
      ...out,
      episodeNumber,
      source: enhancementCollision ? ('collision' as const) : ('hero' as const),
      collisionId: enhancementCollision?.id,
      heroEventIds: [heroEvent.id],
      supportEventIds: enhancementCollision?.supportEventIds?.length
        ? enhancementCollision.supportEventIds
        : nearbySupportEvents.map((e) => e.id),
      status: 'confirmed' as const,
      generatedAt: new Date().toISOString(),
    },
    { fallbackCollisionType: enhancementCollision?.collisionType }
  );
  const episode: EpisodePlan = EpisodePlanSchema.parse(normalized);
  await narrativeStore.saveEpisode(novelId, episode);

  const heroIdx = hero.events.findIndex((e) => e.id === heroEvent.id);
  if (heroIdx >= 0 && hero.events[heroIdx].status === 'planned') {
    hero.events[heroIdx].status = 'active';
    hero.updatedAt = new Date().toISOString();
    await narrativeStore.saveHeroTimeline(novelId, hero);
  }

  if (enhancementCollision && collisionsFile) {
    const updatedCollisions = collisionsFile.collisions.map((c) =>
      c.id === enhancementCollision.id ? { ...c, status: 'accepted' as const, episodeNumber } : c
    );
    await narrativeStore.saveCollisions(novelId, {
      collisions: updatedCollisions,
      updatedAt: new Date().toISOString(),
    });
  }

  return episode;
}

async function generateEpisodeContent(
  llm: LlmClient,
  input: {
    meta: NovelMeta;
    state: StoryState;
    episode: EpisodePlan;
    previousChapterExcerpt?: string;
    forbiddenTerms: string[];
    powerSystem?: PowerSystemFile | null;
    characterAssets?: CharacterAssetsFile | null;
    compactContext?: import('./memory.js').CompactWritingContext;
    options?: WriteEpisodeOptions;
  }
): Promise<{
  content: string;
  drafts: { surfaceDraft?: string; wovenDraft?: string };
  meta: WriteEpisodeMeta;
}> {
  const {
    meta,
    state,
    episode,
    previousChapterExcerpt,
    forbiddenTerms,
    powerSystem,
    characterAssets,
    compactContext,
    options,
  } = input;
  const targetWords = options?.targetWords;
  const twoStage = options?.twoStage !== false;
  const maxLeakRetries = options?.maxLeakRetries ?? 0;

  let content: string;
  let surfaceDraftChars: number | undefined;

  let surfaceDraft: string | undefined;
  let wovenDraft: string | undefined;
  const generationMaxTokens = computeChapterMaxTokens(targetWords);
  const genChatOpts = {
    maxTokens: generationMaxTokens,
    timeoutMs: CHAPTER_LLM_TIMEOUT_MS,
  };

  if (twoStage) {
    surfaceDraft = await chatCompleteNarrativeText(
      llm,
      buildEpisodeSurfaceWritePrompt({
        meta,
        state,
        episode,
        previousChapterExcerpt,
        targetWords,
        powerSystem,
        characterAssets,
        compactContext,
      }),
      { temperature: 0.92, ...genChatOpts }
    );
    surfaceDraftChars = countChars(surfaceDraft);

    wovenDraft = await chatCompleteNarrativeText(
      llm,
      buildEpisodeShadowWeavePrompt({
        meta,
        episode,
        surfaceDraft,
        forbiddenTerms,
        targetWords,
        powerSystem,
        characterAssets,
      }),
      { temperature: 0.84, ...genChatOpts }
    );
    content = wovenDraft;
  } else {
    content = await chatCompleteNarrativeText(
      llm,
      buildEpisodeWritePrompt({
        meta,
        state,
        episode,
        previousChapterExcerpt,
        targetWords,
        forbiddenTerms,
        powerSystem,
        characterAssets,
      }),
      { temperature: 0.92, ...genChatOpts }
    );
  }

  let leakRetries = 0;
  let hadLeak = false;

  while (leakRetries < maxLeakRetries) {
    const leakCheck = detectHiddenLineLeak(content, forbiddenTerms);
    if (!leakCheck.hiddenLineLeak) break;

    hadLeak = true;
    content = await chatCompleteNarrativeText(
      llm,
      buildEpisodeLeakRewritePrompt({
        meta,
        episode,
        content,
        leakedTerms: leakCheck.leakedTerms,
        forbiddenTerms,
      }),
      { temperature: 0.45, ...genChatOpts }
    );
    leakRetries++;
  }

  return {
    content,
    drafts: { surfaceDraft, wovenDraft },
    meta: {
      twoStage,
      leakRetries,
      reviewRewriteRetries: 0,
      hadLeak,
      surfaceDraftChars,
    },
  };
}

function shouldRewriteAfterReview(review: DualLineReview): boolean {
  return !review.passed || (review.score ?? 0) < 70;
}

async function repairHiddenLineLeaks(
  llm: LlmClient,
  input: {
    meta: NovelMeta;
    episode: EpisodePlan;
    content: string;
    forbiddenTerms: string[];
    maxLeakRetries: number;
    maxTokens: number;
  }
): Promise<{ content: string; leakRetries: number; hadLeak: boolean }> {
  const { meta, episode, forbiddenTerms, maxLeakRetries, maxTokens } = input;
  let content = input.content;
  let leakRetries = 0;
  let hadLeak = false;

  while (leakRetries < maxLeakRetries) {
    const leakCheck = detectHiddenLineLeak(content, forbiddenTerms);
    if (!leakCheck.hiddenLineLeak) break;

    hadLeak = true;
    content = await chatCompleteNarrativeText(
      llm,
      buildEpisodeLeakRewritePrompt({
        meta,
        episode,
        content,
        leakedTerms: leakCheck.leakedTerms,
        forbiddenTerms,
      }),
      { temperature: 0.45, maxTokens, timeoutMs: CHAPTER_LLM_TIMEOUT_MS }
    );
    leakRetries++;
  }

  return { content, leakRetries, hadLeak };
}

export async function writeEpisodeChapter(
  llm: LlmClient,
  novelId: string,
  episodeNumber: number,
  options?: WriteEpisodeOptions
): Promise<{
  chapterNumber: number;
  title: string;
  content: string;
  wordCount: number;
  writingMeta: WriteEpisodeMeta;
  review?: DualLineReview;
  state?: StoryState;
}> {
  const meta = await novelStore.loadNovelMeta(novelId);
  const state = await novelStore.loadStoryState(novelId);
  const episode = await narrativeStore.loadEpisode(novelId, episodeNumber);

  if (!episode) {
    throw new Error(`事件包 #${episodeNumber} 不存在`);
  }
  await assertEpisodeContextFresh(novelId, episode);

  const rewriteChapter = options?.rewriteChapterNumber;
  if (rewriteChapter != null && rewriteChapter < 1) {
    throw new Error('rewriteChapterNumber 须 ≥ 1');
  }
  const chapterNumber = rewriteChapter ?? state.lastChapterNumber + 1;

  let previousChapterExcerpt: string | undefined;
  if (chapterNumber > 1) {
    const prev = await novelStore.loadChapter(novelId, chapterNumber - 1);
    if (prev) previousChapterExcerpt = prev;
  }

  const bible = await narrativeStore.loadWorldBible(novelId);
  const forbiddenTerms = extractForbiddenTerms(bible, episode);
  const powerSystem = await narrativeStore.loadPowerSystem(novelId);
  const assetsBefore = await narrativeStore.loadCharacterAssets(novelId);
  const [storyArcs, memory, reviews] = await Promise.all([
    narrativeStore.loadStoryArcs(novelId),
    narrativeStore.loadChapterMemoryIndex(novelId),
    novelStore.listReviews(novelId),
  ]);
  const pacing = computePacingRecommendation(
    memory?.entries ?? [],
    reviews,
    state.lastChapterNumber
  );
  const currentArc = getCurrentStoryArc(storyArcs, chapterNumber);
  const compactContext = buildCompactWritingContext({
    state,
    memory,
    storyArcs,
    bible,
    powerSystem,
    characterAssets: assetsBefore,
    chapterNumber,
    pacingNote: pacing.pacingNote,
  });

  const { content: initialContent, meta: writingMeta, drafts } = await generateEpisodeContent(llm, {
    meta,
    state,
    episode,
    previousChapterExcerpt,
    forbiddenTerms,
    powerSystem,
    characterAssets: assetsBefore,
    compactContext,
    options,
  });
  let content = initialContent;
  let wordCount = countChars(content);
  const explainEarlyConcepts = async (): Promise<boolean> => {
    const conceptIndex = await syncConceptIntroductions(novelId);
    const unexplainedConcepts = findUnexplainedConceptsInContent(
      conceptIndex,
      content,
      chapterNumber
    );
    if (unexplainedConcepts.length === 0) return false;

    content = await chatCompleteNarrativeText(
      llm,
      buildConceptExplainerRewritePrompt({
        meta,
        episode,
        chapterNumber,
        content,
        concepts: unexplainedConcepts,
        targetWords: options?.targetWords,
      }),
      {
        temperature: 0.62,
        maxTokens: computeChapterMaxTokens(options?.targetWords),
        timeoutMs: CHAPTER_LLM_TIMEOUT_MS,
      }
    );
    await markConceptsExplained(novelId, unexplainedConcepts, chapterNumber);
    wordCount = countChars(content);
    return true;
  };

  let review: DualLineReview | undefined;
  if (!options?.skipReview) {
    const reviewContent = async (chapterContent: string): Promise<DualLineReview> => {
      const leakCheck = detectHiddenLineLeak(chapterContent, forbiddenTerms);
      const powerCheck = checkPowerConsistency({
        content: chapterContent,
        episode,
        powerSystem,
        assetsBefore,
        assetsAfter: assetsBefore,
        storyArcPowerCeilingRankId: currentArc?.powerCeilingRankId,
      });
      const arcPowerCeiling = currentArc?.powerCeilingRankId
        ? powerSystem?.ranks.find((r) => r.id === currentArc.powerCeilingRankId)?.name
        : undefined;
      const reviewMessages = buildDualLineReviewPrompt({
        meta,
        state,
        episode,
        chapterNumber,
        chapterContent,
        forbiddenTerms,
        programmaticLeakedTerms: leakCheck.leakedTerms,
        powerSystem,
        characterAssets: assetsBefore,
        arcPowerCeiling,
        programmaticPowerIssues: powerCheck.issues,
      });
      let nextReview = await llm.chatJson(reviewMessages, DualLineReviewSchema, {
        temperature: 0.3,
      });

      if (leakCheck.hiddenLineLeak) {
        nextReview = {
          ...nextReview,
          hiddenLineLeak: true,
          leakedTerms: [...new Set([...nextReview.leakedTerms, ...leakCheck.leakedTerms])],
          issues: [
            ...nextReview.issues,
            {
              category: 'hidden_line_leak' as const,
              severity: 'medium' as const,
              description: `正文直述隐线专有信息：${leakCheck.leakedTerms.join('、')}`,
              suggestion: '仅在明显剧透核心反转或削弱后续悬念时再改；不要为了藏隐线牺牲可读性',
            },
          ],
          summary: `${nextReview.summary}（程序提示：存在隐线直述，可按悬念需要取舍）`,
        };
      }

      if (!powerCheck.ok) {
        nextReview = {
          ...nextReview,
          powerConsistencyOk: false,
          passed: false,
          issues: [
            ...nextReview.issues,
            ...powerCheck.issues.map((issue) => ({
              category: 'power_consistency' as const,
              severity: 'high' as const,
              description: issue,
              suggestion: '对齐事件包 heroGains/战力阶位，或修正正文夸张战力描写',
            })),
          ],
          summary: `${nextReview.summary}（程序检测：战力一致性）`,
        };
      }

      const styleIssues = detectReaderHostileStyle(chapterContent);
      if (styleIssues.length > 0) {
        nextReview = {
          ...nextReview,
          readabilityOk: false,
          styleToneOk: false,
          passed: false,
          score: Math.min(nextReview.score ?? 60, 68),
          issues: [
            ...nextReview.issues,
            ...styleIssues.map((issue) => ({
              category: 'style' as const,
              severity: 'medium' as const,
              description: issue,
              suggestion: '改成明快、细腻、有趣的可读叙事，明确主角目标、阻碍、行动和结果',
            })),
          ],
          summary: `${nextReview.summary}（程序检测：可读性/文风问题）`,
        };
      }

      return nextReview;
    };

    review = await reviewContent(content);

    const maxReviewRewriteRetries = options?.maxReviewRewriteRetries ?? 1;
    const generationMaxTokens = computeChapterMaxTokens(options?.targetWords);
    const reviseChatOpts = {
      maxTokens: generationMaxTokens,
      timeoutMs: CHAPTER_LLM_TIMEOUT_MS,
    };
    while (
      shouldRewriteAfterReview(review) &&
      writingMeta.reviewRewriteRetries < maxReviewRewriteRetries
    ) {
      content = await chatCompleteNarrativeText(
        llm,
        buildEpisodeReviewRewritePrompt({
          meta,
          state,
          episode,
          content,
          review,
          targetWords: options?.targetWords,
          forbiddenTerms,
        }),
        { temperature: 0.68, ...reviseChatOpts }
      );

      const leakRepair = await repairHiddenLineLeaks(llm, {
        meta,
        episode,
        content,
        forbiddenTerms,
        maxLeakRetries: options?.maxLeakRetries ?? 0,
        maxTokens: generationMaxTokens,
      });
      content = leakRepair.content;
      writingMeta.leakRetries += leakRepair.leakRetries;
      writingMeta.hadLeak = writingMeta.hadLeak || leakRepair.hadLeak;
      writingMeta.reviewRewriteRetries++;
      wordCount = countChars(content);
      review = await reviewContent(content);
    }

    if (await explainEarlyConcepts()) {
      review = await reviewContent(content);
    }

    await novelStore.saveReview(novelId, {
      chapterNumber: review.chapterNumber,
      passed: review.passed,
      score: review.score,
      issues: review.issues.map((i) => ({
        category: DUAL_LINE_REVIEW_CATEGORY_MAP[i.category],
        severity: i.severity,
        description: `[${i.category}] ${i.description}`,
        suggestion: i.suggestion,
      })),
      summary: review.summary,
      reviewedAt: review.reviewedAt,
    });
  } else {
    await explainEarlyConcepts();
  }

  wordCount = countChars(content);
  let chapterPersisted = false;
  const reviewPersisted = review != null && !options?.skipReview;

  let newState: StoryState | undefined;
  try {
    await novelStore.saveChapter(novelId, chapterNumber, episode.title, content);
    chapterPersisted = true;

    if (!options?.skipStateUpdate) {
      const world = await narrativeStore.loadWorldTimeline(novelId);
      const hero = await narrativeStore.loadHeroTimeline(novelId);
      if (world && hero) {
        const updateMessages = buildDualLineStateUpdatePrompt({
          meta,
          state,
          episode,
          world,
          hero,
          chapterNumber,
          chapterContent: content,
          powerSystem,
          characterAssets: assetsBefore,
        });
        const update = await llm.chatJson(updateMessages, DualLineStateUpdateSchema, {
          temperature: 0.3,
          maxTokens: 32_768,
        });

        await applyDualLineStateUpdate(novelId, update, chapterNumber, episode);

        newState = {
          ...update.storyState,
          lastChapterNumber: chapterNumber,
          updatedAt: new Date().toISOString(),
        };
        await novelStore.saveStoryState(novelId, newState);

        const assetsAfter = await narrativeStore.loadCharacterAssets(novelId);
        const postPowerCheck = checkPowerConsistency({
          content,
          episode,
          powerSystem,
          assetsBefore,
          assetsAfter,
          storyArcPowerCeilingRankId: currentArc?.powerCeilingRankId,
        });
        if (!postPowerCheck.ok && review) {
          review = {
            ...review,
            powerConsistencyOk: false,
            passed: false,
            issues: [
              ...review.issues,
              ...postPowerCheck.issues.map((issue) => ({
                category: 'power_consistency' as const,
                severity: 'high' as const,
                description: issue,
                suggestion: '检查状态更新后的角色资产是否与正文一致',
              })),
            ],
            summary: `${review.summary}（状态更新后战力校验）`,
          };
          await novelStore.saveReview(novelId, {
            chapterNumber: review.chapterNumber,
            passed: review.passed,
            score: review.score,
            issues: review.issues.map((i) => ({
              category: DUAL_LINE_REVIEW_CATEGORY_MAP[i.category],
              severity: i.severity,
              description: `[${i.category}] ${i.description}`,
              suggestion: i.suggestion,
            })),
            summary: review.summary,
            reviewedAt: review.reviewedAt,
          });
        }

        if (storyArcs) {
          await narrativeStore.saveStoryArcs(
            novelId,
            advanceStoryArcs(storyArcs, chapterNumber)
          );
        }

        await appendChapterMemory(
          novelId,
          buildChapterMemoryEntry({
            chapterNumber,
            title: episode.title,
            episode,
            state: newState,
            wordCount,
            reviewScore: review?.score,
            reviewPassed: review?.passed,
          })
        );
      }
    }

    const writtenEpisode: EpisodePlan = {
      ...episode,
      status: 'written',
      chapterNumber,
      writingDrafts: {
        surfaceDraft: drafts.surfaceDraft,
        wovenDraft: drafts.wovenDraft,
        finalDraft: content,
        savedAt: new Date().toISOString(),
      },
    };
    await narrativeStore.saveEpisode(novelId, writtenEpisode);
  } catch (err) {
    if (chapterPersisted) {
      await novelStore.deleteChapterFile(novelId, chapterNumber);
    }
    if (reviewPersisted) {
      await novelStore.deleteReviewFile(novelId, chapterNumber);
    }
    throw err;
  }

  return {
    chapterNumber,
    title: episode.title,
    content,
    wordCount,
    writingMeta,
    review,
    state: newState,
  };
}

/**
 * 将 LLM 状态更新写回世界线/主人公线。锁定事件跳过修改。
 * 若宇宙未完整构建（缺 timeline 文件）则静默跳过，章节正文仍保留。
 */
async function applyDualLineStateUpdate(
  novelId: string,
  update: import('./types.js').DualLineStateUpdate,
  chapterNumber: number,
  episode: EpisodePlan
): Promise<void> {
  const world = await narrativeStore.loadWorldTimeline(novelId);
  const hero = await narrativeStore.loadHeroTimeline(novelId);
  if (!world || !hero) return;

  const now = new Date().toISOString();

  for (const u of update.worldTimeline.eventUpdates) {
    const idx = world.events.findIndex((e) => e.id === u.eventId);
    if (idx >= 0 && world.events[idx].locked) continue;
    if (idx >= 0) {
      if (u.status) world.events[idx].status = u.status;
      if (u.usedInChapter) world.events[idx].usedInChapter = u.usedInChapter;
      else world.events[idx].usedInChapter = chapterNumber;
    }
  }
  for (const ne of update.worldTimeline.newEvents) {
    world.events.push({
      ...ne,
      id: randomUUID(),
      status: 'planned',
      sortOrder: nextSortOrderOnDay(world.events, ne.day),
    });
  }
  world.currentDay = Math.max(world.currentDay, update.worldTimeline.currentDay);
  world.updatedAt = now;
  await narrativeStore.saveWorldTimeline(novelId, world);

  if (update.heroTimeline.protagonistGoal) {
    hero.protagonistGoal = update.heroTimeline.protagonistGoal;
  }
  if (update.heroTimeline.crisis !== undefined) {
    hero.crisis = update.heroTimeline.crisis;
  }
  for (const u of update.heroTimeline.eventUpdates) {
    const idx = hero.events.findIndex((e) => e.id === u.eventId);
    if (idx >= 0 && hero.events[idx].locked) continue;
    if (idx >= 0) {
      if (u.status) hero.events[idx].status = u.status;
      if (u.usedInChapter) hero.events[idx].usedInChapter = u.usedInChapter;
      else hero.events[idx].usedInChapter = chapterNumber;
    }
  }
  for (const ne of update.heroTimeline.newEvents) {
    if (isPlaceholderHeroEvent(ne)) continue;
    hero.events.push({
      ...ne,
      knownWorldFacts: sanitizeHeroEventFacts(ne.knownWorldFacts, episode.heroGains),
      id: randomUUID(),
      status: 'planned',
      sortOrder: nextSortOrderOnDay(hero.events, ne.day),
    });
  }

  markEpisodeHeroEventsUsed(hero, episode.heroEventIds, chapterNumber);

  applyHeroGainsToTimeline(hero, episode.heroGains, chapterNumber, episode.day);

  hero.updatedAt = now;
  await narrativeStore.saveHeroTimeline(novelId, hero);

  if (update.characterAssets.characters.length > 0) {
    const existingAssets = await narrativeStore.loadCharacterAssets(novelId);
    const byId = new Map((existingAssets?.characters ?? []).map((asset) => [asset.characterId, asset]));
    for (const asset of update.characterAssets.characters) {
      byId.set(asset.characterId, {
        ...asset,
        updatedAt: asset.updatedAt || now,
      });
    }
    await narrativeStore.saveCharacterAssets(novelId, {
      characters: [...byId.values()],
      updatedAt: now,
    });
  }
}

/** 章节已写出但状态更新失败时，从磁盘正文续跑状态同步 */
export async function resumeEpisodeStateUpdate(
  llm: LlmClient,
  novelId: string,
  episodeNumber: number,
  chapterNumber: number
): Promise<StoryState> {
  const meta = await novelStore.loadNovelMeta(novelId);
  const state = await novelStore.loadStoryState(novelId);
  const episode = await narrativeStore.loadEpisode(novelId, episodeNumber);
  const chapterContent = await novelStore.loadChapter(novelId, chapterNumber);
  const world = await narrativeStore.loadWorldTimeline(novelId);
  const hero = await narrativeStore.loadHeroTimeline(novelId);
  const powerSystem = await narrativeStore.loadPowerSystem(novelId);
  const characterAssets = await narrativeStore.loadCharacterAssets(novelId);
  const storyArcs = await narrativeStore.loadStoryArcs(novelId);
  const savedReview = await novelStore.loadReview(novelId, chapterNumber);

  if (!episode) throw new Error(`事件包 #${episodeNumber} 不存在`);
  if (!chapterContent) throw new Error(`第 ${chapterNumber} 章正文不存在`);
  if (!world || !hero) throw new Error('叙事宇宙不完整，无法状态更新');

  const wordCount = countChars(chapterContent);

  const updateMessages = buildDualLineStateUpdatePrompt({
    meta,
    state,
    episode,
    world,
    hero,
    chapterNumber,
    chapterContent,
    powerSystem,
    characterAssets,
  });
  const update = await llm.chatJson(updateMessages, DualLineStateUpdateSchema, {
    temperature: 0.3,
    maxTokens: 32_768,
  });

  await applyDualLineStateUpdate(novelId, update, chapterNumber, episode);

  const newState: StoryState = {
    ...update.storyState,
    lastChapterNumber: chapterNumber,
    updatedAt: new Date().toISOString(),
  };
  await novelStore.saveStoryState(novelId, newState);

  if (storyArcs) {
    await narrativeStore.saveStoryArcs(novelId, advanceStoryArcs(storyArcs, chapterNumber));
  }

  await appendChapterMemory(
    novelId,
    buildChapterMemoryEntry({
      chapterNumber,
      title: episode.title,
      episode,
      state: newState,
      wordCount,
      reviewScore: savedReview?.score,
      reviewPassed: savedReview?.passed,
    })
  );

  const writtenEpisode: EpisodePlan = {
    ...episode,
    status: 'written',
    chapterNumber,
    writingDrafts: episode.writingDrafts ?? {
      finalDraft: chapterContent,
      savedAt: new Date().toISOString(),
    },
  };
  await narrativeStore.saveEpisode(novelId, writtenEpisode);

  return newState;
}

export async function getUniverseSummary(novelId: string): Promise<{
  meta: NovelMeta;
  bible: WorldBible | null;
  world: WorldTimeline | null;
  hero: HeroTimeline | null;
  support: SupportTimeline | null;
  powerSystem: PowerSystemFile | null;
  characterAssets: CharacterAssetsFile | null;
  storyArcs: StoryArcsFile | null;
  chapterMemory: ChapterMemoryIndex | null;
  qualityMetrics: Awaited<ReturnType<typeof getQualityMetrics>>;
  collisions: Collision[];
  episodes: EpisodePlan[];
  state: StoryState;
  chapterNumbers: number[];
}> {
  const meta = await novelStore.loadNovelMeta(novelId);
  const state = await novelStore.loadStoryState(novelId);
  const [
    bible,
    world,
    hero,
    support,
    powerSystem,
    characterAssets,
    storyArcs,
    chapterMemory,
    collisionsFile,
    episodes,
    chapterNumbers,
    qualityMetrics,
  ] = await Promise.all([
    narrativeStore.loadWorldBible(novelId),
    narrativeStore.loadWorldTimeline(novelId),
    narrativeStore.loadHeroTimeline(novelId),
    narrativeStore.loadSupportTimeline(novelId),
    narrativeStore.loadPowerSystem(novelId),
    narrativeStore.loadCharacterAssets(novelId),
    narrativeStore.loadStoryArcs(novelId),
    narrativeStore.loadChapterMemoryIndex(novelId),
    narrativeStore.loadCollisions(novelId),
    narrativeStore.listEpisodes(novelId),
    novelStore.listChapterNumbers(novelId),
    getQualityMetrics(novelId),
  ]);

  return {
    meta,
    bible,
    world,
    hero,
    support,
    powerSystem,
    characterAssets,
    storyArcs,
    chapterMemory,
    qualityMetrics,
    collisions: collisionsFile?.collisions ?? [],
    episodes,
    state,
    chapterNumbers,
  };
}
