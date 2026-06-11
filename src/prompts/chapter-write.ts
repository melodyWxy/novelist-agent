/**
 * 章节写作 Prompt
 *
 * Prompt 工程原理：
 * - 长篇连贯性依赖「上下文注入」：大纲 + 故事状态 + 上章摘要
 * - system 固定角色与文风约束，user 注入动态上下文
 * - 正文输出为纯 Markdown 文本，不用 JSON（避免 token 浪费在转义上）
 */
import type { ChatMessage } from '../llm/client.js';
import type { NovelMeta, StoryState, ChapterOutline } from '../novel/types.js';

export interface ChapterWriteContext {
  meta: NovelMeta;
  state: StoryState;
  chapterOutline: ChapterOutline;
  previousChapterExcerpt?: string;
  targetWords?: number;
}

export function buildChapterWritePrompt(ctx: ChapterWriteContext): ChatMessage[] {
  const { meta, state, chapterOutline, previousChapterExcerpt, targetWords = 3500 } = ctx;
  const openingWorldGuide =
    chapterOutline.chapterNumber <= 30
      ? '\n12. 首卷/早期章节要更重视世界观引导：通过主角见闻、交易、盘查、冲突、对话或失败代价，自然讲清地理生活感、阶层制度、势力格局、能力/修行代价、资源链或主角所处位置之一；不要写成百科说明，也不要只推进谜团。'
      : '';

  const characterBlock = state.characters
    .map(
      (c) =>
        `- ${c.name}（${c.role ?? '角色'}）：${c.currentStatus}；性格：${c.traits.join('、') || '待定'}`
    )
    .join('\n');

  const foreshadowBlock =
    state.foreshadowing.filter((f) => !f.resolved).length > 0
      ? state.foreshadowing
          .filter((f) => !f.resolved)
          .map((f) => `- [第${f.introducedInChapter}章] ${f.description}`)
          .join('\n')
      : '（暂无未回收伏笔）';

  return [
    {
      role: 'system',
      content: `你是一位专业的${meta.genre}网络小说作家，文风：${meta.style}。
请根据提供的大纲和故事状态，撰写章节正文。

写作要求：
1. 只输出章节正文，不要标题、不要 JSON、不要作者说明
2. 目标字数约 ${targetWords} 字，最低不要低于 ${Math.floor(targetWords * 0.9)} 字；不要为了凑字数重复描写，篇幅不足时优先顺势推进剧情到下一处目标、阻碍、后果或短余波
3. 保持人物性格一致，注意与上一章衔接
4. 适当推进剧情，可埋设或呼应伏笔
5. 使用中文，叙述人称必须为第三人称；旁白不得用“我/我们/咱”等第一人称指代主角，人物对白可自然使用第一人称
6. 不要写成大纲扩写：每个关键事件至少展开为有动作、有环境、有反应的完整场景
7. 环境描写要服务人物行动与情绪，具体到光线、气味、声音、温度、材质或空间压迫感
8. 人物刻画通过动作、眼神、停顿、语气和细小选择呈现，避免只用抽象形容词总结
9. 冲突场景要先建立空间锚点和目标关系，再按“攻击/阻碍 → 主角判断 → 主角行动 → 结果”推进，避免混乱堆叠
10. 每章至少设计一个小爽点闭环：压迫或轻视主角 → 主角主动破局 → 获得明确收益（线索、物件、优势、他人改观或行动机会）
11. 不要强行碎片化分段；叙事、动作和心理按自然阅读节奏成段。人物对话必须独立分段，换说话人要换段，对话后的关键动作/反应尽量另起一段${openingWorldGuide}`,
    },
    {
      role: 'user',
      content: `【作品】${meta.title}
【当前时间线】${state.timeline}
【上章摘要】${state.lastChapterSummary ?? '（首章，无前文）'}
【未解决剧情线】${state.openThreads.join('；') || '无'}

【人物状态】
${characterBlock}

【未回收伏笔】
${foreshadowBlock}

【本章大纲】
第${chapterOutline.chapterNumber}章 ${chapterOutline.title}
摘要：${chapterOutline.summary}
关键事件：${chapterOutline.keyEvents.join('、')}

${previousChapterExcerpt ? `【上章结尾节选】\n${previousChapterExcerpt.slice(-800)}` : ''}

请撰写第${chapterOutline.chapterNumber}章《${chapterOutline.title}》的正文。`,
    },
  ];
}
