/**
 * 小说领域模型（Domain Model）
 *
 * Agent 研发原理：
 * - 「领域模型」定义 Agent 所操作的数据结构，是 Prompt 输入/输出与持久化的契约
 * - 使用 Zod 同时做：TypeScript 类型推导 + 运行时校验（尤其 LLM 返回的 JSON）
 * - 长篇小说需要「作品元数据」「故事状态（记忆）」「章节正文」分离存储
 */
import { z } from 'zod';

/** 作品元数据 — 创建作品时写入，较少变更 */
export const NovelMetaSchema = z.object({
  id: z.string().describe('作品唯一 ID，用作目录名'),
  title: z.string().describe('书名'),
  genre: z.string().describe('题材，如玄幻、都市、科幻'),
  protagonist: z.string().describe('主角名'),
  style: z.string().describe('文风，如热血爽文、细腻文艺'),
  worldSetting: z.string().optional().describe('世界观简述'),
  targetWordCount: z.number().optional().describe('目标总字数'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type NovelMeta = z.infer<typeof NovelMetaSchema>;

/** 单个人物状态 — 记忆系统追踪角色随剧情变化 */
export const CharacterStateSchema = z.object({
  name: z.string(),
  role: z.string().optional().describe('身份/定位'),
  traits: z.array(z.string()).default([]).describe('性格标签'),
  currentStatus: z.string().describe('当前状态（位置、伤势、情绪等）'),
  relationships: z.record(z.string()).default({}).describe('与其他角色的关系'),
});

export type CharacterState = z.infer<typeof CharacterStateSchema>;

/** 伏笔条目 — 长线剧情需要显式记录未回收的伏笔 */
export const ForeshadowingSchema = z.object({
  id: z.string(),
  description: z.string(),
  introducedInChapter: z.number(),
  resolved: z.boolean().default(false),
});

export type Foreshadowing = z.infer<typeof ForeshadowingSchema>;

/** 章节大纲条目 */
export const ChapterOutlineSchema = z.object({
  chapterNumber: z.number().int().positive(),
  title: z.string(),
  summary: z.string().describe('本章情节摘要'),
  keyEvents: z.array(z.string()).default([]),
});

export type ChapterOutline = z.infer<typeof ChapterOutlineSchema>;

/** 全书大纲 */
export const OutlineSchema = z.object({
  premise: z.string().describe('故事前提/一句话梗概'),
  themes: z.array(z.string()).default([]),
  arcs: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      chapterRange: z.tuple([z.number(), z.number()]).optional(),
    })
  ).default([]),
  chapters: z.array(ChapterOutlineSchema),
  generatedAt: z.string().datetime(),
});

export type Outline = z.infer<typeof OutlineSchema>;

/**
 * 故事状态（Story State / Memory）
 *
 * Agent 记忆原理：
 * - LLM 上下文窗口有限，无法塞入全书正文
 * - 「状态摘要」代替全文：人物状态、时间线、上章摘要、伏笔列表
 * - 每章写完后由 memory-update 步骤增量更新此结构
 */
export const StoryStateSchema = z.object({
  timeline: z.string().describe('当前故事时间线位置'),
  lastChapterSummary: z.string().optional().describe('上一章摘要'),
  lastChapterNumber: z.number().int().nonnegative().default(0),
  characters: z.array(CharacterStateSchema).default([]),
  foreshadowing: z.array(ForeshadowingSchema).default([]),
  openThreads: z.array(z.string()).default([]).describe('未解决的剧情线'),
  updatedAt: z.string().datetime(),
});

export type StoryState = z.infer<typeof StoryStateSchema>;

/** 章节正文记录（元数据，正文存 .md 文件） */
export const ChapterRecordSchema = z.object({
  chapterNumber: z.number().int().positive(),
  title: z.string(),
  wordCount: z.number().int().nonnegative(),
  writtenAt: z.string().datetime(),
});

export type ChapterRecord = z.infer<typeof ChapterRecordSchema>;

/** 审稿结果 — LLM 结构化输出，便于自动或人工修订 */
export const ReviewResultSchema = z.object({
  chapterNumber: z.number().int().positive(),
  passed: z.boolean().describe('是否通过基本质量门槛'),
  score: z.number().min(0).max(100).optional(),
  issues: z.array(
    z.object({
      category: z.enum(['continuity', 'character', 'pacing', 'style', 'logic', 'other']),
      severity: z.enum(['low', 'medium', 'high']),
      description: z.string(),
      suggestion: z.string().optional(),
    })
  ).default([]),
  summary: z.string(),
  reviewedAt: z.string().datetime(),
});

export type ReviewResult = z.infer<typeof ReviewResultSchema>;

/** memory-update 步骤的 LLM 结构化输出 */
export const MemoryUpdateSchema = z.object({
  timeline: z.string(),
  lastChapterSummary: z.string(),
  characters: z.array(CharacterStateSchema),
  foreshadowing: z.array(ForeshadowingSchema),
  openThreads: z.array(z.string()),
});

export type MemoryUpdate = z.infer<typeof MemoryUpdateSchema>;

/** 创建作品时的输入参数 */
export interface InitNovelInput {
  id: string;
  title: string;
  genre: string;
  protagonist: string;
  style: string;
  worldSetting?: string;
  targetWordCount?: number;
}
