/**
 * MVP3：世界模拟 Tick — 推进世界线、配角隐线、主人公线，刷新碰撞池
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { LlmClient, UNIVERSE_LLM_OPTIONS } from '../llm/client.js';
import * as novelStore from '../novel/store.js';
import * as narrativeStore from './store.js';
import { buildWorldTickPrompt } from '../prompts/world-simulator.js';
import { buildSupportTickPrompt } from '../prompts/support-tick.js';
import { buildHeroTickPrompt } from '../prompts/hero-tick.js';
import {
  WorldEventSchema,
  SupportEventSchema,
  HeroEventSchema,
  type UniverseSimState,
  type WorldBible,
  type WorldTimeline,
  type SupportTimeline,
  type HeroTimeline,
  type Collision,
} from './types.js';
import { discoverCollisions } from './pipeline.js';
import { nextSortOrderOnDay } from './timeline-sort.js';

const WorldTickOutputSchema = z.object({
  events: z.array(
    WorldEventSchema.omit({ id: true, status: true, usedInChapter: true, locked: true })
  ),
  resolvedEventIds: z.array(z.string()).default([]),
  biblePatch: z
    .object({
      geographyAdditions: z.array(z.string()).default([]),
      coreConflictAdditions: z.array(z.string()).default([]),
      factionUpdates: z
        .array(
          z.object({
            factionId: z.string(),
            goalsAdditions: z.array(z.string()).default([]),
            resourcesAdditions: z.array(z.string()).default([]),
            relationships: z.record(z.string()).default({}),
          })
        )
        .default([]),
    })
    .optional(),
});

const SupportTickOutputSchema = z.object({
  events: z.array(
    SupportEventSchema.omit({ id: true, status: true, usedInChapter: true, locked: true })
  ),
  resolvedEventIds: z.array(z.string()).default([]),
});

const HeroTickOutputSchema = z.object({
  protagonistGoal: z.string().optional(),
  crisis: z.string().optional(),
  events: z.array(
    HeroEventSchema.omit({ id: true, status: true, usedInChapter: true, locked: true })
  ),
});

function appendUniqueStrings(existing: string[], additions: string[], maxItems: number): string[] {
  const seen = new Set(existing.map((item) => item.trim()).filter(Boolean));
  const merged = [...existing];

  for (const item of additions) {
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(normalized);
  }

  return merged.slice(-maxItems);
}

function applyWorldBiblePatch(
  bible: WorldBible,
  patch: z.infer<typeof WorldTickOutputSchema>['biblePatch'],
  updatedAt: string
): { bible: WorldBible; changed: boolean } {
  if (!patch) return { bible, changed: false };

  let changed = false;
  const next: WorldBible = {
    ...bible,
    geography: appendUniqueStrings(bible.geography, patch.geographyAdditions, 80),
    coreConflicts: appendUniqueStrings(bible.coreConflicts, patch.coreConflictAdditions, 40),
  };

  if (next.geography.length !== bible.geography.length) changed = true;
  if (next.coreConflicts.length !== bible.coreConflicts.length) changed = true;

  next.factions = bible.factions.map((faction) => {
    const update = patch.factionUpdates.find((item) => item.factionId === faction.id);
    if (!update) return faction;

    const goals = appendUniqueStrings(faction.goals, update.goalsAdditions, 24);
    const resources = appendUniqueStrings(faction.resources, update.resourcesAdditions, 32);
    const relationships = { ...faction.relationships, ...update.relationships };

    if (
      goals.length !== faction.goals.length ||
      resources.length !== faction.resources.length ||
      Object.keys(relationships).length !== Object.keys(faction.relationships).length
    ) {
      changed = true;
    }

    return {
      ...faction,
      goals,
      resources,
      relationships,
    };
  });

  return {
    bible: changed ? { ...next, generatedAt: updatedAt } : bible,
    changed,
  };
}

export interface UniverseTickOptions {
  tickDays?: number;
  autoDiscoverCollisions?: boolean;
  maxCollisions?: number;
}

export interface UniverseTickResult {
  fromDay: number;
  toDay: number;
  newWorldEvents: number;
  newSupportEvents: number;
  newHeroEvents: number;
  resolvedWorldEvents: number;
  collisions: Collision[];
  world: WorldTimeline;
  support: SupportTimeline;
  hero: HeroTimeline;
  simState: UniverseSimState;
}

export async function tickUniverse(
  llm: LlmClient,
  novelId: string,
  options: UniverseTickOptions = {}
): Promise<UniverseTickResult> {
  const tickDays = Math.max(1, Math.min(options.tickDays ?? 1, 7));
  const autoDiscover = options.autoDiscoverCollisions !== false;

  const meta = await novelStore.loadNovelMeta(novelId);
  const bible = await narrativeStore.loadWorldBible(novelId);
  const world = await narrativeStore.loadWorldTimeline(novelId);
  const hero = await narrativeStore.loadHeroTimeline(novelId);

  if (!bible || !world || !hero) {
    throw new Error('请先生成叙事宇宙');
  }

  let support =
    (await narrativeStore.loadSupportTimeline(novelId)) ??
    ({ events: [], updatedAt: new Date().toISOString() } satisfies SupportTimeline);

  const fromDay = world.currentDay + 1;
  const toDay = world.currentDay + tickDays;
  const now = new Date().toISOString();

  const worldOut = await llm.chatJson(
    buildWorldTickPrompt(meta, bible, world, tickDays),
    WorldTickOutputSchema,
    { ...UNIVERSE_LLM_OPTIONS, temperature: 0.75 }
  );

  const biblePatch = applyWorldBiblePatch(bible, worldOut.biblePatch, now);
  const currentBible = biblePatch.bible;
  if (biblePatch.changed) {
    await narrativeStore.saveWorldBible(novelId, currentBible);
  }

  let newWorldCount = 0;
  for (const e of worldOut.events) {
    if (e.day < fromDay || e.day > toDay) continue;
    world.events.push({
      ...e,
      id: randomUUID(),
      status: 'planned',
      locked: false,
      sortOrder: nextSortOrderOnDay(world.events, e.day),
    });
    newWorldCount++;
  }

  let resolvedCount = 0;
  for (const eventId of worldOut.resolvedEventIds) {
    const idx = world.events.findIndex((ev) => ev.id === eventId);
    if (idx >= 0 && !world.events[idx].locked && world.events[idx].status !== 'resolved') {
      world.events[idx].status = 'resolved';
      resolvedCount++;
    }
  }

  world.currentDay = toDay;
  world.updatedAt = now;
  await narrativeStore.saveWorldTimeline(novelId, world);

  let newSupportCount = 0;
  if (bible.supportCharacters.length > 0) {
    const validCharIds = new Set(currentBible.supportCharacters.map((c) => c.id));
    const supportOut = await llm.chatJson(
      buildSupportTickPrompt(meta, currentBible, world, support, fromDay, toDay),
      SupportTickOutputSchema,
      { ...UNIVERSE_LLM_OPTIONS, temperature: 0.78 }
    );

    for (const e of supportOut.events) {
      if (!validCharIds.has(e.characterId)) continue;
      if (e.day < fromDay || e.day > toDay) continue;
      support.events.push({
        ...e,
        id: randomUUID(),
        status: 'planned',
        locked: false,
        protagonistAwareness: e.protagonistAwareness ?? 'none',
        worldEventIds: e.worldEventIds ?? [],
        sortOrder: nextSortOrderOnDay(support.events, e.day),
      });
      newSupportCount++;
    }

    for (const eventId of supportOut.resolvedEventIds ?? []) {
      const idx = support.events.findIndex((ev) => ev.id === eventId);
      if (idx >= 0 && !support.events[idx].locked && support.events[idx].status !== 'resolved') {
        support.events[idx].status = 'resolved';
      }
    }
  }
  support.updatedAt = now;
  await narrativeStore.saveSupportTimeline(novelId, support);

  const heroOut = await llm.chatJson(
    buildHeroTickPrompt(meta, hero, world, fromDay, toDay, currentBible, support),
    HeroTickOutputSchema,
    { ...UNIVERSE_LLM_OPTIONS, temperature: 0.8 }
  );

  if (heroOut.protagonistGoal) hero.protagonistGoal = heroOut.protagonistGoal;
  if (heroOut.crisis !== undefined) hero.crisis = heroOut.crisis;

  let newHeroCount = 0;
  for (const e of heroOut.events) {
    if (e.day < fromDay || e.day > toDay) continue;
    hero.events.push({
      ...e,
      id: randomUUID(),
      status: 'planned',
      locked: false,
      constraints: e.constraints ?? [],
      knownWorldFacts: e.knownWorldFacts ?? [],
      sortOrder: nextSortOrderOnDay(hero.events, e.day),
    });
    newHeroCount++;
  }
  hero.updatedAt = now;
  await narrativeStore.saveHeroTimeline(novelId, hero);

  const prevCollisions = await narrativeStore.loadCollisions(novelId);
  const prevCandidateCount =
    prevCollisions?.collisions.filter((c) => c.status === 'candidate').length ?? 0;

  let collisions: Collision[] = [];
  if (autoDiscover) {
    collisions = await discoverCollisions(llm, novelId, options.maxCollisions ?? 6);
  } else {
    collisions = prevCollisions?.collisions ?? [];
  }

  const candidateCount = collisions.filter((c) => c.status === 'candidate').length;
  const newCollisionCount = Math.max(0, candidateCount - prevCandidateCount);

  const prevSim = await narrativeStore.loadUniverseSimState(novelId);
  const simState: UniverseSimState = {
    lastTickAt: now,
    fromDay,
    toDay,
    newWorldEvents: newWorldCount,
    newSupportEvents: newSupportCount,
    newHeroEvents: newHeroCount,
    resolvedWorldEvents: resolvedCount,
    newCollisions: newCollisionCount,
    ticksTotal: (prevSim?.ticksTotal ?? 0) + 1,
  };
  await narrativeStore.saveUniverseSimState(novelId, simState);

  return {
    fromDay,
    toDay,
    newWorldEvents: newWorldCount,
    newSupportEvents: newSupportCount,
    newHeroEvents: newHeroCount,
    resolvedWorldEvents: resolvedCount,
    collisions,
    world,
    support,
    hero,
    simState,
  };
}
