/**
 * 双线叙事数据存储
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getNovelDir } from '../novel/store.js';
import { ensureDir, writeJsonAtomic } from '../lib/atomic-fs.js';
import {
  WorldBible,
  WorldBibleSchema,
  WorldTimeline,
  WorldTimelineSchema,
  HeroTimeline,
  HeroTimelineSchema,
  CollisionsFile,
  CollisionsFileSchema,
  Collision,
  EpisodePlan,
  EpisodePlanSchema,
  WorldEvent,
  HeroEvent,
  SupportTimeline,
  SupportTimelineSchema,
  SupportEvent,
  UniverseSimState,
  UniverseSimStateSchema,
  NarrativeCycleLog,
  NarrativeCycleLogSchema,
  CycleRun,
  CycleRunSchema,
  CycleRunHistory,
  CycleRunHistorySchema,
  PowerSystemFile,
  PowerSystemFileSchema,
  CharacterAssetsFile,
  CharacterAssetsFileSchema,
  StoryArcsFile,
  StoryArcsFileSchema,
  ConceptIntroductionIndex,
  ConceptIntroductionIndexSchema,
  ChapterMemoryIndex,
  ChapterMemoryIndexSchema,
} from './types.js';

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function ensureNarrativeDirs(novelId: string): Promise<void> {
  const dir = getNovelDir(novelId);
  await ensureDir(path.join(dir, 'episodes'));
}

export async function saveWorldBible(novelId: string, bible: WorldBible): Promise<void> {
  await ensureNarrativeDirs(novelId);
  const parsed = WorldBibleSchema.parse(bible);
  await writeJsonAtomic(path.join(getNovelDir(novelId), 'world-bible.json'), parsed);
}

export async function loadWorldBible(novelId: string): Promise<WorldBible | null> {
  const data = await readJson<unknown>(path.join(getNovelDir(novelId), 'world-bible.json'));
  return data ? WorldBibleSchema.parse(data) : null;
}

export async function saveWorldTimeline(novelId: string, timeline: WorldTimeline): Promise<void> {
  await ensureNarrativeDirs(novelId);
  const parsed = WorldTimelineSchema.parse(timeline);
  await writeJsonAtomic(path.join(getNovelDir(novelId), 'world-timeline.json'), parsed);
}

export async function loadWorldTimeline(novelId: string): Promise<WorldTimeline | null> {
  const data = await readJson<unknown>(path.join(getNovelDir(novelId), 'world-timeline.json'));
  return data ? WorldTimelineSchema.parse(data) : null;
}

export async function saveHeroTimeline(novelId: string, timeline: HeroTimeline): Promise<void> {
  await ensureNarrativeDirs(novelId);
  const parsed = HeroTimelineSchema.parse(timeline);
  await writeJsonAtomic(path.join(getNovelDir(novelId), 'hero-timeline.json'), parsed);
}

export async function loadHeroTimeline(novelId: string): Promise<HeroTimeline | null> {
  const data = await readJson<unknown>(path.join(getNovelDir(novelId), 'hero-timeline.json'));
  return data ? HeroTimelineSchema.parse(data) : null;
}

export async function saveSupportTimeline(novelId: string, timeline: SupportTimeline): Promise<void> {
  await ensureNarrativeDirs(novelId);
  const parsed = SupportTimelineSchema.parse(timeline);
  await writeJsonAtomic(path.join(getNovelDir(novelId), 'support-timeline.json'), parsed);
}

export async function loadSupportTimeline(novelId: string): Promise<SupportTimeline | null> {
  const data = await readJson<unknown>(path.join(getNovelDir(novelId), 'support-timeline.json'));
  return data ? SupportTimelineSchema.parse(data) : null;
}

export async function savePowerSystem(novelId: string, powerSystem: PowerSystemFile): Promise<void> {
  await ensureNarrativeDirs(novelId);
  const parsed = PowerSystemFileSchema.parse(powerSystem);
  await writeJsonAtomic(path.join(getNovelDir(novelId), 'power-system.json'), parsed);
}

export async function loadPowerSystem(novelId: string): Promise<PowerSystemFile | null> {
  const data = await readJson<unknown>(path.join(getNovelDir(novelId), 'power-system.json'));
  return data ? PowerSystemFileSchema.parse(data) : null;
}

export async function saveCharacterAssets(novelId: string, assets: CharacterAssetsFile): Promise<void> {
  await ensureNarrativeDirs(novelId);
  const parsed = CharacterAssetsFileSchema.parse(assets);
  await writeJsonAtomic(path.join(getNovelDir(novelId), 'character-assets.json'), parsed);
}

export async function loadCharacterAssets(novelId: string): Promise<CharacterAssetsFile | null> {
  const data = await readJson<unknown>(path.join(getNovelDir(novelId), 'character-assets.json'));
  return data ? CharacterAssetsFileSchema.parse(data) : null;
}

export async function saveStoryArcs(novelId: string, arcs: StoryArcsFile): Promise<void> {
  await ensureNarrativeDirs(novelId);
  const parsed = StoryArcsFileSchema.parse(arcs);
  await writeJsonAtomic(path.join(getNovelDir(novelId), 'story-arcs.json'), parsed);
}

export async function loadStoryArcs(novelId: string): Promise<StoryArcsFile | null> {
  const data = await readJson<unknown>(path.join(getNovelDir(novelId), 'story-arcs.json'));
  return data ? StoryArcsFileSchema.parse(data) : null;
}

export async function saveConceptIntroductions(
  novelId: string,
  index: ConceptIntroductionIndex
): Promise<void> {
  await ensureNarrativeDirs(novelId);
  const parsed = ConceptIntroductionIndexSchema.parse(index);
  await writeJsonAtomic(path.join(getNovelDir(novelId), 'concept-introductions.json'), parsed);
}

export async function loadConceptIntroductions(
  novelId: string
): Promise<ConceptIntroductionIndex | null> {
  const data = await readJson<unknown>(path.join(getNovelDir(novelId), 'concept-introductions.json'));
  return data ? ConceptIntroductionIndexSchema.parse(data) : null;
}

export async function saveChapterMemoryIndex(
  novelId: string,
  index: ChapterMemoryIndex
): Promise<void> {
  await ensureNarrativeDirs(novelId);
  const parsed = ChapterMemoryIndexSchema.parse(index);
  await writeJsonAtomic(path.join(getNovelDir(novelId), 'chapter-memory.json'), parsed);
}

export async function loadChapterMemoryIndex(novelId: string): Promise<ChapterMemoryIndex | null> {
  const data = await readJson<unknown>(path.join(getNovelDir(novelId), 'chapter-memory.json'));
  return data ? ChapterMemoryIndexSchema.parse(data) : null;
}

export async function saveCollisions(novelId: string, file: CollisionsFile): Promise<void> {
  await ensureNarrativeDirs(novelId);
  const parsed = CollisionsFileSchema.parse(file);
  await writeJsonAtomic(path.join(getNovelDir(novelId), 'collisions.json'), parsed);
}

export async function loadCollisions(novelId: string): Promise<CollisionsFile | null> {
  const data = await readJson<unknown>(path.join(getNovelDir(novelId), 'collisions.json'));
  return data ? CollisionsFileSchema.parse(data) : null;
}

export function episodeFilePath(novelId: string, episodeNumber: number): string {
  const padded = String(episodeNumber).padStart(4, '0');
  return path.join(getNovelDir(novelId), 'episodes', `${padded}.json`);
}

export async function saveEpisode(novelId: string, episode: EpisodePlan): Promise<void> {
  await ensureNarrativeDirs(novelId);
  const parsed = EpisodePlanSchema.parse(episode);
  await writeJsonAtomic(episodeFilePath(novelId, episode.episodeNumber), parsed);
}

export async function loadEpisode(novelId: string, episodeNumber: number): Promise<EpisodePlan | null> {
  const data = await readJson<unknown>(episodeFilePath(novelId, episodeNumber));
  return data ? EpisodePlanSchema.parse(data) : null;
}

export async function listEpisodeNumbers(novelId: string): Promise<number[]> {
  const dir = path.join(getNovelDir(novelId), 'episodes');
  try {
    const files = await fs.readdir(dir);
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => parseInt(f.replace('.json', ''), 10))
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

export async function listEpisodes(novelId: string): Promise<EpisodePlan[]> {
  const nums = await listEpisodeNumbers(novelId);
  const episodes: EpisodePlan[] = [];
  for (const n of nums) {
    const ep = await loadEpisode(novelId, n);
    if (ep) episodes.push(ep);
  }
  return episodes;
}

export function assignWorldEventIds(
  events: Omit<WorldEvent, 'id' | 'status' | 'usedInChapter'>[]
): WorldEvent[] {
  return events.map((e) => ({
    ...e,
    id: randomUUID(),
    status: 'planned' as const,
  }));
}

export function assignHeroEventIds(
  events: Omit<HeroEvent, 'id' | 'status' | 'usedInChapter'>[]
): HeroEvent[] {
  return events.map((e) => ({
    ...e,
    id: randomUUID(),
    status: 'planned' as const,
  }));
}

export function assignSupportEventIds(
  events: Array<
    Omit<SupportEvent, 'id' | 'status' | 'usedInChapter' | 'locked'> & { locked?: boolean }
  >
): SupportEvent[] {
  return events.map((e) => ({
    ...e,
    id: randomUUID(),
    status: 'planned' as const,
    protagonistAwareness: e.protagonistAwareness ?? 'none',
    worldEventIds: e.worldEventIds ?? [],
    locked: e.locked ?? false,
    sortOrder: e.sortOrder ?? 0,
  }));
}

export function assignCollisionIds(
  collisions: Omit<Collision, 'id' | 'status' | 'episodeNumber'>[]
): Collision[] {
  return collisions.map((c) => ({
    ...c,
    id: randomUUID(),
    status: 'candidate' as const,
  }));
}

export async function getNextEpisodeNumber(novelId: string): Promise<number> {
  const nums = await listEpisodeNumbers(novelId);
  return nums.length > 0 ? Math.max(...nums) + 1 : 1;
}

export async function hasUniverse(novelId: string): Promise<boolean> {
  const bible = await loadWorldBible(novelId);
  const world = await loadWorldTimeline(novelId);
  const hero = await loadHeroTimeline(novelId);
  return Boolean(bible && world && hero);
}

export async function saveUniverseSimState(
  novelId: string,
  state: UniverseSimState
): Promise<void> {
  await ensureNarrativeDirs(novelId);
  const parsed = UniverseSimStateSchema.parse(state);
  await writeJsonAtomic(path.join(getNovelDir(novelId), 'universe-sim.json'), parsed);
}

export async function loadUniverseSimState(novelId: string): Promise<UniverseSimState | null> {
  const data = await readJson<unknown>(path.join(getNovelDir(novelId), 'universe-sim.json'));
  return data ? UniverseSimStateSchema.parse(data) : null;
}

export async function saveNarrativeCycleLog(
  novelId: string,
  log: NarrativeCycleLog
): Promise<void> {
  await ensureNarrativeDirs(novelId);
  const parsed = NarrativeCycleLogSchema.parse(log);
  await writeJsonAtomic(path.join(getNovelDir(novelId), 'narrative-cycle.json'), parsed);
}

export async function loadNarrativeCycleLog(novelId: string): Promise<NarrativeCycleLog | null> {
  const data = await readJson<unknown>(path.join(getNovelDir(novelId), 'narrative-cycle.json'));
  return data ? NarrativeCycleLogSchema.parse(data) : null;
}

export async function saveCycleRun(novelId: string, run: CycleRun): Promise<void> {
  await ensureNarrativeDirs(novelId);
  const parsed = CycleRunSchema.parse(run);
  await writeJsonAtomic(path.join(getNovelDir(novelId), 'cycle-run.json'), parsed);
}

export async function loadCycleRun(novelId: string): Promise<CycleRun | null> {
  const data = await readJson<unknown>(path.join(getNovelDir(novelId), 'cycle-run.json'));
  return data ? CycleRunSchema.parse(data) : null;
}

export async function clearCycleRun(novelId: string): Promise<void> {
  const filePath = path.join(getNovelDir(novelId), 'cycle-run.json');
  try {
    const { unlink } = await import('node:fs/promises');
    await unlink(filePath);
  } catch {
    // 文件不存在则忽略
  }
}

export const MAX_CYCLE_RUN_HISTORY = 50;

function cycleRunHistoryPath(novelId: string): string {
  return path.join(getNovelDir(novelId), 'cycle-run-history.json');
}

export async function loadCycleRunHistory(novelId: string): Promise<CycleRunHistory> {
  await ensureNarrativeDirs(novelId);
  const data = await readJson<unknown>(cycleRunHistoryPath(novelId));
  if (!data) {
    return { runs: [], updatedAt: new Date().toISOString() };
  }
  return CycleRunHistorySchema.parse(data);
}

export async function appendCycleRunHistory(novelId: string, run: CycleRun): Promise<void> {
  await ensureNarrativeDirs(novelId);
  const history = await loadCycleRunHistory(novelId);
  const parsed = CycleRunSchema.parse(run);
  const runs = [parsed, ...history.runs.filter((r) => r.id !== parsed.id)].slice(
    0,
    MAX_CYCLE_RUN_HISTORY
  );
  await writeJsonAtomic(cycleRunHistoryPath(novelId), {
    runs,
    updatedAt: new Date().toISOString(),
  });
}

/** 将 completed / failed 的 cycle-run 写入历史并清除当前文件 */
export async function archiveTerminalCycleRun(
  novelId: string,
  run?: CycleRun | null
): Promise<CycleRun | null> {
  const current = run ?? (await loadCycleRun(novelId));
  if (
    !current ||
    (current.status !== 'completed' &&
      current.status !== 'failed' &&
      current.status !== 'cancelled')
  ) {
    return null;
  }
  await appendCycleRunHistory(novelId, current);
  await clearCycleRun(novelId);
  return current;
}
