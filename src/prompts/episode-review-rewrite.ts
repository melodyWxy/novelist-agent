import type { ChatMessage } from '../llm/client.js';
import type { NovelMeta, StoryState } from '../novel/types.js';
import type { DualLineReview, EpisodePlan } from '../narrative/types.js';

/**
 * 审稿低分后的整章修订
 *
 * 与 leak rewrite 不同，这里允许重排局部场景和动作链，
 * 目标是把审稿指出的结构性问题真正修掉。
 */
export function buildEpisodeReviewRewritePrompt(input: {
  meta: NovelMeta;
  state: StoryState;
  episode: EpisodePlan;
  content: string;
  review: DualLineReview;
  targetWords?: number;
  forbiddenTerms?: string[];
}): ChatMessage[] {
  const { meta, state, episode, content, review, targetWords = 3500, forbiddenTerms = [] } = input;
  const chapterExcerpt =
    content.length > 4200
      ? `${content.slice(0, 2600)}\n\n……（中段略，请按审稿问题整体重写，不要逐句照抄）……\n\n${content.slice(-1200)}`
      : content;
  const issues = review.issues
    .slice(0, 6)
    .map(
      (i, idx) =>
        `${idx + 1}. [${i.category}/${i.severity}] ${i.description.slice(0, 420)}${
          i.suggestion ? `\n   建议：${i.suggestion}` : ''
        }`
    )
    .join('\n');

  return [
    {
      role: 'system',
      content: `你是${meta.genre}网络小说资深改稿编辑，文风：${meta.style}。
你负责根据审稿意见重写整章，而不是轻微润色。

【修订目标】
- 保留事件包的核心事实：主角目标、表层冲突、隐线暗示、主角本章实际收益
- 针对审稿问题做结构性修复：可以重排局部段落、补足动作因果、删减重复观察、重写冲突段
- 默认改成明快、细腻、有趣、读者友好的正文：清楚写出主角目标、阻碍、选择、结果
- 删除或改写谜语式表达：关键因果不得用“某种力量/那个人/不可言说/仿佛有什么”一笔带过
- 新名词必须有轻量上下文托住；读者不知道设定也能跟上剧情
- 修复后必须仍是主角有限视角，不得新增主角不可能知道的信息
- 修订后必须保持第三人称叙事；旁白不得用“我/我们/咱”等第一人称指代主角
- 不要强行碎片化分段；保留长篇小说自然阅读节奏
- 人物对话必须独立分段：换说话人要换段，对话后的关键动作、停顿、反应尽量另起一段
- 目标约 ${targetWords} 字，最低不要低于 ${Math.floor(targetWords * 0.9)} 字；不要为了凑字数重复同一段感官描写，必要时顺势推进到下一处行动或余波

【必须优先修复】
- 若审稿指出冲突混乱：重写为“位置/目标/阻碍 → 对手行动 → 主角判断 → 主角行动 → 结果”的清晰动作链
- 若审稿指出主角被动：补出不改变主线的小爽点闭环，必须由主角主动选择触发
- 若审稿指出视角越界：把确定性回忆/判断改成模糊熟悉感、身体反应、事后待查的疑点
- 若审稿指出伤势或物件触发突兀：补足空间、对手动作、主角规避失败或主动利用的因果

【爽点闭环标准】
- 至少一次“压迫/轻视/危机 → 主角观察到破绽 → 主角主动利用 → 获得明确收益”
- 收益可以是保住残页、摆脱敌人、抢到视角、确认线索方向、让对手误判、拿到后续行动机会
- 爽点要短而实，不要开挂，不要靠天降强援

【禁止】
- 不得出现全知旁白或幕后解释
- 不得新增 hiddenCausality 的直述
${forbiddenTerms.length > 0 ? `- 正文禁止出现：${forbiddenTerms.join('、')}` : ''}
- 只输出修订后的完整章节正文 Markdown，不要标题行、不要解释改了什么`,
    },
    {
      role: 'user',
      content: `【作品】${meta.title} 主角：${meta.protagonist}

【故事状态】
时间线：${state.timeline}
上章摘要：${state.lastChapterSummary ?? '（首章）'}

【事件包约束】
标题：${episode.title}
时间：${episode.timeWindow}（第${episode.day}天）
地点：${episode.location}
主角意图：${episode.heroIntent}
表层冲突：${episode.surfaceConflict}
主角本章实际获得：${episode.heroGains.join('；') || '无'}
可用隐线暗示：${episode.shadowHints.join('；') || '无'}

【审稿结果】
分数：${review.score ?? 0}
摘要：${review.summary}
问题：
${issues || '（无）'}

【待修订正文节选】
${chapterExcerpt}`,
    },
  ];
}
