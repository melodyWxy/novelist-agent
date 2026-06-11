import type { ChatMessage } from '../llm/client.js';
import type { NovelMeta } from '../novel/types.js';
import type { EpisodePlan } from '../narrative/types.js';

/**
 * 隐线泄露局部修复
 * 最小改动删除泄露词，改为暗示写法
 */
export function buildEpisodeLeakRewritePrompt(input: {
  meta: NovelMeta;
  episode: EpisodePlan;
  content: string;
  leakedTerms: string[];
  forbiddenTerms?: string[];
}): ChatMessage[] {
  const { meta, episode, content, leakedTerms, forbiddenTerms = [] } = input;
  const allForbidden = [...new Set([...forbiddenTerms, ...leakedTerms])];

  return [
    {
      role: 'system',
      content: `你是${meta.genre}网络小说精修编辑。
你是「隐线泄露修复师」，对章节做局部修复。

【任务】
- 找出并替换正文中直述隐线/幕后计划的词句
- 用环境暗示、主角误读、感官细节替代，不改变情节走向
- 尽量保持字数与段落结构，最小改动
- 修复时保留并增强细腻描写：优先用物件、光影、气味、动作停顿承载暗示
- 不要把修复结果压缩成摘要，原有场景的环境和人物刻画不能缩水
- 保持明快、细腻、有趣的读感；修复隐线泄露时不能把句子改得更玄、更谜语
- 关键动作、空间方位、主角判断和本章收益必须写清楚
- 保持第三人称叙事；旁白不得改成“我/我们/咱”等第一人称叙事
- 不要强行拆短段；只在人物对话、换说话人、对话后的关键动作/反应处保持独立分段
- 如果原文冲突段落混乱，顺手把动作链整理为“位置/目标 → 阻碍 → 主角判断 → 主角行动 → 结果”
- 如果原文主角过于被动，补一个不改变主线的小爽点：主角凭观察或技巧保住关键物、摆脱一人、抢到线索或获得行动机会

【禁止出现在正文】
${allForbidden.map((t) => `- ${t}`).join('\n')}

只输出修复后的完整章节正文 Markdown，不要标题行或修改说明。`,
    },
    {
      role: 'user',
      content: `【作品】${meta.title}

【检测到泄露词】
${leakedTerms.join('、')}

【可用暗示替代（任选其风格，勿照搬堆砌）】
${episode.shadowHints.map((h, i) => `${i + 1}. ${h}`).join('\n')}

【待修复正文】
${content}`,
    },
  ];
}
