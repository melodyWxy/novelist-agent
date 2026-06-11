/**
 * 章节记忆索引 — 压缩长篇上下文供写章/碰撞使用
 */
import type { ChapterMemoryEntry, ChapterMemoryIndex, StoryArc, StoryArcsFile } from './types.js';
import type { CharacterAssetsFile, EpisodePlan, PowerSystemFile, WorldBible } from './types.js';
import type { StoryState } from '../novel/types.js';
import * as narrativeStore from './store.js';

export interface CompactWritingContext {
  recentSummaries: string;
  arcContext: string;
  foreshadowingBlock: string;
  protagonistAssetBlock: string;
  openThreadsBlock: string;
  worldOnboardingBlock: string;
}

export function buildChapterMemoryEntry(input: {
  chapterNumber: number;
  title: string;
  episode: EpisodePlan;
  state: StoryState;
  wordCount: number;
  reviewScore?: number;
  reviewPassed?: boolean;
}): ChapterMemoryEntry {
  const { chapterNumber, title, episode, state, wordCount, reviewScore, reviewPassed } = input;
  const powerChanges = [
    ...episode.heroStateChanges.filter((s) => /突破|进阶|晋|境|修为|战力|领悟|瓶颈/.test(s)),
    ...episode.heroGains.filter((s) => /突破|进阶|晋|境|修为|战力|领悟|瓶颈|功法|神通/.test(s)),
  ];
  const itemChanges = episode.heroGains.filter((s) =>
    /获得|拿到|夺得|残页|法宝|丹药|灵石|钥匙|契约|武器/.test(s)
  );

  return {
    chapterNumber,
    title,
    summary: (state.lastChapterSummary ?? title).slice(0, 220),
    day: episode.day,
    keyEvents: episode.heroGains.slice(0, 6),
    powerChanges: [...new Set(powerChanges)].slice(0, 5),
    itemChanges: [...new Set(itemChanges)].slice(0, 5),
    foreshadowingTouched: episode.foreshadowing.slice(0, 5),
    wordCount,
    reviewScore,
    reviewPassed,
    writtenAt: new Date().toISOString(),
  };
}

export async function appendChapterMemory(
  novelId: string,
  entry: ChapterMemoryEntry
): Promise<ChapterMemoryIndex> {
  const existing = (await narrativeStore.loadChapterMemoryIndex(novelId)) ?? {
    entries: [],
    updatedAt: new Date().toISOString(),
  };
  const filtered = existing.entries.filter((e) => e.chapterNumber !== entry.chapterNumber);
  const entries = [...filtered, entry].sort((a, b) => a.chapterNumber - b.chapterNumber);
  const index: ChapterMemoryIndex = {
    entries,
    updatedAt: new Date().toISOString(),
  };
  await narrativeStore.saveChapterMemoryIndex(novelId, index);
  return index;
}

export function getCurrentStoryArc(
  arcs: StoryArcsFile | null,
  chapterNumber: number
): StoryArc | null {
  if (!arcs?.arcs.length) return null;
  const byId = arcs.currentArcId
    ? arcs.arcs.find((a) => a.id === arcs.currentArcId)
    : undefined;
  const byChapter = arcs.arcs.find(
    (a) => chapterNumber >= a.chapterStart && chapterNumber <= a.chapterEnd
  );
  return byChapter ?? byId ?? arcs.arcs[0] ?? null;
}

export function advanceStoryArcs(
  arcs: StoryArcsFile,
  chapterNumber: number
): StoryArcsFile {
  const now = new Date().toISOString();
  const nextArcs: StoryArcsFile['arcs'] = arcs.arcs.map((arc) => {
    if (chapterNumber > arc.chapterEnd) {
      return { ...arc, status: 'completed' as const };
    }
    if (chapterNumber >= arc.chapterStart && chapterNumber <= arc.chapterEnd) {
      return { ...arc, status: 'active' as const };
    }
    const status: StoryArc['status'] =
      arc.status === 'completed' ? 'completed' : 'planned';
    return { ...arc, status };
  });
  const active = nextArcs.find((a) => a.status === 'active');
  return {
    arcs: nextArcs,
    currentArcId: active?.id ?? arcs.currentArcId,
    updatedAt: now,
  };
}

export function buildWorldOnboardingGuidance(
  bible: WorldBible | null,
  chapterNumber: number,
  arc?: StoryArc | null
): string {
  if (!bible) return '';

  const chapterOffset = arc ? chapterNumber - arc.chapterStart : chapterNumber - 1;
  if (chapterNumber > 20) return '';

  const moduleIndex = Math.max(0, chapterOffset) % 6;
  const module = [
    {
      name: '地理与生活感',
      material: bible.geography.slice(0, 6).join('；') || '主要场景、生活区、资源地',
      instruction: '让读者知道主角所在地方长什么样、普通人如何生活、主角为什么必须在这里行动',
    },
    {
      name: '阶层与制度',
      material: bible.coreConflicts.slice(0, 4).join('；') || '资源分配、身份秩序、制度压力',
      instruction: '通过排队、盘查、交易、规矩、惩罚或旁人反应讲清这个世界如何运转',
    },
    {
      name: '势力格局',
      material:
        bible.factions
          .slice(0, 5)
          .map((f) => `${f.name}(${f.type})`)
          .join('；') || '主要势力',
      instruction: '让读者分清谁掌握资源、谁制定规则、谁被压迫，不要只报势力名',
    },
    {
      name: '能力/修行代价',
      material: bible.powerSystem ?? '能力体系、资源消耗、突破风险',
      instruction: '用主角可见的代价、失败案例、价格或身体反应解释能力体系，不要百科式说明',
    },
    {
      name: '资源链与利益冲突',
      material:
        bible.factions
          .slice(0, 5)
          .flatMap((f) => f.resources.slice(0, 2).map((r) => `${f.name}:${r}`))
          .join('；') || '资源、物价、垄断、黑市',
      instruction: '把资源从哪里来、谁控制、普通人付出什么代价讲清楚',
    },
    {
      name: '主角位置',
      material: bible.coreConflicts.slice(0, 3).join('；') || '主角与世界矛盾的关系',
      instruction: '让读者明白主角处在世界秩序的哪一层，他为什么会被卷入更大的冲突',
    },
  ][moduleIndex];

  return [
    `前20章世界观引导：本章优先讲清「${module.name}」。`,
    `可用素材：${module.material}`,
    `写法：${module.instruction}。如果出现尚未阐释过的术语，必须通过场景、人物对话、交易/冲突/选择自然解释；不要插入百科式设定说明，也不要为了藏设定让读者云里雾里。`,
  ].join('\n');
}

export function buildCompactWritingContext(input: {
  state: StoryState;
  memory: ChapterMemoryIndex | null;
  storyArcs: StoryArcsFile | null;
  bible?: WorldBible | null;
  powerSystem: PowerSystemFile | null;
  characterAssets: CharacterAssetsFile | null;
  chapterNumber: number;
  pacingNote?: string;
}): CompactWritingContext {
  const { state, memory, storyArcs, bible, powerSystem, characterAssets, chapterNumber, pacingNote } =
    input;

  const recent = (memory?.entries ?? [])
    .filter((e) => e.chapterNumber < chapterNumber)
    .slice(-4)
    .map(
      (e) =>
        `第${e.chapterNumber}章《${e.title}》：${e.summary}${
          e.powerChanges.length ? `；战力=${e.powerChanges.join('、')}` : ''
        }`
    )
    .join('\n');

  const arc = getCurrentStoryArc(storyArcs, chapterNumber);
  const worldOnboardingBlock = buildWorldOnboardingGuidance(bible ?? null, chapterNumber, arc);
  const rankName = arc?.powerCeilingRankId
    ? powerSystem?.ranks.find((r) => r.id === arc.powerCeilingRankId)?.name ?? arc.powerCeilingRankId
    : '未设';
  const arcContext = arc
    ? `当前卷：第${arc.volumeNumber}卷《${arc.name}》（第${arc.chapterStart}-${arc.chapterEnd}章）
阶段目标：${arc.phaseGoal}
阶段反派：${arc.antagonist}
本卷战力上限：${rankName}
卷内爽点：${arc.payoffBeats.join('；')}`
    : '（尚未规划分卷）';

  const foreshadowingBlock =
    state.foreshadowing
      .filter((f) => !f.resolved)
      .slice(0, 6)
      .map((f) => `- [${f.id}] ${f.description}`)
      .join('\n') || '无';

  const protagonist = characterAssets?.characters.find((c) => c.characterId === 'protagonist');
  const protagonistAssetBlock = protagonist
    ? `阶位：${
        powerSystem?.ranks.find((r) => r.id === protagonist.currentRankId)?.name ??
        protagonist.currentRankId ??
        '未入阶'
      }
能力：${protagonist.abilities.join('、') || '无'}
物品：${protagonist.inventory.map((i) => `${i.name}(${i.status})`).join('、') || '无'}
伤势：${protagonist.injuries.join('、') || '无'}`
    : '暂无';

  const openThreadsBlock = state.openThreads.slice(0, 6).join('；') || '无';
  const recentSummaries =
    [recent, pacingNote ? `【节奏建议】${pacingNote}` : ''].filter(Boolean).join('\n') ||
    state.lastChapterSummary ||
    '（首章）';

  return {
    recentSummaries,
    arcContext,
    foreshadowingBlock,
    protagonistAssetBlock,
    openThreadsBlock,
    worldOnboardingBlock,
  };
}
