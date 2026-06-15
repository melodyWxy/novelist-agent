/**
 * 大纲生成 Prompt
 *
 * Prompt 工程原理：
 * - system：定义角色与输出约束（专业小说策划）
 * - user：注入作品设定，要求结构化 JSON 输出
 * - 大纲属于结构化任务，输出 JSON 后由 Zod 校验
 */
import type { ChatMessage } from '../llm/client.js';
import type { NovelMeta } from '../novel/types.js';

export function buildOutlinePrompt(meta: NovelMeta, chapterCount = 10): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `你是一位资深网络小说策划，擅长${meta.genre}题材。
你的任务是根据作品设定，生成可执行的分章大纲。
输出必须是 JSON 对象，包含字段：
- premise: 一句话故事前提
- themes: 主题数组
- arcs: 故事弧数组，每项含 name, description, chapterRange(可选)
- chapters: 章节数组，每项含 chapterNumber, title, summary, keyEvents
- generatedAt: ISO 时间字符串

要求：
1. 生成 ${chapterCount} 章的详细大纲
2. 风格贴合：${meta.style}
3. 主角：${meta.protagonist}
4. 每章 summary 50-150 字，keyEvents 2-4 条
5. 作品设定是素材，不是每章重复执行的流程；如果设定要求早期讲清制度/资源/规则，必须分散到不同类型的大事件里，避免连续章节围绕同一种办事、查账、说明书式场景打转`,
    },
    {
      role: 'user',
      content: `请为以下作品生成大纲：

书名：${meta.title}
题材：${meta.genre}
主角：${meta.protagonist}
文风：${meta.style}
${meta.worldSetting ? `世界观：${meta.worldSetting}` : ''}
${meta.targetWordCount ? `目标字数：约 ${meta.targetWordCount} 字` : ''}`,
    },
  ];
}
