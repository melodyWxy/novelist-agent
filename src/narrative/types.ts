/**
 * 双线叙事引擎领域模型
 *
 * 世界线、主人公线、碰撞点、章节事件包 — 章节正文不再直接消费章节大纲
 */
import { z } from 'zod';

/** 势力/组织 */
export const FactionSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().describe('国家/宗门/商会/军队/秘密组织等'),
  goals: z.array(z.string()).default([]),
  resources: z.array(z.string()).default([]),
  relationships: z.record(z.string()).default({}).describe('与其他势力关系'),
});

export type Faction = z.infer<typeof FactionSchema>;

/** 配角档案 — 拥有独立隐线行动 */
export const SupportCharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string().describe('与主角关系/职能，如师兄、药商、暗部接头人'),
  goals: z.array(z.string()).default([]),
  factionId: z.string().optional().describe('所属势力 id'),
  traits: z.array(z.string()).default([]),
});

export type SupportCharacter = z.infer<typeof SupportCharacterSchema>;

/** 长篇战力体系：保证境界、能力、瓶颈在百万字长线中可追踪 */
export const PowerRankSchema = z.object({
  id: z.string(),
  name: z.string(),
  order: z.number().int().nonnegative(),
  description: z.string(),
  breakthroughRequirement: z.string(),
  signatureAbilities: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  narrativeUse: z.string().describe('这一阶适合承载的剧情爽点/瓶颈/代价'),
});

export type PowerRank = z.infer<typeof PowerRankSchema>;

export const PowerSystemFileSchema = z.object({
  systemName: z.string(),
  coreEnergy: z.string(),
  rankUnit: z.string().default('阶'),
  ranks: z.array(PowerRankSchema).min(3),
  progressionRules: z.array(z.string()).default([]),
  bottlenecks: z.array(z.string()).default([]),
  generatedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type PowerSystemFile = z.infer<typeof PowerSystemFileSchema>;

function fallbackIsoDate(val: unknown): string {
  const raw = coerceLlmString(val);
  return raw && !Number.isNaN(Date.parse(raw)) ? raw : new Date().toISOString();
}

function fallbackItemId(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `item_${hash.toString(36)}`;
}

function coerceCharacterItem(val: unknown): unknown {
  if (typeof val === 'string') {
    const name = val.trim();
    return {
      id: fallbackItemId(name || 'unknown'),
      name: name || '未命名物品',
      type: '物品',
      description: name || '状态更新中提及的物品',
      status: '持有',
    };
  }
  if (!val || typeof val !== 'object') return val;
  const obj = val as Record<string, unknown>;
  const name = coerceLlmString(obj.name ?? obj.itemName ?? obj.title ?? obj.description ?? '未命名物品');
  return {
    ...obj,
    id: coerceLlmString(obj.id) || fallbackItemId(name),
    name,
    type: coerceLlmString(obj.type ?? obj.category) || '物品',
    description: coerceLlmString(obj.description ?? obj.note ?? obj.status ?? name) || name,
    status: coerceLlmString(obj.status) || '持有',
  };
}

export const CharacterItemSchema = z.preprocess(coerceCharacterItem, z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().describe('武器/法宝/丹药/线索/材料/契约等'),
  description: z.string(),
  status: z.string().default('持有'),
  obtainedInChapter: z.number().int().positive().optional(),
}));

export const CharacterAssetSchema = z.object({
  characterId: z.string(),
  name: z.string(),
  role: z.string(),
  currentRankId: z.string().optional(),
  attributes: z.record(z.string()).default({}),
  abilities: z.array(z.string()).default([]),
  inventory: z.array(CharacterItemSchema).default([]),
  injuries: z.preprocess(coerceLlmStringArrayFlexible, z.array(z.string()).default([])),
  notes: z.preprocess(coerceLlmStringArrayFlexible, z.array(z.string()).default([])),
  updatedAt: z.preprocess(fallbackIsoDate, z.string().datetime()),
});

export type CharacterAsset = z.infer<typeof CharacterAssetSchema>;

export const CharacterAssetsFileSchema = z.object({
  characters: z.array(CharacterAssetSchema),
  updatedAt: z.preprocess(fallbackIsoDate, z.string().datetime()),
});

export type CharacterAssetsFile = z.infer<typeof CharacterAssetsFileSchema>;

/** 长篇分卷/阶段大纲 — 约束百万字级别的阶段目标与战力上限 */
export const StoryArcSchema = z.object({
  id: z.string(),
  volumeNumber: z.number().int().positive(),
  name: z.string(),
  chapterStart: z.number().int().positive(),
  chapterEnd: z.number().int().positive(),
  phaseGoal: z.string(),
  antagonist: z.string(),
  powerCeilingRankId: z.string().optional(),
  payoffBeats: z.array(z.string()).default([]),
  status: z.enum(['planned', 'active', 'completed']).default('planned'),
});

export type StoryArc = z.infer<typeof StoryArcSchema>;

export const StoryArcsFileSchema = z.object({
  currentArcId: z.string().optional(),
  arcs: z.array(StoryArcSchema).min(1),
  updatedAt: z.string().datetime(),
});

export type StoryArcsFile = z.infer<typeof StoryArcsFileSchema>;

export const StoryArcsOutputSchema = StoryArcsFileSchema.omit({ updatedAt: true }).extend({
  currentArcId: z.string().optional(),
});

/** 前 20 章世界观/术语阐释状态 */
export const ConceptIntroductionEntrySchema = z.object({
  term: z.string().min(1),
  description: z.string().default(''),
  source: z.enum([
    'world_bible',
    'world_timeline',
    'hero_timeline',
    'support_timeline',
    'power_system',
    'character_assets',
    'story_arcs',
    'collisions',
  ]),
  explained: z.boolean().default(false),
  introducedInChapter: z.number().int().positive().optional(),
  firstSeenInChapter: z.number().int().positive().optional(),
  updatedAt: z.string().datetime(),
});

export type ConceptIntroductionEntry = z.infer<typeof ConceptIntroductionEntrySchema>;

export const ConceptIntroductionIndexSchema = z.object({
  concepts: z.array(ConceptIntroductionEntrySchema),
  updatedAt: z.string().datetime(),
});

export type ConceptIntroductionIndex = z.infer<typeof ConceptIntroductionIndexSchema>;

/** 章节记忆索引 — 压缩长篇上下文，写章时只取近期相关摘要 */
export const ChapterMemoryEntrySchema = z.object({
  chapterNumber: z.number().int().positive(),
  title: z.string(),
  summary: z.string(),
  day: z.number().int().nonnegative().optional(),
  keyEvents: z.array(z.string()).default([]),
  powerChanges: z.array(z.string()).default([]),
  itemChanges: z.array(z.string()).default([]),
  foreshadowingTouched: z.array(z.string()).default([]),
  wordCount: z.number().int().nonnegative().default(0),
  reviewScore: z.number().min(0).max(100).optional(),
  reviewPassed: z.boolean().optional(),
  writtenAt: z.string().datetime(),
});

export type ChapterMemoryEntry = z.infer<typeof ChapterMemoryEntrySchema>;

export const ChapterMemoryIndexSchema = z.object({
  entries: z.array(ChapterMemoryEntrySchema),
  updatedAt: z.string().datetime(),
});

export type ChapterMemoryIndex = z.infer<typeof ChapterMemoryIndexSchema>;

/** 世界设定 Bible */
export const WorldBibleSchema = z.object({
  era: z.string().describe('时代背景'),
  geography: z.array(z.string()).default([]),
  powerSystem: z.string().optional().describe('修炼/科技/魔法体系'),
  coreConflicts: z.array(z.string()).default([]).describe('世界层面核心矛盾'),
  factions: z.array(FactionSchema).default([]),
  supportCharacters: z.array(SupportCharacterSchema).default([]),
  generatedAt: z.string().datetime(),
});

export type WorldBible = z.infer<typeof WorldBibleSchema>;

/** 世界线事件 — 按故事内时间推进，不绑定章节号 */
export const WorldEventSchema = z.object({
  id: z.string(),
  day: z.number().int().nonnegative().describe('故事内第几天'),
  title: z.string(),
  description: z.string(),
  location: z.string(),
  factionIds: z.array(z.string()).default([]),
  visibility: z.enum(['public', 'rumor', 'secret']).default('secret'),
  consequences: z.array(z.string()).default([]),
  status: z.enum(['planned', 'active', 'resolved']).default('planned'),
  usedInChapter: z.number().int().positive().optional(),
  /** 锁定后 AI 状态更新不得改写此事件 */
  locked: z.boolean().default(false),
  /** 同日内排序，越小越靠前 */
  sortOrder: z.number().int().nonnegative().default(0),
});

export type WorldEvent = z.infer<typeof WorldEventSchema>;

export const WorldTimelineSchema = z.object({
  currentDay: z.number().int().nonnegative().default(0),
  events: z.array(WorldEventSchema),
  updatedAt: z.string().datetime(),
});

export type WorldTimeline = z.infer<typeof WorldTimelineSchema>;

/** 主人公行动节点 */
export const HeroEventSchema = z.object({
  id: z.string(),
  day: z.number().int().nonnegative(),
  title: z.string(),
  intent: z.string().describe('主角想做什么'),
  location: z.string(),
  constraints: z.array(z.string()).default([]),
  emotionalState: z.string().optional(),
  knownWorldFacts: z.array(z.string()).default([]).describe('主角此时知道的世界信息'),
  status: z.enum(['planned', 'active', 'resolved']).default('planned'),
  usedInChapter: z.number().int().positive().optional(),
  locked: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().default(0),
});

export type HeroEvent = z.infer<typeof HeroEventSchema>;

export const HeroTimelineSchema = z.object({
  protagonistGoal: z.string().describe('当前核心目标'),
  crisis: z.string().optional().describe('当前危机/压力'),
  events: z.array(HeroEventSchema),
  updatedAt: z.string().datetime(),
});

export type HeroTimeline = z.infer<typeof HeroTimelineSchema>;

/** 配角隐线事件 — 主角通常感知不到 */
export const SupportEventSchema = z.object({
  id: z.string(),
  characterId: z.string(),
  day: z.number().int().nonnegative(),
  title: z.string(),
  intent: z.string().describe('配角此刻在做什么、为了什么'),
  location: z.string(),
  /** 主角对该事件的感知程度 */
  protagonistAwareness: z.enum(['none', 'rumor', 'partial']).default('none'),
  /** 因果关联的世界线事件 id */
  worldEventIds: z.array(z.string()).default([]),
  status: z.enum(['planned', 'active', 'resolved']).default('planned'),
  usedInChapter: z.number().int().positive().optional(),
  locked: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().default(0),
});

export type SupportEvent = z.infer<typeof SupportEventSchema>;

export const SupportTimelineSchema = z.object({
  events: z.array(SupportEventSchema),
  updatedAt: z.string().datetime(),
});

export type SupportTimeline = z.infer<typeof SupportTimelineSchema>;

/** 碰撞类型 */
export const COLLISION_TYPES = [
  'time',
  'location',
  'resource',
  'value',
  'information',
  'relationship',
] as const;

export const CollisionTypeSchema = z.enum(COLLISION_TYPES);

export type CollisionType = z.infer<typeof CollisionTypeSchema>;

/** Prompt 中约束 LLM 只能输出六种结构化碰撞类型 */
export const COLLISION_TYPE_PROMPT_HINT = `collisionType 只能是以下六项之一（禁止自造 minor-friction、daily、faction 等标签）：
time=时间/scheduling 冲突，location=地点/空间 冲突，resource=资源/物品 争夺，
value=价值观/立场 冲突，information=信息差/情报 不对称，relationship=人际/关系 摩擦`;

const COLLISION_TYPE_ALIASES: Record<string, CollisionType> = {
  time: 'time',
  timing: 'time',
  schedule: 'time',
  deadline: 'time',
  temporal: 'time',
  location: 'location',
  place: 'location',
  spatial: 'location',
  territory: 'location',
  venue: 'location',
  resource: 'resource',
  resources: 'resource',
  item: 'resource',
  material: 'resource',
  supply: 'resource',
  loot: 'resource',
  treasure: 'resource',
  value: 'value',
  values: 'value',
  moral: 'value',
  ideology: 'value',
  belief: 'value',
  principle: 'value',
  information: 'information',
  info: 'information',
  intel: 'information',
  secret: 'information',
  clue: 'information',
  rumor: 'information',
  knowledge: 'information',
  relationship: 'relationship',
  relationships: 'relationship',
  social: 'relationship',
  interpersonal: 'relationship',
  person: 'relationship',
  people: 'relationship',
  faction: 'relationship',
  factions: 'relationship',
  friction: 'relationship',
  'minor-friction': 'relationship',
  minor_friction: 'relationship',
  minor: 'relationship',
  daily: 'relationship',
  routine: 'relationship',
  conflict: 'relationship',
  personal: 'relationship',
};

/** 将 LLM 自造标签归一到六种碰撞类型 */
export function coerceCollisionType(val: unknown, fallback: CollisionType = 'relationship'): CollisionType {
  if (typeof val !== 'string') return fallback;
  const key = val.trim().toLowerCase();
  if (!key) return fallback;
  if (COLLISION_TYPE_ALIASES[key]) return COLLISION_TYPE_ALIASES[key];
  if ((COLLISION_TYPES as readonly string[]).includes(key)) return key as CollisionType;
  if (key.includes('time') || key.includes('schedule')) return 'time';
  if (key.includes('location') || key.includes('place') || key.includes('territory')) return 'location';
  if (key.includes('resource') || key.includes('item') || key.includes('material')) return 'resource';
  if (key.includes('value') || key.includes('moral') || key.includes('ideolog')) return 'value';
  if (key.includes('information') || key.includes('secret') || key.includes('intel')) return 'information';
  return fallback;
}

/** LLM 输出用的碰撞类型（容忍自造枚举） */
export const CollisionTypeOutputSchema = z.preprocess(
  (val) => coerceCollisionType(val),
  CollisionTypeSchema
);

const RiskLevelSchema = z.enum(['low', 'medium', 'high']);

const REVEAL_LEVELS = ['none', 'hint', 'partial', 'full'] as const;

const RevealLevelSchema = z.preprocess(
  (val) => {
    if (typeof val !== 'string') return val;
    const aliases: Record<string, (typeof REVEAL_LEVELS)[number]> = {
      rumor: 'hint',
      rumour: 'hint',
      secret: 'none',
      hidden: 'none',
      complete: 'full',
      total: 'full',
      reveal: 'partial',
      surface: 'partial',
      low: 'hint',
      medium: 'partial',
      mid: 'partial',
      moderate: 'partial',
      high: 'full',
      severe: 'full',
    };
    const lower = val.toLowerCase();
    if (aliases[lower]) return aliases[lower];
    if ((REVEAL_LEVELS as readonly string[]).includes(lower)) return lower;
    return 'hint';
  },
  z.enum(REVEAL_LEVELS)
);

const RISK_LEVELS = ['low', 'medium', 'high'] as const;

const RiskLevelOutputSchema = z.preprocess(
  (val) => {
    if (typeof val !== 'string') return val;
    const aliases: Record<string, (typeof RISK_LEVELS)[number]> = {
      mid: 'medium',
      moderate: 'medium',
      severe: 'high',
      critical: 'high',
      minor: 'low',
      lowest: 'low',
    };
    const lower = val.toLowerCase();
    if (aliases[lower]) return aliases[lower];
    if ((RISK_LEVELS as readonly string[]).includes(lower)) return lower;
    return 'medium';
  },
  RiskLevelSchema
);

/** 场景节拍 — 明线 hero / 隐线暗示 shadow-hint */
export const SceneBeatLineSchema = z.enum(['hero', 'shadow-hint']);
export type SceneBeatLine = z.infer<typeof SceneBeatLineSchema>;

export const SceneBeatSchema = z.object({
  line: SceneBeatLineSchema,
  beat: z.string(),
});
export type SceneBeat = z.infer<typeof SceneBeatSchema>;

/** 候选碰撞点 */
export const CollisionSchema = z.object({
  id: z.string(),
  title: z.string(),
  collisionType: CollisionTypeSchema,
  worldEventIds: z.array(z.string()),
  heroEventIds: z.array(z.string()),
  /** 关联的配角隐线事件（可选） */
  supportEventIds: z.array(z.string()).default([]),
  day: z.number().int().nonnegative(),
  location: z.string(),
  rationale: z.string().describe('为什么会碰撞'),
  surfaceConflict: z.string(),
  hiddenCausality: z.string(),
  readerRevealLevel: RevealLevelSchema.default('hint'),
  heroRevealLevel: RevealLevelSchema.default('hint'),
  /** 本章写作时隐线暴露风险 */
  disclosureRisk: RiskLevelSchema.default('medium'),
  /** 明线冲突能否撑起一章 */
  surfaceStrength: RiskLevelSchema.default('medium'),
  /** 碰撞因果是否紧密（非巧合） */
  causalTightness: RiskLevelSchema.default('medium'),
  risks: z.array(z.string()).default([]),
  /** 标记为必须发生的碰撞，重新发现时保留 */
  required: z.boolean().default(false),
  status: z.enum(['candidate', 'accepted', 'rejected', 'used']).default('candidate'),
  episodeNumber: z.number().int().positive().optional(),
});

export type Collision = z.infer<typeof CollisionSchema>;

export const CollisionsFileSchema = z.object({
  collisions: z.array(CollisionSchema),
  updatedAt: z.string().datetime(),
});

export type CollisionsFile = z.infer<typeof CollisionsFileSchema>;

const SceneBeatOutputSchema = z.union([
  SceneBeatSchema,
  z.string().transform((beat) => ({ line: 'hero' as const, beat })),
]);

export const EpisodeSourceSchema = z.enum(['hero', 'collision']);
export type EpisodeSource = z.infer<typeof EpisodeSourceSchema>;

/** 章节事件包 — 写作前的结构化中间层 */
export const EpisodePlanSchema = z.object({
  episodeNumber: z.number().int().positive(),
  /** hero=主人公线驱动；collision=旧版碰撞驱动（兼容历史数据） */
  source: EpisodeSourceSchema.default('collision'),
  collisionId: z.string().optional(),
  heroEventIds: z.array(z.string()).default([]),
  supportEventIds: z.array(z.string()).default([]),
  title: z.string(),
  timeWindow: z.string(),
  day: z.number().int().nonnegative(),
  location: z.string(),
  worldEventsInPlay: z.array(z.string()),
  heroIntent: z.string(),
  collisionType: CollisionTypeSchema,
  surfaceConflict: z.string(),
  hiddenCausality: z.string(),
  sceneBeats: z.preprocess(
    (val) => {
      if (!Array.isArray(val)) return [];
      return val.map((b) => {
        if (typeof b === 'string') return { line: 'hero', beat: b };
        return b;
      });
    },
    z.array(SceneBeatSchema).min(1)
  ),
  /** 可写入正文的隐线暗示句（不得复述 hiddenCausality 原文） */
  shadowHints: z.array(z.string()).default([]),
  readerGains: z.array(z.string()).default([]),
  heroGains: z.array(z.string()).default([]),
  foreshadowing: z.array(z.string()).default([]),
  worldStateChanges: z.array(z.string()).default([]),
  heroStateChanges: z.array(z.string()).default([]),
  status: z.enum(['draft', 'confirmed', 'written']).default('draft'),
  chapterNumber: z.number().int().positive().optional(),
  generatedAt: z.string().datetime(),
  /** 双阶段写作中间稿（供作者审阅） */
  writingDrafts: z
    .object({
      surfaceDraft: z.string().optional(),
      wovenDraft: z.string().optional(),
      finalDraft: z.string().optional(),
      savedAt: z.string().datetime().optional(),
    })
    .optional(),
});

export type EpisodePlan = z.infer<typeof EpisodePlanSchema>;

function coerceLlmString(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    for (const key of ['name', 'title', 'label', 'description', 'summary', 'text', 'value']) {
      if (typeof obj[key] === 'string') return (obj[key] as string).trim();
    }
    return JSON.stringify(val);
  }
  return String(val);
}

function coerceLlmStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.map(coerceLlmString).filter((s) => s.length > 0);
}

/** LLM 常把 injuries/notes 写成对象数组或单个字符串，统一归一为 string[] */
function coerceLlmStringArrayFlexible(val: unknown): string[] {
  if (val == null) return [];
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return [];
    if (trimmed.includes('\n')) {
      return trimmed
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (trimmed.includes('；')) {
      return trimmed
        .split('；')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [trimmed];
  }
  if (Array.isArray(val)) {
    return val.map(coerceLlmString).filter((s) => s.length > 0);
  }
  const single = coerceLlmString(val);
  return single ? [single] : [];
}

function coerceFactionRelationships(val: unknown): Record<string, string> {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(val as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value;
    else if (Array.isArray(value)) out[key] = value.map(coerceLlmString).filter(Boolean).join('、');
    else if (value != null) out[key] = coerceLlmString(value);
  }
  return out;
}

/** LLM 常把角色 relationships 写成对象数组，归一为 Record<角色名, 关系描述> */
export function coerceCharacterRelationships(val: unknown): Record<string, string> {
  if (val == null) return {};
  if (Array.isArray(val)) {
    const out: Record<string, string> = {};
    for (const item of val) {
      if (typeof item === 'string') {
        const [name, ...rest] = item.split(/[:：]/);
        if (name?.trim() && rest.length > 0) out[name.trim()] = rest.join('：').trim();
        continue;
      }
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const name = coerceLlmString(
        obj.name ?? obj.target ?? obj.character ?? obj.with ?? obj.key ?? obj.person
      );
      const rel = coerceLlmString(
        obj.relation ?? obj.relationship ?? obj.status ?? obj.value ?? obj.type ?? obj.label
      );
      if (name && rel) out[name] = rel;
    }
    return out;
  }
  return coerceFactionRelationships(val);
}

const WorldBibleFactionOutputSchema = FactionSchema.extend({
  relationships: z.preprocess(coerceFactionRelationships, z.record(z.string()).default({})),
});

const WorldBibleSupportOutputSchema = SupportCharacterSchema.extend({
  factionId: z.preprocess(
    (val) => {
      if (val == null || val === '') return undefined;
      return coerceLlmString(val);
    },
    z.string().optional()
  ),
});

/** LLM 输出：世界 Bible 生成（容忍模型返回嵌套对象/数组） */
export const WorldBibleOutputSchema = z.object({
  era: z.preprocess(coerceLlmString, z.string().min(1)),
  geography: z.preprocess(coerceLlmStringArray, z.array(z.string()).default([])),
  powerSystem: z.preprocess(
    (val) => {
      const s = coerceLlmString(val);
      return s || undefined;
    },
    z.string().optional()
  ),
  coreConflicts: z.preprocess(coerceLlmStringArray, z.array(z.string()).default([])),
  factions: z.array(WorldBibleFactionOutputSchema).default([]),
  supportCharacters: z.array(WorldBibleSupportOutputSchema).default([]),
});

/** LLM 输出：世界线批量事件 */
export const WorldTimelineOutputSchema = z.object({
  events: z.array(
    WorldEventSchema.omit({ id: true, status: true, usedInChapter: true })
  ),
});

/** LLM 输出：主人公线批量事件 */
export const HeroTimelineOutputSchema = z.object({
  protagonistGoal: z.string(),
  crisis: z.string().optional(),
  events: z.array(
    HeroEventSchema.omit({ id: true, status: true, usedInChapter: true })
  ),
});

/** LLM 输出：配角隐线批量事件 */
export const SupportTimelineOutputSchema = z.object({
  events: z.array(
    SupportEventSchema.omit({ id: true, status: true, usedInChapter: true, locked: true })
  ),
});

const CollisionOutputSchema = CollisionSchema.omit({
  id: true,
  status: true,
  episodeNumber: true,
  collisionType: true,
}).extend({
  collisionType: CollisionTypeOutputSchema,
  disclosureRisk: RiskLevelOutputSchema.default('medium'),
  surfaceStrength: RiskLevelOutputSchema.default('medium'),
  causalTightness: RiskLevelOutputSchema.default('medium'),
});

/** LLM 输出：碰撞候选 */
export const CollisionsOutputSchema = z.object({
  collisions: z.array(CollisionOutputSchema),
});

/** LLM 输出：事件包 */
export const EpisodePlanOutputSchema = z.object({
  title: z.string(),
  timeWindow: z.string(),
  day: z.number().int().nonnegative(),
  location: z.string(),
  worldEventsInPlay: z.array(z.string()),
  heroIntent: z.string(),
  collisionType: CollisionTypeOutputSchema,
  surfaceConflict: z.string(),
  hiddenCausality: z.string(),
  sceneBeats: z.array(SceneBeatOutputSchema).min(7),
  shadowHints: z.array(z.string()).min(1).default([]),
  readerGains: z.array(z.string()).default([]),
  heroGains: z.array(z.string()).default([]),
  foreshadowing: z.array(z.string()).default([]),
  worldStateChanges: z.array(z.string()).default([]),
  heroStateChanges: z.array(z.string()).default([]),
});

/** LLM 输出：战力体系 */
export const PowerSystemOutputSchema = PowerSystemFileSchema.omit({
  generatedAt: true,
  updatedAt: true,
});

const REVIEW_CATEGORIES = [
  'world_causality',
  'hero_knowledge',
  'hidden_line_leak',
  'collision',
  'continuity',
  'pacing',
  'style',
  'power_consistency',
  'other',
] as const;

function coerceReviewIssues(val: unknown): Array<{
  category: (typeof REVIEW_CATEGORIES)[number];
  severity: (typeof RISK_LEVELS)[number];
  description: string;
  suggestion?: string;
}> {
  if (!Array.isArray(val)) return [];
  return val.map((item) => {
    if (typeof item === 'string') {
      return { category: 'other', severity: 'medium', description: item };
    }
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const rawCategory = coerceLlmString(obj.category ?? obj.type ?? 'other').toLowerCase();
      const category = (REVIEW_CATEGORIES as readonly string[]).includes(rawCategory)
        ? (rawCategory as (typeof REVIEW_CATEGORIES)[number])
        : 'other';
      const rawSeverity = coerceLlmString(obj.severity ?? obj.level ?? 'medium').toLowerCase();
      const severity = (RISK_LEVELS as readonly string[]).includes(rawSeverity)
        ? (rawSeverity as (typeof RISK_LEVELS)[number])
        : 'medium';
      const description = coerceLlmString(
        obj.description ?? obj.message ?? obj.issue ?? obj.text ?? item
      );
      const suggestion = obj.suggestion ? coerceLlmString(obj.suggestion) : undefined;
      return { category, severity, description, suggestion };
    }
    return { category: 'other', severity: 'medium', description: coerceLlmString(item) };
  });
}

/** 双线审稿结果 */
export const DualLineReviewSchema = z.object({
  chapterNumber: z.number().int().positive(),
  passed: z.boolean(),
  score: z.number().min(0).max(100).optional(),
  worldCausalityOk: z.boolean().default(true),
  heroKnowledgeOk: z.boolean().default(true),
  collisionNatural: z.boolean().default(true),
  stateChanged: z.boolean().default(true),
  powerConsistencyOk: z.boolean().default(true),
  readabilityOk: z.boolean().default(true),
  styleToneOk: z.boolean().default(true),
  hiddenLineLeak: z.boolean().default(false),
  leakedTerms: z.preprocess(coerceLlmStringArray, z.array(z.string()).default([])),
  issues: z.preprocess(coerceReviewIssues, z.array(
    z.object({
      category: z.enum(REVIEW_CATEGORIES),
      severity: RiskLevelSchema,
      description: z.string(),
      suggestion: z.string().optional(),
    })
  ).default([])),
  summary: z.preprocess(coerceLlmString, z.string()),
  reviewedAt: z.preprocess(
    (val) => {
      if (typeof val !== 'string' || !val.trim()) return new Date().toISOString();
      const time = Date.parse(val);
      return Number.isNaN(time) ? new Date().toISOString() : new Date(time).toISOString();
    },
    z.string().datetime()
  ),
});

export type DualLineReview = z.infer<typeof DualLineReviewSchema>;

function coerceWorldEventNew(val: unknown): unknown {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return val;
  const obj = val as Record<string, unknown>;
  const description = coerceLlmString(obj.description ?? obj.summary ?? obj.text ?? '');
  return {
    ...obj,
    day: typeof obj.day === 'number' ? obj.day : Number(obj.day) || 0,
    title: coerceLlmString(obj.title ?? obj.name ?? description).slice(0, 120) || '新事件',
    description: description || coerceLlmString(obj.title ?? '新事件'),
    location: coerceLlmString(obj.location ?? obj.place ?? '未知'),
    factionIds: Array.isArray(obj.factionIds)
      ? obj.factionIds.map(coerceLlmString).filter(Boolean)
      : [],
    visibility: obj.visibility ?? 'secret',
    consequences: Array.isArray(obj.consequences)
      ? obj.consequences.map(coerceLlmString).filter(Boolean)
      : [],
  };
}

function coerceHeroEventNew(val: unknown): unknown {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return val;
  const obj = val as Record<string, unknown>;
  const intent = coerceLlmString(obj.intent ?? obj.description ?? obj.goal ?? '');
  return {
    ...obj,
    day: typeof obj.day === 'number' ? obj.day : Number(obj.day) || 0,
    title: coerceLlmString(obj.title ?? obj.name ?? intent).slice(0, 120) || '新行动',
    intent: intent || '推进主线',
    location: coerceLlmString(obj.location ?? obj.place ?? '未知'),
    constraints: Array.isArray(obj.constraints)
      ? obj.constraints.map(coerceLlmString).filter(Boolean)
      : [],
    knownWorldFacts: Array.isArray(obj.knownWorldFacts)
      ? obj.knownWorldFacts.map(coerceLlmString).filter(Boolean)
      : [],
    emotionalState: obj.emotionalState ? coerceLlmString(obj.emotionalState) : undefined,
  };
}

function coerceEventUpdates(val: unknown) {
  if (!Array.isArray(val)) return [];
  return val.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const obj = item as Record<string, unknown>;
    const used =
      obj.usedInChapter == null
        ? undefined
        : typeof obj.usedInChapter === 'number'
          ? obj.usedInChapter
          : Number(obj.usedInChapter) || undefined;
    return {
      eventId: coerceLlmString(obj.eventId ?? obj.id),
      status: obj.status,
      usedInChapter: used,
    };
  });
}

function coerceForeshadowingEntries(val: unknown, chapterFallback = 1) {
  if (!Array.isArray(val)) return [];
  return val.map((item, index) => {
    if (typeof item === 'string') {
      return {
        id: `fs_${index + 1}`,
        description: item,
        introducedInChapter: chapterFallback,
        resolved: false,
      };
    }
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      return {
        id: coerceLlmString(obj.id ?? `fs_${index + 1}`),
        description: coerceLlmString(obj.description ?? obj.text ?? obj.hint ?? item),
        introducedInChapter:
          typeof obj.introducedInChapter === 'number'
            ? obj.introducedInChapter
            : chapterFallback,
        resolved: Boolean(obj.resolved),
      };
    }
    return {
      id: `fs_${index + 1}`,
      description: coerceLlmString(item),
      introducedInChapter: chapterFallback,
      resolved: false,
    };
  });
}

/** 双线状态更新输出 */
export const DualLineStateUpdateSchema = z.object({
  worldTimeline: z.object({
    currentDay: z.number().int().nonnegative(),
    eventUpdates: z.preprocess(
      coerceEventUpdates,
      z.array(
        z.object({
          eventId: z.string(),
          status: z.enum(['planned', 'active', 'resolved']).optional(),
          usedInChapter: z.number().int().positive().optional(),
        })
      ).default([])
    ),
    newEvents: z.preprocess(
      (val) => (Array.isArray(val) ? val.map(coerceWorldEventNew) : []),
      z.array(WorldEventSchema.omit({ id: true, status: true, usedInChapter: true })).default([])
    ),
  }),
  heroTimeline: z.object({
    protagonistGoal: z.string().optional(),
    crisis: z.string().optional(),
    eventUpdates: z.preprocess(
      coerceEventUpdates,
      z.array(
        z.object({
          eventId: z.string(),
          status: z.enum(['planned', 'active', 'resolved']).optional(),
          usedInChapter: z.number().int().positive().optional(),
        })
      ).default([])
    ),
    newEvents: z.preprocess(
      (val) => (Array.isArray(val) ? val.map(coerceHeroEventNew) : []),
      z.array(HeroEventSchema.omit({ id: true, status: true, usedInChapter: true })).default([])
    ),
  }),
  storyState: z.object({
    timeline: z.preprocess(coerceLlmString, z.string()),
    lastChapterSummary: z.preprocess(coerceLlmString, z.string()),
    characters: z.array(
      z.object({
        name: z.preprocess(coerceLlmString, z.string()),
        role: z.string().optional(),
        traits: z.preprocess(coerceLlmStringArray, z.array(z.string()).default([])),
        currentStatus: z.preprocess(coerceLlmString, z.string()),
        relationships: z.preprocess(
          coerceCharacterRelationships,
          z.record(z.string()).default({})
        ),
      })
    ),
    foreshadowing: z.preprocess(
      (val) => coerceForeshadowingEntries(val, 1),
      z.array(
        z.object({
          id: z.string(),
          description: z.string(),
          introducedInChapter: z.number(),
          resolved: z.boolean().default(false),
        })
      ).default([])
    ),
    openThreads: z.preprocess(coerceLlmStringArray, z.array(z.string()).default([])),
  }),
  characterAssets: z
    .object({
      characters: z
        .array(
          CharacterAssetSchema.extend({
            updatedAt: z.string().datetime().optional().default(new Date().toISOString()),
          })
        )
        .default([]),
    })
    .default({ characters: [] }),
});

export type DualLineStateUpdate = z.infer<typeof DualLineStateUpdateSchema>;

/** 写章选项 */
export interface WriteEpisodeOptions {
  skipReview?: boolean;
  skipStateUpdate?: boolean;
  targetWords?: number;
  /** 双阶段写作：先明线草稿再织入隐线（默认 true） */
  twoStage?: boolean;
  /** 隐线泄露后自动局部重写次数（默认 0；可读性优先，不再默认追求完全藏隐线） */
  maxLeakRetries?: number;
  /** 审稿低分后的整章自动修订次数（默认 1） */
  maxReviewRewriteRetries?: number;
  /** 覆盖指定章号重写（不递增 lastChapterNumber，用于按新 prompt 重生成） */
  rewriteChapterNumber?: number;
}

/** 写章产出元信息 */
export interface WriteEpisodeMeta {
  twoStage: boolean;
  leakRetries: number;
  reviewRewriteRetries: number;
  hadLeak: boolean;
  surfaceDraftChars?: number;
}

/** 时间轴编辑操作 */
export type TimelinePatch =
  | {
      op: 'updateWorldEvent';
      eventId: string;
      patch: Partial<
        Pick<
          WorldEvent,
          'day' | 'title' | 'description' | 'location' | 'visibility' | 'locked' | 'sortOrder'
        >
      >;
    }
  | {
      op: 'moveWorldEvent';
      eventId: string;
      day: number;
      /** 插入到该事件之前；省略则追加到当日末尾 */
      beforeEventId?: string;
    }
  | {
      op: 'addWorldEvent';
      event: Omit<WorldEvent, 'id' | 'status' | 'usedInChapter' | 'locked' | 'sortOrder'> & {
        locked?: boolean;
        sortOrder?: number;
      };
    }
  | {
      op: 'updateHeroEvent';
      eventId: string;
      patch: Partial<
        Pick<HeroEvent, 'day' | 'title' | 'intent' | 'location' | 'emotionalState' | 'locked' | 'sortOrder'>
      >;
    }
  | {
      op: 'moveHeroEvent';
      eventId: string;
      day: number;
      beforeEventId?: string;
    }
  | {
      op: 'addHeroEvent';
      event: Omit<HeroEvent, 'id' | 'status' | 'usedInChapter' | 'locked' | 'sortOrder'> & {
        locked?: boolean;
        sortOrder?: number;
      };
    }
  | { op: 'updateHeroProfile'; protagonistGoal?: string; crisis?: string }
  | { op: 'updateFactionGoals'; factionId: string; goals: string[] }
  | {
      op: 'updateSupportEvent';
      eventId: string;
      patch: Partial<
        Pick<
          SupportEvent,
          | 'day'
          | 'title'
          | 'intent'
          | 'location'
          | 'characterId'
          | 'protagonistAwareness'
          | 'locked'
          | 'sortOrder'
        >
      >;
    }
  | {
      op: 'moveSupportEvent';
      eventId: string;
      day: number;
      beforeEventId?: string;
    }
  | {
      op: 'addSupportEvent';
      event: Omit<SupportEvent, 'id' | 'status' | 'usedInChapter' | 'locked' | 'sortOrder'> & {
        locked?: boolean;
        sortOrder?: number;
      };
    }
  | { op: 'updateSupportCharacterGoals'; characterId: string; goals: string[] }
  | { op: 'replacePowerSystem'; powerSystem: PowerSystemFile }
  | { op: 'replaceCharacterAssets'; characterAssets: CharacterAssetsFile }
  | { op: 'replaceStoryArcs'; storyArcs: StoryArcsFile };

export type CollisionPatch =
  | { op: 'update'; collisionId: string; required?: boolean; status?: 'candidate' | 'rejected' }
  | { op: 'reject'; collisionId: string };

/** 世界模拟 Tick 运行记录 */
export const UniverseSimStateSchema = z.object({
  lastTickAt: z.string().datetime(),
  fromDay: z.number().int().nonnegative(),
  toDay: z.number().int().nonnegative(),
  newWorldEvents: z.number().int().nonnegative(),
  newSupportEvents: z.number().int().nonnegative().default(0),
  newHeroEvents: z.number().int().nonnegative(),
  resolvedWorldEvents: z.number().int().nonnegative().default(0),
  newCollisions: z.number().int().nonnegative().default(0),
  ticksTotal: z.number().int().nonnegative().default(0),
});

export type UniverseSimState = z.infer<typeof UniverseSimStateSchema>;

export const CycleResumeSchema = z.object({
  skipTick: z.boolean(),
  collisionId: z.string().optional(),
  heroEventId: z.string().optional(),
  episodeNumber: z.number().int().positive().optional(),
});

export type CycleResume = z.infer<typeof CycleResumeSchema>;

/** 叙事周期（tick → plan → write）运行记录 */
export const NarrativeCycleLogSchema = z.object({
  lastRunAt: z.string().datetime(),
  tickDays: z.number().int().nonnegative(),
  skippedTick: z.boolean().default(false),
  skippedWrite: z.boolean().default(false),
  collisionId: z.string().optional(),
  collisionTitle: z.string().optional(),
  episodeNumber: z.number().int().positive().optional(),
  chapterNumber: z.number().int().positive().optional(),
  chapterTitle: z.string().optional(),
  wordCount: z.number().int().nonnegative().optional(),
  runsTotal: z.number().int().nonnegative().default(0),
  lastStatus: z.enum(['success', 'failed']).optional(),
  lastError: z.string().optional(),
  failedStage: z.enum(['tick', 'collision', 'plan', 'write']).optional(),
  lastFailedAt: z.string().datetime().optional(),
  consecutiveFailures: z.number().int().nonnegative().default(0),
  resume: CycleResumeSchema.optional(),
  lastJobId: z.string().optional(),
});

export type NarrativeCycleLog = z.infer<typeof NarrativeCycleLogSchema>;

/** 周期链单阶段状态 */
export const CycleStageStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
]);
export type CycleStageStatus = z.infer<typeof CycleStageStatusSchema>;

export const CycleStageNameSchema = z.enum(['tick', 'collision', 'plan', 'write']);
export type CycleStageName = z.infer<typeof CycleStageNameSchema>;

export const CycleStageRecordSchema = z.object({
  status: CycleStageStatusSchema.default('pending'),
  jobId: z.string().optional(),
  jobType: z.string().optional(),
  error: z.string().optional(),
  finishedAt: z.string().datetime().optional(),
});

export type CycleStageRecord = z.infer<typeof CycleStageRecordSchema>;

/** 进行中的周期链（各阶段独立 job） */
export const CycleRunSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: z.enum(['running', 'completed', 'failed', 'cancelled']),
  config: z.object({
    tickDays: z.number().int().nonnegative(),
    autoDiscoverCollisions: z.boolean().default(true),
    maxCollisions: z.number().int().positive().default(6),
    targetWords: z.number().int().positive().optional(),
    skipWrite: z.boolean().default(false),
    collisionId: z.string().optional(),
    heroEventId: z.string().optional(),
    episodeNumber: z.number().int().positive().optional(),
  }),
  stages: z.object({
    tick: CycleStageRecordSchema,
    collision: CycleStageRecordSchema,
    plan: CycleStageRecordSchema,
    write: CycleStageRecordSchema,
  }),
  tickToDay: z.number().int().nonnegative().optional(),
  heroEventId: z.string().optional(),
  heroEventTitle: z.string().optional(),
  collisionId: z.string().optional(),
  collisionTitle: z.string().optional(),
  episodeNumber: z.number().int().positive().optional(),
  episodeTitle: z.string().optional(),
  chapterNumber: z.number().int().positive().optional(),
  chapterTitle: z.string().optional(),
  wordCount: z.number().int().nonnegative().optional(),
  lastError: z.string().optional(),
  failedStage: CycleStageNameSchema.optional(),
});

export type CycleRun = z.infer<typeof CycleRunSchema>;

/** 已结束的周期链归档（最新在前） */
export const CycleRunHistorySchema = z.object({
  runs: z.array(CycleRunSchema),
  updatedAt: z.string().datetime(),
});

export type CycleRunHistory = z.infer<typeof CycleRunHistorySchema>;
