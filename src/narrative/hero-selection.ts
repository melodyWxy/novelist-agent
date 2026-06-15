/**
 * 主人公线章节选点：选取下一个主角行动节点，并匹配可插入的碰撞增强
 */
import type {
  Collision,
  HeroEvent,
  HeroTimeline,
  SupportEvent,
  SupportTimeline,
  WorldEvent,
  WorldTimeline,
} from './types.js';
import { collisionRankScore, enrichCollisionScores } from './disclosure.js';

function locationOverlap(a: string, b: string): boolean {
  if (!a || !b) return false;
  const na = a.replace(/\s/g, '');
  const nb = b.replace(/\s/g, '');
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** 状态更新 LLM 偶发产出的无效占位节点（day=0、地点未知、意图空泛） */
export function isPlaceholderHeroEvent(
  event: Pick<HeroEvent, 'day' | 'title' | 'intent' | 'location' | 'constraints'>
): boolean {
  if (event.day < 1) return true;
  const loc = (event.location ?? '').trim();
  const intent = (event.intent ?? '').trim();
  const title = (event.title ?? '').trim();
  return (
    (loc === '未知' || loc === '') &&
    intent === '推进主线' &&
    (title === '新行动' || title === '') &&
    (!event.constraints || event.constraints.length === 0)
  );
}

/** 写章完成后，将事件包绑定的主人公节点标记为已消费 */
export function markEpisodeHeroEventsUsed(
  hero: HeroTimeline,
  heroEventIds: string[],
  chapterNumber: number
): void {
  for (const heroEventId of heroEventIds) {
    const idx = hero.events.findIndex((e) => e.id === heroEventId);
    if (idx < 0) continue;
    const ev = hero.events[idx];
    if (ev.usedInChapter) continue;
    ev.usedInChapter = chapterNumber;
    if (ev.status === 'planned' || ev.status === 'active') {
      ev.status = 'resolved';
    }
  }
}

function sortHeroCandidates(events: HeroEvent[]): HeroEvent[] {
  return [...events].sort((a, b) => a.day - b.day || a.sortOrder - b.sortOrder);
}

/** 选取下一个待写章的主角行动节点（按 day、sortOrder 升序） */
export function pickNextHeroEvent(
  hero: HeroTimeline,
  options?: { narrativeDay?: number }
): HeroEvent | null {
  const base = hero.events.filter(
    (e) =>
      (e.status === 'planned' || e.status === 'active') &&
      !e.usedInChapter &&
      !isPlaceholderHeroEvent(e)
  );

  const narrativeDay = options?.narrativeDay;
  if (narrativeDay != null && narrativeDay > 0) {
    const anchored = base.filter((e) => e.day >= narrativeDay - 1);
    const picked = sortHeroCandidates(anchored)[0];
    if (picked) return picked;
  }

  return sortHeroCandidates(base)[0] ?? null;
}

/** 与主角事件同日/同地或显式引用该主角事件的碰撞候选 */
export function findCollisionsForHeroEvent(
  collisions: Collision[],
  heroEvent: HeroEvent
): Collision[] {
  return collisions
    .filter((c) => c.status === 'candidate' || c.status === 'accepted')
    .filter(
      (c) =>
        c.heroEventIds.includes(heroEvent.id) ||
        (c.day === heroEvent.day && locationOverlap(c.location, heroEvent.location))
    )
    .map(enrichCollisionScores);
}

/** 为当前主角事件挑选最佳碰撞增强（非章节主导，仅增强） */
export function pickBestCollisionForHeroEvent(
  collisions: Collision[],
  heroEvent: HeroEvent,
  pacingBoost?: (type: Collision['collisionType']) => number
): Collision | null {
  const matched = findCollisionsForHeroEvent(collisions, heroEvent);
  if (matched.length === 0) return null;

  return [...matched].sort(
    (a, b) =>
      (b.required ? 10 : 0) - (a.required ? 10 : 0) ||
      (pacingBoost?.(b.collisionType) ?? 0) - (pacingBoost?.(a.collisionType) ?? 0) ||
      collisionRankScore(b) - collisionRankScore(a)
  )[0];
}

/** 主角事件附近的世界线事件（同日或同地） */
export function findNearbyWorldEvents(
  world: WorldTimeline,
  heroEvent: HeroEvent
): WorldEvent[] {
  return world.events.filter(
    (e) =>
      e.day === heroEvent.day ||
      (Math.abs(e.day - heroEvent.day) <= 1 && locationOverlap(e.location, heroEvent.location))
  );
}

/** 主角事件附近的配角线事件（同日/同地，或主角有感知） */
export function findNearbySupportEvents(
  support: SupportTimeline | null | undefined,
  heroEvent: HeroEvent
): SupportEvent[] {
  if (!support) return [];
  return support.events.filter(
    (e) =>
      e.day === heroEvent.day ||
      locationOverlap(e.location, heroEvent.location) ||
      e.protagonistAwareness !== 'none'
  );
}
