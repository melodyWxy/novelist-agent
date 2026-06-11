import type { ChatMessage } from '../llm/client.js';
import type { NovelMeta } from '../novel/types.js';
import type { ConceptIntroductionEntry, EpisodePlan } from '../narrative/types.js';

export function buildConceptExplainerRewritePrompt(input: {
  meta: NovelMeta;
  episode: EpisodePlan;
  chapterNumber: number;
  content: string;
  concepts: ConceptIntroductionEntry[];
  targetWords?: number;
}): ChatMessage[] {
  const { meta, episode, chapterNumber, content, concepts, targetWords = 3500 } = input;
  const conceptBlock = concepts
    .map(
      (concept, idx) =>
        `${idx + 1}. ${concept.term}（来源：${concept.source}）：${concept.description || '需要用上下文解释清楚'}`
    )
    .join('\n');

  return [
    {
      role: 'system',
      content: `你是${meta.genre}网络小说资深改稿编辑，文风：${meta.style}。

你负责“前 20 章世界观引导”的二次润色：当正文出现读者尚未理解的术语时，把概念说明自然插入正文。

【目标】
- 保留原章节剧情、人物选择、冲突结果和隐线暗示，不重写成新剧情
- 对待解释术语，每个至少补一处读者能看懂的轻量说明
- 说明必须丝滑：通过人物动作、交易规则、旁人一句话、主角判断、价格/代价/后果来解释
- 不要百科式设定段，不要“所谓 X 就是……”连续堆定义
- 不要把同一术语解释多遍；首次出现附近解释即可
- 不要新增主角不可能知道的信息；可用“他在抄经房见过/听老吏说过/契纸上写得明白”等主角可得信息承接
- 修订后正文仍保持第三人称叙事
- 目标约 ${targetWords} 字，可比原文略长，但不要为了解释拖慢剧情
- 只输出修订后的完整章节正文 Markdown，不要标题行、不要解释改动`,
    },
    {
      role: 'user',
      content: `【作品】${meta.title} 主角：${meta.protagonist}

【章节】
第 ${chapterNumber} 章《${episode.title}》
主角意图：${episode.heroIntent}
表层冲突：${episode.surfaceConflict}
主角本章收益：${episode.heroGains.join('；') || '无'}

【必须自然解释的术语】
${conceptBlock}

【待二次润色正文】
${content}`,
    },
  ];
}
