/**
 * MVP2：可编辑时间轴 — 作者手动控制世界线/主人公线/势力目标
 */
import { randomUUID } from 'node:crypto';
import * as narrativeStore from './store.js';
import type {
  TimelinePatch,
  CollisionPatch,
  WorldTimeline,
  HeroTimeline,
  SupportTimeline,
  WorldBible,
  CollisionsFile,
} from './types.js';
import { rankAndFilterCollisions, enrichCollisionScores, collisionRankScore } from './disclosure.js';
import { moveEventInTimeline, nextSortOrderOnDay } from './timeline-sort.js';

function bumpTimelineDay(timeline: WorldTimeline | HeroTimeline, day: number): void {
  if ('currentDay' in timeline) {
    timeline.currentDay = Math.max(timeline.currentDay, day);
  }
}

export async function applyTimelinePatch(
  novelId: string,
  patch: TimelinePatch
): Promise<{
  world?: WorldTimeline;
  hero?: HeroTimeline;
  support?: SupportTimeline;
  bible?: WorldBible;
}> {
  const now = new Date().toISOString();

  switch (patch.op) {
    case 'updateWorldEvent': {
      const world = await narrativeStore.loadWorldTimeline(novelId);
      if (!world) throw new Error('世界线不存在');
      const idx = world.events.findIndex((e) => e.id === patch.eventId);
      if (idx < 0) throw new Error(`世界事件 ${patch.eventId} 不存在`);
      world.events[idx] = { ...world.events[idx], ...patch.patch };
      if (patch.patch.day !== undefined) {
        bumpTimelineDay(world, patch.patch.day);
      }
      world.updatedAt = now;
      await narrativeStore.saveWorldTimeline(novelId, world);
      return { world };
    }
    case 'moveWorldEvent': {
      const world = await narrativeStore.loadWorldTimeline(novelId);
      if (!world) throw new Error('世界线不存在');
      const target = world.events.find((e) => e.id === patch.eventId);
      if (target?.locked) throw new Error('锁定事件不可移动');
      world.events = moveEventInTimeline(world.events, patch.eventId, patch.day, patch.beforeEventId);
      bumpTimelineDay(world, patch.day);
      world.updatedAt = now;
      await narrativeStore.saveWorldTimeline(novelId, world);
      return { world };
    }
    case 'addWorldEvent': {
      const world = await narrativeStore.loadWorldTimeline(novelId);
      if (!world) throw new Error('世界线不存在');
      const event = {
        ...patch.event,
        id: randomUUID(),
        status: 'planned' as const,
        locked: patch.event.locked ?? false,
        sortOrder: patch.event.sortOrder ?? nextSortOrderOnDay(world.events, patch.event.day),
      };
      world.events.push(event);
      bumpTimelineDay(world, event.day);
      world.updatedAt = now;
      await narrativeStore.saveWorldTimeline(novelId, world);
      return { world };
    }
    case 'updateHeroEvent': {
      const hero = await narrativeStore.loadHeroTimeline(novelId);
      if (!hero) throw new Error('主人公线不存在');
      const idx = hero.events.findIndex((e) => e.id === patch.eventId);
      if (idx < 0) throw new Error(`主角行动 ${patch.eventId} 不存在`);
      hero.events[idx] = { ...hero.events[idx], ...patch.patch };
      hero.updatedAt = now;
      await narrativeStore.saveHeroTimeline(novelId, hero);
      return { hero };
    }
    case 'moveHeroEvent': {
      const hero = await narrativeStore.loadHeroTimeline(novelId);
      if (!hero) throw new Error('主人公线不存在');
      const target = hero.events.find((e) => e.id === patch.eventId);
      if (target?.locked) throw new Error('锁定事件不可移动');
      hero.events = moveEventInTimeline(hero.events, patch.eventId, patch.day, patch.beforeEventId);
      hero.updatedAt = now;
      await narrativeStore.saveHeroTimeline(novelId, hero);
      return { hero };
    }
    case 'addHeroEvent': {
      const hero = await narrativeStore.loadHeroTimeline(novelId);
      if (!hero) throw new Error('主人公线不存在');
      hero.events.push({
        ...patch.event,
        id: randomUUID(),
        status: 'planned',
        locked: patch.event.locked ?? false,
        constraints: patch.event.constraints ?? [],
        knownWorldFacts: patch.event.knownWorldFacts ?? [],
        sortOrder: patch.event.sortOrder ?? nextSortOrderOnDay(hero.events, patch.event.day),
      });
      hero.updatedAt = now;
      await narrativeStore.saveHeroTimeline(novelId, hero);
      return { hero };
    }
    case 'updateHeroProfile': {
      const hero = await narrativeStore.loadHeroTimeline(novelId);
      if (!hero) throw new Error('主人公线不存在');
      if (patch.protagonistGoal !== undefined) hero.protagonistGoal = patch.protagonistGoal;
      if (patch.crisis !== undefined) hero.crisis = patch.crisis;
      hero.updatedAt = now;
      await narrativeStore.saveHeroTimeline(novelId, hero);
      return { hero };
    }
    case 'updateFactionGoals': {
      const bible = await narrativeStore.loadWorldBible(novelId);
      if (!bible) throw new Error('世界 Bible 不存在');
      const idx = bible.factions.findIndex((f) => f.id === patch.factionId);
      if (idx < 0) throw new Error(`势力 ${patch.factionId} 不存在`);
      bible.factions[idx].goals = patch.goals;
      await narrativeStore.saveWorldBible(novelId, bible);
      return { bible };
    }
    case 'updateSupportEvent': {
      const support = await narrativeStore.loadSupportTimeline(novelId);
      if (!support) throw new Error('配角隐线不存在');
      const bible = await narrativeStore.loadWorldBible(novelId);
      const idx = support.events.findIndex((e) => e.id === patch.eventId);
      if (idx < 0) throw new Error(`配角事件 ${patch.eventId} 不存在`);
      if (patch.patch.characterId !== undefined) {
        const known = bible?.supportCharacters.some((c) => c.id === patch.patch.characterId);
        if (!known) throw new Error(`配角 ${patch.patch.characterId} 不存在`);
      }
      support.events[idx] = { ...support.events[idx], ...patch.patch };
      support.updatedAt = now;
      await narrativeStore.saveSupportTimeline(novelId, support);
      return { support };
    }
    case 'moveSupportEvent': {
      const support = await narrativeStore.loadSupportTimeline(novelId);
      if (!support) throw new Error('配角隐线不存在');
      const target = support.events.find((e) => e.id === patch.eventId);
      if (target?.locked) throw new Error('锁定事件不可移动');
      support.events = moveEventInTimeline(support.events, patch.eventId, patch.day, patch.beforeEventId);
      support.updatedAt = now;
      await narrativeStore.saveSupportTimeline(novelId, support);
      return { support };
    }
    case 'addSupportEvent': {
      const support =
        (await narrativeStore.loadSupportTimeline(novelId)) ??
        ({ events: [], updatedAt: now } satisfies SupportTimeline);
      const bible = await narrativeStore.loadWorldBible(novelId);
      const known = bible?.supportCharacters.some((c) => c.id === patch.event.characterId);
      if (!known) throw new Error(`配角 ${patch.event.characterId} 不存在`);
      support.events.push({
        ...patch.event,
        id: randomUUID(),
        status: 'planned',
        locked: patch.event.locked ?? false,
        protagonistAwareness: patch.event.protagonistAwareness ?? 'none',
        worldEventIds: patch.event.worldEventIds ?? [],
        sortOrder: patch.event.sortOrder ?? nextSortOrderOnDay(support.events, patch.event.day),
      });
      support.updatedAt = now;
      await narrativeStore.saveSupportTimeline(novelId, support);
      return { support };
    }
    case 'updateSupportCharacterGoals': {
      const bible = await narrativeStore.loadWorldBible(novelId);
      if (!bible) throw new Error('世界 Bible 不存在');
      const idx = bible.supportCharacters.findIndex((c) => c.id === patch.characterId);
      if (idx < 0) throw new Error(`配角 ${patch.characterId} 不存在`);
      bible.supportCharacters[idx].goals = patch.goals;
      await narrativeStore.saveWorldBible(novelId, bible);
      return { bible };
    }
    case 'replacePowerSystem': {
      await narrativeStore.savePowerSystem(novelId, {
        ...patch.powerSystem,
        updatedAt: now,
      });
      return {};
    }
    case 'replaceCharacterAssets': {
      await narrativeStore.saveCharacterAssets(novelId, {
        ...patch.characterAssets,
        updatedAt: now,
      });
      return {};
    }
    case 'replaceStoryArcs': {
      await narrativeStore.saveStoryArcs(novelId, {
        ...patch.storyArcs,
        updatedAt: now,
      });
      return {};
    }
    default:
      throw new Error('未知时间轴操作');
  }
}

export async function applyCollisionPatch(
  novelId: string,
  patch: CollisionPatch
): Promise<CollisionsFile> {
  const file = await narrativeStore.loadCollisions(novelId);
  if (!file) throw new Error('碰撞数据不存在');

  const collisionId = patch.collisionId;
  const idx = file.collisions.findIndex((c) => c.id === collisionId);
  if (idx < 0) throw new Error(`碰撞 ${collisionId} 不存在`);

  if (patch.op === 'reject') {
    file.collisions[idx].status = 'rejected';
  } else {
    if (patch.required !== undefined) file.collisions[idx].required = patch.required;
    if (patch.status !== undefined) file.collisions[idx].status = patch.status;
  }

  file.updatedAt = new Date().toISOString();
  await narrativeStore.saveCollisions(novelId, file);
  return file;
}

/** 重新发现碰撞时合并：保留必须发生 / 已接受 / 已使用的碰撞 */
export function mergeDiscoveredCollisions(
  existing: CollisionsFile | null,
  fresh: import('./types.js').Collision[]
): import('./types.js').Collision[] {
  const preserved =
    existing?.collisions.filter(
      (c) => c.required || c.status === 'accepted' || c.status === 'used'
    ) ?? [];

  const preservedIds = new Set(preserved.map((c) => c.id));
  const freshCandidates = fresh.filter((c) => !preservedIds.has(c.id));

  const merged = [...preserved, ...freshCandidates];
  const ranked = rankAndFilterCollisions(merged.map(enrichCollisionScores));

  return ranked.sort((a, b) => {
    const req = (c: typeof a) => (c.required ? 10 : 0);
    return req(b) - req(a) || collisionRankScore(b) - collisionRankScore(a);
  });
}
