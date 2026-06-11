/**
 * 章节生成流水线（Pipeline）
 *
 * Agent 编排原理：
 * - Pipeline = 有序步骤链，每步有明确输入/输出
 * - write-chapter 完整链路：加载上下文 -> 写作 -> 审稿 -> 记忆更新 -> 落盘
 */
import { LlmClient, TEXT_OUTPUT_TRUNCATED_ERROR } from '../llm/client.js';
import { buildOutlinePrompt } from '../prompts/outline.js';
import { buildChapterWritePrompt } from '../prompts/chapter-write.js';
import { buildChapterReviewPrompt } from '../prompts/chapter-review.js';
import { countChars } from '../lib/text.js';
import { buildMemoryUpdatePrompt } from '../prompts/memory-update.js';
import {
  OutlineSchema,
  ReviewResultSchema,
  MemoryUpdateSchema,
  type Outline,
  type ReviewResult,
  type NovelMeta,
  type StoryState,
} from './types.js';
import * as store from './store.js';

export interface PipelineOptions {
  skipReview?: boolean;
  skipMemoryUpdate?: boolean;
  targetWords?: number;
}

const CHAPTER_MIN_MAX_TOKENS = 12_000;
const CHAPTER_MAX_MAX_TOKENS = 32_000;

function computeChapterMaxTokens(targetWords?: number): number {
  const target = targetWords ?? 3500;
  return Math.max(CHAPTER_MIN_MAX_TOKENS, Math.min(CHAPTER_MAX_MAX_TOKENS, target * 4));
}

function looksLikeCompleteNarrativeText(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  const tail = trimmed.slice(-24);
  return /[。！？.!?”’」』）)]$/.test(tail);
}

export async function planOutline(
  llm: LlmClient,
  novelId: string,
  chapterCount = 10
): Promise<Outline> {
  const meta = await store.loadNovelMeta(novelId);
  const messages = buildOutlinePrompt(meta, chapterCount);
  const outline = await llm.chatJson(messages, OutlineSchema, { temperature: 0.75 });
  await store.saveOutline(novelId, outline);
  return outline;
}

export async function reviewChapter(
  llm: LlmClient,
  novelId: string,
  chapterNumber: number
): Promise<ReviewResult> {
  const meta = await store.loadNovelMeta(novelId);
  const state = await store.loadStoryState(novelId);
  const content = await store.loadChapter(novelId, chapterNumber);

  if (!content) {
    throw new Error(`第 ${chapterNumber} 章不存在，请先生成章节`);
  }

  const outline = await store.loadOutline(novelId);
  const chapterOutline = outline?.chapters.find((c) => c.chapterNumber === chapterNumber);
  const title = chapterOutline?.title ?? `第${chapterNumber}章`;

  const messages = buildChapterReviewPrompt({
    meta,
    state,
    chapterNumber,
    chapterTitle: title,
    chapterContent: content,
  });

  const review = await llm.chatJson(messages, ReviewResultSchema, { temperature: 0.3 });
  await store.saveReview(novelId, review);
  return review;
}

export async function writeChapter(
  llm: LlmClient,
  novelId: string,
  chapterNumber: number,
  options: PipelineOptions = {}
): Promise<{
  title: string;
  content: string;
  wordCount: number;
  review?: ReviewResult;
  state?: StoryState;
}> {
  const meta = await store.loadNovelMeta(novelId);
  const state = await store.loadStoryState(novelId);
  const outline = await store.loadOutline(novelId);

  if (!outline) {
    throw new Error('请先生成大纲：plan-outline');
  }

  const chapterOutline = outline.chapters.find((c) => c.chapterNumber === chapterNumber);
  if (!chapterOutline) {
    throw new Error(`大纲中不存在第 ${chapterNumber} 章，请先生成或扩展大纲`);
  }

  let previousChapterExcerpt: string | undefined;
  if (chapterNumber > 1) {
    const prev = await store.loadChapter(novelId, chapterNumber - 1);
    if (prev) {
      previousChapterExcerpt = prev;
    }
  }

  const writeMessages = buildChapterWritePrompt({
    meta,
    state,
    chapterOutline,
    previousChapterExcerpt,
    targetWords: options.targetWords ?? 3500,
  });

  const content = await llm.chat(writeMessages, {
    temperature: 0.92,
    maxTokens: computeChapterMaxTokens(options.targetWords ?? 3500),
  });
  if (!looksLikeCompleteNarrativeText(content)) {
    throw new Error(`${TEXT_OUTPUT_TRUNCATED_ERROR}: 第${chapterNumber}章正文末尾不像完整自然段`);
  }
  const wordCount = countChars(content);

  await store.saveChapter(novelId, chapterNumber, chapterOutline.title, content);

  let review: ReviewResult | undefined;
  if (!options.skipReview) {
    const reviewMessages = buildChapterReviewPrompt({
      meta,
      state,
      chapterNumber,
      chapterTitle: chapterOutline.title,
      chapterContent: content,
    });
    review = await llm.chatJson(reviewMessages, ReviewResultSchema, { temperature: 0.3 });
    await store.saveReview(novelId, review);
  }

  let newState: StoryState | undefined;
  if (!options.skipMemoryUpdate) {
    const memoryMessages = buildMemoryUpdatePrompt({
      meta,
      previousState: state,
      chapterNumber,
      chapterTitle: chapterOutline.title,
      chapterContent: content,
    });
    const memoryUpdate = await llm.chatJson(memoryMessages, MemoryUpdateSchema, { temperature: 0.3 });

    newState = {
      ...memoryUpdate,
      lastChapterNumber: chapterNumber,
      updatedAt: new Date().toISOString(),
    };
    await store.saveStoryState(novelId, newState);
  }

  return {
    title: chapterOutline.title,
    content,
    wordCount,
    review,
    state: newState,
  };
}

export async function getNovelSummary(novelId: string): Promise<{
  meta: NovelMeta;
  state: StoryState;
  outline: Outline | null;
  chapterCount: number;
}> {
  const meta = await store.loadNovelMeta(novelId);
  const state = await store.loadStoryState(novelId);
  const outline = await store.loadOutline(novelId);
  const chapterCount = outline?.chapters.length ?? 0;
  return { meta, state, outline, chapterCount };
}
