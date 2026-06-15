/**
 * 明线/隐线信息分层工具
 *
 * 世界线 = 隐线（系统掌握，正文只暗示）
 * 主人公线 = 明线（POV 驱动叙事）
 */
import type { WorldBible, Collision, EpisodePlan, HeroTimeline, SceneBeat, CollisionType } from './types.js';
import { coerceCollisionType } from './types.js';

const RANK = { low: 1, medium: 2, high: 3 } as const;

/** 将旧版 string[] 或结构化节拍统一为 SceneBeat[] */
export function normalizeSceneBeats(beats: unknown): SceneBeat[] {
  if (!Array.isArray(beats)) return [];
  return beats.map((b) => {
    if (typeof b === 'string') {
      return { line: 'hero' as const, beat: b };
    }
    if (b && typeof b === 'object' && 'beat' in b) {
      const line = (b as { line?: string }).line === 'shadow-hint' ? 'shadow-hint' : 'hero';
      return { line, beat: String((b as { beat: string }).beat) };
    }
    return { line: 'hero' as const, beat: String(b) };
  });
}

export function formatSceneBeats(beats: SceneBeat[]): string {
  return beats
    .map((b, i) => {
      const tag = b.line === 'shadow-hint' ? '隐线暗示' : '明线';
      return `${i + 1}. [${tag}] ${b.beat}`;
    })
    .join('\n');
}

/** 从 Bible + 事件包提取正文禁止直述的专有词 */
export function extractForbiddenTerms(
  bible: WorldBible | null,
  episode: EpisodePlan
): string[] {
  const terms = new Set<string>();

  for (const f of bible?.factions ?? []) {
    if (f.name.length >= 2) terms.add(f.name);
    for (const g of f.goals) {
      if (g.length >= 4) terms.add(g);
    }
  }

  // hiddenCausality 整句及子短语（≥3 字）视为泄露风险词
  const causality = episode.hiddenCausality.trim();
  if (causality.length >= 3) terms.add(causality);

  const fragments = causality.split(/[，,、；;。]/).map((s) => s.trim()).filter((s) => s.length >= 3);
  for (const frag of fragments) terms.add(frag);

  for (const hint of episode.shadowHints ?? []) {
    // 暗示清单本身可出现在正文，不加入禁词
    void hint;
  }

  for (const f of episode.foreshadowing) {
    if (f.length >= 4) terms.add(f);
  }

  return [...terms];
}

export interface LeakDetectionResult {
  hiddenLineLeak: boolean;
  leakedTerms: string[];
}

/** 检测正文是否直述隐线专有信息 */
export function detectHiddenLineLeak(
  content: string,
  forbiddenTerms: string[]
): LeakDetectionResult {
  const leaked: string[] = [];
  const normalized = content.replace(/\s/g, '');

  for (const term of forbiddenTerms) {
    const t = term.replace(/\s/g, '');
    if (t.length >= 3 && normalized.includes(t)) {
      leaked.push(term);
    }
  }

  return {
    hiddenLineLeak: leaked.length > 0,
    leakedTerms: leaked,
  };
}

/** 推断碰撞评分（LLM 未返回时使用启发式） */
export function enrichCollisionScores(c: Collision): Collision {
  let disclosureRisk = c.disclosureRisk ?? 'medium';
  let surfaceStrength = c.surfaceStrength ?? 'medium';
  let causalTightness = c.causalTightness ?? 'medium';

  if (c.collisionType === 'time') disclosureRisk = 'high';
  if (c.collisionType === 'information' || c.collisionType === 'value') {
    disclosureRisk = 'low';
    surfaceStrength = 'high';
  }
  if (c.collisionType === 'location' || c.collisionType === 'resource') {
    surfaceStrength = 'high';
  }
  if (c.readerRevealLevel === 'full') disclosureRisk = 'high';
  if (c.readerRevealLevel === 'none') disclosureRisk = 'low';
  if (c.rationale.length >= 20) causalTightness = 'high';

  return { ...c, disclosureRisk, surfaceStrength, causalTightness };
}

export function collisionRankScore(c: Collision): number {
  const enriched = enrichCollisionScores(c);
  return (
    RANK[enriched.surfaceStrength] * 2 +
    RANK[enriched.causalTightness] +
    (4 - RANK[enriched.disclosureRisk])
  );
}

/** 从候选碰撞中选出最优（required 优先，再按戏剧潜力） */
export function pickBestCollision(
  collisions: Collision[],
  pacingBoost?: (type: Collision['collisionType']) => number
): Collision | null {
  const candidates = collisions.filter((c) => c.status === 'candidate');
  if (candidates.length === 0) return null;

  return [...candidates]
    .map(enrichCollisionScores)
    .sort(
      (a, b) =>
        (b.required ? 10 : 0) - (a.required ? 10 : 0) ||
        (pacingBoost?.(b.collisionType) ?? 0) - (pacingBoost?.(a.collisionType) ?? 0) ||
        collisionRankScore(b) - collisionRankScore(a)
    )[0];
}

/** 按戏剧潜力排序；默认过滤隐线暴露过高的候选 */
export function rankAndFilterCollisions(
  collisions: Collision[],
  options?: { includeHighRisk?: boolean }
): Collision[] {
  const enriched = collisions.map(enrichCollisionScores);
  const sorted = [...enriched].sort((a, b) => collisionRankScore(b) - collisionRankScore(a));

  if (options?.includeHighRisk) return sorted;

  const safe = sorted.filter((c) => c.disclosureRisk !== 'high');
  return safe.length > 0 ? safe : sorted;
}

/** 事件包产出后补全 shadowHints（LLM 未给时从隐线因果推导占位） */
export function ensureShadowHints(episode: Omit<EpisodePlan, 'shadowHints'> & { shadowHints?: string[] }): string[] {
  if (episode.shadowHints && episode.shadowHints.length > 0) {
    return episode.shadowHints;
  }
  const shadowBeats = normalizeSceneBeats(episode.sceneBeats).filter((b) => b.line === 'shadow-hint');
  if (shadowBeats.length > 0) {
    return shadowBeats.map((b) => b.beat);
  }
  return [
    '环境中出现与日常不符的异常细节（不明来源的痕迹、规格统一的装备、过于安静的区域）',
    '配角对异常欲言又止，或给出矛盾说法',
    '主角对异常做出符合其认知的误读，而非洞悉真相',
  ];
}

/** 规范化事件包：碰撞类型 + 节拍结构 + 暗示清单 */
export function normalizeEpisodePlan<T extends Omit<EpisodePlan, 'sceneBeats' | 'shadowHints' | 'collisionType'> & {
  collisionType: unknown;
  sceneBeats: unknown;
  shadowHints?: string[];
}>(
  raw: T,
  options?: { fallbackCollisionType?: CollisionType }
): Omit<T, 'sceneBeats' | 'shadowHints' | 'collisionType'> & {
  collisionType: CollisionType;
  sceneBeats: SceneBeat[];
  shadowHints: string[];
} {
  const collisionType = coerceCollisionType(raw.collisionType, options?.fallbackCollisionType);
  const sceneBeats = normalizeSceneBeats(raw.sceneBeats);
  const shadowHints = ensureShadowHints({ ...raw, collisionType, sceneBeats });
  return { ...raw, collisionType, sceneBeats, shadowHints };
}

/**
 * 将本章 heroGains 合并进主人公线已知信息（POV 闸门）
 * 主角 knownWorldFacts 不得超出 heroGains
 */
export function applyHeroGainsToTimeline(
  hero: HeroTimeline,
  heroGains: string[],
  chapterNumber: number,
  episodeDay: number
): void {
  if (heroGains.length === 0) return;

  const mergeFacts = (existing: string[]) => [...new Set([...existing, ...heroGains])];

  for (const e of hero.events) {
    if (e.usedInChapter === chapterNumber || (e.day === episodeDay && e.status !== 'planned')) {
      e.knownWorldFacts = mergeFacts(e.knownWorldFacts);
    }
  }

  // 当日最近一个行动节点兜底
  const dayEvents = hero.events.filter((e) => e.day === episodeDay);
  if (dayEvents.length > 0) {
    const target = dayEvents[dayEvents.length - 1];
    target.knownWorldFacts = mergeFacts(target.knownWorldFacts);
  }
}

/** 剥离 LLM 新事件中超出 heroGains 的 knownWorldFacts */
export function sanitizeHeroEventFacts(
  knownWorldFacts: string[] | undefined,
  heroGains: string[]
): string[] {
  if (!knownWorldFacts?.length) {
    return heroGains.length > 0 ? [...heroGains] : [];
  }
  if (heroGains.length === 0) return [];

  return knownWorldFacts.filter((fact) =>
    heroGains.some((g) => g.includes(fact) || fact.includes(g))
  );
}
