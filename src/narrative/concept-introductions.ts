/**
 * 前 20 章概念阐释跟踪
 *
 * 目的：读者首次遇到世界观术语时，正文必须自然托住概念，而不是只抛名词。
 */
import * as narrativeStore from './store.js';
import type {
  CharacterAssetsFile,
  CollisionsFile,
  ConceptIntroductionEntry,
  ConceptIntroductionIndex,
  HeroTimeline,
  PowerSystemFile,
  StoryArcsFile,
  SupportTimeline,
  WorldBible,
  WorldTimeline,
} from './types.js';

export const CONCEPT_INTRO_CHAPTER_LIMIT = 20;

type ConceptSource = ConceptIntroductionEntry['source'];

interface ConceptSeed {
  term: string;
  description: string;
  source: ConceptSource;
}

const TERM_PATTERN =
  /[\u4e00-\u9fa5A-Za-z0-9·]{2,16}(?:境|序|印|贷|契|牒|痕|潮|灵潮|灵脉|配额|税|司|廷|宗|盟|商盟|港|坊|号|栈|值庐|工棚|兑栈|账|债|票据|名额|序位)/g;

function normalizeTerm(term: string): string {
  return term
    .replace(/[“”"'`《》（）()，,。；;：:、\s]/g, '')
    .trim();
}

function shortDescription(text: string, term: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  const idx = compact.indexOf(term);
  if (idx < 0) return compact.slice(0, 140);
  return compact.slice(Math.max(0, idx - 45), Math.min(compact.length, idx + 95));
}

function addSeed(seeds: ConceptSeed[], term: string | undefined, description: string, source: ConceptSource) {
  const normalized = normalizeTerm(term ?? '');
  if (normalized.length < 2 || normalized.length > 12) return;
  if (/[A-Za-z0-9]/.test(normalized)) return;
  if (/[是借被将已会若让为从到按因与把]/.test(normalized)) return;
  if (/[甲乙丙丁一二三四五六七八九十百千]+号$/.test(normalized)) return;
  if (/(观察|搬运|踩点|联络|抓走|挡路|亮底牌|追查|确认|筹备|接洽|正面交|进程|准备|暴露|推行)/.test(normalized)) {
    return;
  }
  seeds.push({
    term: normalized,
    description: shortDescription(description || normalized, normalized),
    source,
  });
}

function extractTerms(text: string, source: ConceptSource): ConceptSeed[] {
  const seeds: ConceptSeed[] = [];
  for (const match of text.matchAll(TERM_PATTERN)) {
    addSeed(seeds, match[0], text, source);
  }
  return seeds;
}

function deriveConceptSeeds(input: {
  bible: WorldBible | null;
  world: WorldTimeline | null;
  hero: HeroTimeline | null;
  support: SupportTimeline | null;
  powerSystem: PowerSystemFile | null;
  characterAssets: CharacterAssetsFile | null;
  storyArcs: StoryArcsFile | null;
  collisionsFile: CollisionsFile | null;
}): ConceptSeed[] {
  const seeds: ConceptSeed[] = [];
  const { bible, world, hero, support, powerSystem, characterAssets, storyArcs, collisionsFile } = input;

  if (bible) {
    addSeed(seeds, bible.powerSystem, bible.powerSystem ?? '', 'world_bible');
    for (const item of [...bible.geography, ...bible.coreConflicts]) {
      seeds.push(...extractTerms(item, 'world_bible'));
    }
    for (const faction of bible.factions) {
      addSeed(seeds, faction.name, `${faction.name}：${faction.type}；目标=${faction.goals.join('；')}`, 'world_bible');
      for (const resource of faction.resources) addSeed(seeds, resource, `${faction.name}掌握资源：${resource}`, 'world_bible');
    }
  }

  if (powerSystem) {
    addSeed(seeds, powerSystem.systemName, powerSystem.coreEnergy, 'power_system');
    seeds.push(...extractTerms(powerSystem.coreEnergy, 'power_system'));
    for (const rule of [...powerSystem.progressionRules, ...powerSystem.bottlenecks]) {
      seeds.push(...extractTerms(rule, 'power_system'));
    }
    for (const rank of powerSystem.ranks) {
      addSeed(seeds, rank.name, `${rank.name}：${rank.description}；突破：${rank.breakthroughRequirement}`, 'power_system');
      // 常见误称/小阶称呼也纳入检测，便于早期发现并解释或修正。
      if (rank.name.endsWith('境')) {
        addSeed(seeds, `${rank.name.slice(0, -1)}序`, `${rank.name}的误称或民间称呼；正式境界名为${rank.name}`, 'power_system');
      }
      for (const ability of rank.signatureAbilities) addSeed(seeds, ability, `${rank.name}能力：${ability}`, 'power_system');
    }
  }

  if (storyArcs) {
    for (const arc of storyArcs.arcs) {
      addSeed(seeds, arc.name, arc.phaseGoal, 'story_arcs');
      seeds.push(...extractTerms(`${arc.phaseGoal} ${arc.antagonist} ${arc.payoffBeats.join('；')}`, 'story_arcs'));
    }
  }

  if (characterAssets) {
    for (const character of characterAssets.characters) {
      for (const item of character.inventory) addSeed(seeds, item.name, item.description, 'character_assets');
      for (const ability of character.abilities) addSeed(seeds, ability, `${character.name}能力：${ability}`, 'character_assets');
    }
  }

  for (const event of world?.events ?? []) {
    seeds.push(...extractTerms(`${event.title}。${event.description}。${event.consequences.join('；')}`, 'world_timeline'));
  }
  for (const event of hero?.events ?? []) {
    seeds.push(...extractTerms(`${event.title}。${event.intent}。${event.constraints.join('；')}。${event.knownWorldFacts.join('；')}`, 'hero_timeline'));
  }
  for (const event of support?.events ?? []) {
    seeds.push(...extractTerms(`${event.title}。${event.intent}`, 'support_timeline'));
  }
  for (const collision of collisionsFile?.collisions ?? []) {
    seeds.push(
      ...extractTerms(
        `${collision.title}。${collision.surfaceConflict}。${collision.rationale}。${collision.risks.join('；')}`,
        'collisions'
      )
    );
  }

  return seeds;
}

export async function syncConceptIntroductions(novelId: string): Promise<ConceptIntroductionIndex> {
  const [existing, bible, world, hero, support, powerSystem, characterAssets, storyArcs, collisionsFile] =
    await Promise.all([
      narrativeStore.loadConceptIntroductions(novelId),
      narrativeStore.loadWorldBible(novelId),
      narrativeStore.loadWorldTimeline(novelId),
      narrativeStore.loadHeroTimeline(novelId),
      narrativeStore.loadSupportTimeline(novelId),
      narrativeStore.loadPowerSystem(novelId),
      narrativeStore.loadCharacterAssets(novelId),
      narrativeStore.loadStoryArcs(novelId),
      narrativeStore.loadCollisions(novelId),
    ]);

  const now = new Date().toISOString();
  const previousByTerm = new Map<string, ConceptIntroductionEntry>();
  for (const concept of existing?.concepts ?? []) {
    previousByTerm.set(concept.term, concept);
  }
  const byTerm = new Map<string, ConceptIntroductionEntry>();

  for (const seed of deriveConceptSeeds({
    bible,
    world,
    hero,
    support,
    powerSystem,
    characterAssets,
    storyArcs,
    collisionsFile,
  })) {
    const prev = previousByTerm.get(seed.term);
    byTerm.set(seed.term, {
      term: seed.term,
      description: seed.description || prev?.description || seed.term,
      source: prev?.source ?? seed.source,
      explained: prev?.explained ?? false,
      introducedInChapter: prev?.introducedInChapter,
      firstSeenInChapter: prev?.firstSeenInChapter,
      updatedAt: now,
    });
  }

  const index = {
    concepts: [...byTerm.values()].sort((a, b) => a.term.localeCompare(b.term, 'zh-Hans-CN')),
    updatedAt: now,
  };
  await narrativeStore.saveConceptIntroductions(novelId, index);
  return index;
}

export function findUnexplainedConceptsInContent(
  index: ConceptIntroductionIndex,
  content: string,
  chapterNumber: number,
  limit = 8
): ConceptIntroductionEntry[] {
  if (chapterNumber > CONCEPT_INTRO_CHAPTER_LIMIT) return [];
  return index.concepts
    .filter((concept) => !concept.explained && content.includes(concept.term))
    .sort((a, b) => content.indexOf(a.term) - content.indexOf(b.term))
    .slice(0, limit);
}

export async function markConceptsExplained(
  novelId: string,
  concepts: ConceptIntroductionEntry[],
  chapterNumber: number
): Promise<void> {
  if (concepts.length === 0) return;
  const index = (await narrativeStore.loadConceptIntroductions(novelId)) ?? {
    concepts: [],
    updatedAt: new Date().toISOString(),
  };
  const now = new Date().toISOString();
  const terms = new Set(concepts.map((c) => c.term));
  const next = {
    concepts: index.concepts.map((concept) =>
      terms.has(concept.term)
        ? {
            ...concept,
            explained: true,
            introducedInChapter: concept.introducedInChapter ?? chapterNumber,
            firstSeenInChapter: concept.firstSeenInChapter ?? chapterNumber,
            updatedAt: now,
          }
        : concept
    ),
    updatedAt: now,
  };
  await narrativeStore.saveConceptIntroductions(novelId, next);
}
