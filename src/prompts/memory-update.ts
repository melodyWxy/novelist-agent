/**
 * 记忆更新 Prompt
 *
 * Agent 记忆原理：
 * - 每章写完后，从正文中「蒸馏」出结构化状态，供下一章使用
 * - 这是 RAG/长上下文方案的轻量替代：用摘要+状态代替全文检索
 * - 输出必须可机器解析（JSON），便于直接 merge 到 state.json
 */
import type { ChatMessage } from '../llm/client.js';
import type { NovelMeta, StoryState } from '../novel/types.js';

export interface MemoryUpdateContext {
  meta: NovelMeta;
  previousState: StoryState;
  chapterNumber: number;
  chapterTitle: string;
  chapterContent: string;
}

export function buildMemoryUpdatePrompt(ctx: MemoryUpdateContext): ChatMessage[] {
  const { meta, previousState, chapterNumber, chapterTitle, chapterContent } = ctx;

  return [
    {
      role: 'system',
      content: `你是小说剧情档案管理员，负责从章节正文中提取并更新故事状态。
输出 JSON：
{
  "timeline": "当前故事时间线位置",
  "lastChapterSummary": "本章摘要，100-200字",
  "characters": [{ "name", "role", "traits", "currentStatus", "relationships" }],
  "foreshadowing": [{ "id", "description", "introducedInChapter", "resolved" }],
  "openThreads": ["未解决剧情线"]
}

规则：
1. 合并更新已有角色状态，新增出场角色
2. 新伏笔分配 id（如 f1, f2），已回收的设 resolved: true
3. 摘要要包含本章关键转折，供下章写作参考`,
    },
    {
      role: 'user',
      content: `【作品】${meta.title}
【更新前状态】
${JSON.stringify(previousState, null, 2)}

【刚完成的章节】第${chapterNumber}章《${chapterTitle}》
${chapterContent}

请输出更新后的故事状态 JSON。`,
    },
  ];
}
