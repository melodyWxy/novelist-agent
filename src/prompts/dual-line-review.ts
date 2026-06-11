import type { ChatMessage } from '../llm/client.js';
import type { NovelMeta, StoryState } from '../novel/types.js';
import type { CharacterAssetsFile, EpisodePlan, PowerSystemFile } from '../narrative/types.js';

export function buildDualLineReviewPrompt(input: {
  meta: NovelMeta;
  state: StoryState;
  episode: EpisodePlan;
  chapterNumber: number;
  chapterContent: string;
  forbiddenTerms?: string[];
  programmaticLeakedTerms?: string[];
  powerSystem?: PowerSystemFile | null;
  characterAssets?: CharacterAssetsFile | null;
  arcPowerCeiling?: string;
  programmaticPowerIssues?: string[];
}): ChatMessage[] {
  const {
    meta,
    state,
    episode,
    chapterNumber,
    chapterContent,
    forbiddenTerms = [],
    programmaticLeakedTerms = [],
    powerSystem,
    characterAssets,
    arcPowerCeiling,
    programmaticPowerIssues = [],
  } = input;
  const openingVolumeReviewNote =
    chapterNumber <= 30
      ? `\n首卷/早期章节额外标准：本章应帮助读者更清楚理解小说世界。请检查是否通过主角见闻、交易、盘查、冲突、对话或失败代价，自然讲清至少一项世界模块：地理生活感、阶层制度、势力格局、能力/修行代价、资源链、主角所处位置。若只推进谜团而没有让读者更理解世界，应列为 readability 或 pacing 问题。`
      : '';

  return [
    {
      role: 'system',
      content: `你是网络小说主编型审稿编辑。你的首要任务不是守设定秘密，而是判断这一章是否好读、顺畅、有吸引力。

审稿优先级从高到低：
1. readabilityOk：读者是否能清楚理解本章“主角目标 → 阻碍 → 主动选择 → 结果/收益”
2. styleToneOk：是否符合明快、细腻、有趣、好读的网络小说读感，而不是故作玄虚、谜语化、设定堆砌
3. conflictReadable：冲突场景是否有清楚空间锚点、动作因果和主角目标，读者不会云里雾里
4. payoffSatisfying：是否有“小爽点闭环”（压迫/轻视 → 主角主动破局 → 明确收益）
5. storyFlow：剧情是否顺滑，有开场钩子、推进、升级、收束/余波，不像碎片拼贴
6. characterAgency：主角是否有主动判断和选择，不是全程被推着走
7. proseQuality：句子是否清楚、有画面、有节奏，是否避免空泛词、重复比喻、过密专有名词
8. emotionalClarity：人物情绪是否能从动作、对话、反应中读出来
9. dialogueParagraphs：人物对话是否独立分段；重点看换说话人是否换段、对话后的关键动作/反应是否清楚，不按“短段落/移动端”强行扣分
10. powerConsistencyOk：战力/阶位/能力/物品/伤势是否与角色资产和事件包一致；禁止无因跨阶、凭空神器、伤势遗忘
11. heroKnowledgeOk：主角是否出现明显不该知道的信息；只在破坏阅读可信度时判严重
12. hiddenLineLeak：只作为“悬念管理/剧透控制”参考项，不是核心审稿目标；适度揭示隐线可以接受，不能为了藏隐线牺牲可读性
13. worldCausalityOk / collisionNatural / stateChanged：检查因果、碰撞和状态推进是否服务章节阅读体验
${openingVolumeReviewNote}

输出 JSON：{
  chapterNumber, passed, score,
  worldCausalityOk, heroKnowledgeOk, collisionNatural, stateChanged, powerConsistencyOk, readabilityOk, styleToneOk,
  hiddenLineLeak, leakedTerms[],
  issues[], summary, reviewedAt
}
评分规则：
- 80 分以上：读起来顺，场景清楚，主角有行动，文笔有画面，本章有明确收益或情绪回报
- 70～79 分：基本可读，但文笔、节奏、爽点或情绪有明显可修处
- 60～69 分：读者能勉强跟上，但剧情流、动作链、人物动机或表达存在较大问题
- 60 分以下：云里雾里、像谜语、像设定摘要、冲突混乱、主角被动或读者读不懂

硬性判低：
- 若读者读完无法复述本章目标、阻碍、选择、收益，readabilityOk=false，passed=false，score 不得高于 60
- 若文风含混、设定堆叠、缺少生活气和具体动作，styleToneOk=false，score 不得高于 68
- 若冲突主要靠“混战、气浪、剑光、符箓”等词堆叠，缺少谁做了什么、为什么做、结果如何，应列为 pacing 或 logic 问题
- 若主角全程被动挨打/目击，没有主动判断带来的收益，应列为 pacing 或 character 问题
- 若正文大量使用“某种力量/那个人/不可言说/仿佛有什么/命运齿轮”等含混神秘词替代清楚因果，应列为 style 问题
- 若只是自然叙事段落较长，不要扣分；只有人物对话挤在同一段导致说话人不清楚，才列为 style 或 readability 问题
- 若为第一人称旁白，必须 passed=false，score 不得高于 60
- powerConsistencyOk=false 且严重破坏剧情可信度时 passed=false

隐线处理：
- hiddenLineLeak=true 不自动失败，不自动压低到不及格
- 只有当泄露直接剧透核心反转、让后续悬念失效，或造成主角知识越界/剧情可信度问题时，才作为 high severity
- 如果适度揭示能让读者更明白、更想看，应优先保留可读性，不要为了藏而藏`,
    },
    {
      role: 'user',
      content: `作品：${meta.title} 第${chapterNumber}章
事件包标题：${episode.title}
表层冲突：${episode.surfaceConflict}
隐线因果（仅供审稿，不应出现在正文）：${episode.hiddenCausality}
主角意图：${episode.heroIntent}
主角应获得：${episode.heroGains.join('；')}
暗示清单：${episode.shadowHints.join('；')}

${forbiddenTerms.length > 0 ? `禁词列表：${forbiddenTerms.join('、')}` : ''}
${programmaticLeakedTerms.length > 0 ? `程序检测到泄露词：${programmaticLeakedTerms.join('、')}` : ''}
${programmaticPowerIssues.length > 0 ? `程序检测到战力问题：${programmaticPowerIssues.join('；')}` : ''}

战力体系：${powerSystem?.systemName ?? '未生成'}
本卷战力上限：${arcPowerCeiling ?? '未设'}
角色资产：${JSON.stringify(characterAssets?.characters ?? []).slice(0, 1200)}

故事状态：${state.timeline}

【正文】
${chapterContent}`,
    },
  ];
}
