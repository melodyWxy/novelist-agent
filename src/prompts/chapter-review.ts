/**
 * 章节审稿 Prompt
 *
 * Agent 质检原理：
 * - 生成与审稿分离（Generate-Verify 模式），避免模型「自己审自己」时过于宽松
 * - 审稿用较低 temperature，输出结构化 issues 便于后续自动修订或人工处理
 */
import type { ChatMessage } from '../llm/client.js';
import type { NovelMeta, StoryState } from '../novel/types.js';

export interface ChapterReviewContext {
  meta: NovelMeta;
  state: StoryState;
  chapterNumber: number;
  chapterTitle: string;
  chapterContent: string;
}

export function buildChapterReviewPrompt(ctx: ChapterReviewContext): ChatMessage[] {
  const { meta, state, chapterNumber, chapterTitle, chapterContent } = ctx;
  const openingVolumeReviewNote =
    chapterNumber <= 30
      ? `\n10. world_onboarding - 首卷/早期章节是否自然帮助读者理解世界观：地理生活感、阶层制度、势力格局、能力/修行代价、资源链或主角所处位置。若只推进谜团而不交代世界基本规则，应扣可读性/节奏分。`
      : '';

  return [
    {
      role: 'system',
      content: `你是一位严格的小说编辑，负责审稿质检。
输出 JSON 格式：
{
  "chapterNumber": number,
  "passed": boolean,
  "score": number (0-100),
  "issues": [{ "category": "continuity|character|pacing|style|logic|other", "severity": "low|medium|high", "description": string, "suggestion": string }],
  "summary": string,
  "reviewedAt": ISO时间字符串
}

审稿维度：
1. continuity - 与上文/设定的连贯性
2. character - 人物性格与行为一致性
3. pacing - 节奏是否拖沓或过快
4. style - 是否符合${meta.style}文风
5. logic - 情节逻辑是否合理
6. conflict_readability - 冲突场景是否有清楚空间锚点、动作因果和主角目标
7. payoff - 是否完成至少一个小爽点闭环：压迫/轻视 → 主角主动破局 → 明确收益
8. narration_person - 旁白是否为第三人称叙事；若以“我/我们/咱”作为叙述主语讲述主角经历（人物对白除外）则不合格
9. dialogue_paragraphs - 人物对话是否独立分段；换说话人是否换段，对话后的关键动作/反应是否清楚。不要因自然叙事段落较长而扣分${openingVolumeReviewNote}

若冲突读起来云里雾里，或主角全程被动没有爽点收益，必须给 medium 以上问题。
若为第一人称旁白，必须 passed=false，score 不得高于 60。
passed 标准：无 high severity 问题，且 score >= 70`,
    },
    {
      role: 'user',
      content: `【作品】${meta.title}（${meta.genre}）
【主角】${meta.protagonist}
【当前故事状态】
- 时间线：${state.timeline}
- 上章摘要：${state.lastChapterSummary ?? '首章'}
- 开放剧情线：${state.openThreads.join('；') || '无'}

【待审章节】第${chapterNumber}章《${chapterTitle}》

${chapterContent}

请审稿并输出 JSON。`,
    },
  ];
}
