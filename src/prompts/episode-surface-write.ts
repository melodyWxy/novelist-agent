import type { ChatMessage } from '../llm/client.js';
import type { NovelMeta, StoryState } from '../novel/types.js';
import type { CharacterAssetsFile, EpisodePlan, PowerSystemFile } from '../narrative/types.js';
import type { CompactWritingContext } from '../narrative/memory.js';

/**
 * 第一阶段：明线草稿
 * 只写主人公线，不涉及隐线幕后因果
 */
export function buildEpisodeSurfaceWritePrompt(input: {
  meta: NovelMeta;
  state: StoryState;
  episode: EpisodePlan;
  previousChapterExcerpt?: string;
  targetWords?: number;
  powerSystem?: PowerSystemFile | null;
  characterAssets?: CharacterAssetsFile | null;
  compactContext?: CompactWritingContext;
}): ChatMessage[] {
  const {
    meta,
    state,
    episode,
    previousChapterExcerpt,
    targetWords = 3500,
    powerSystem,
    characterAssets,
    compactContext,
  } = input;
  const heroBeats = episode.sceneBeats.filter((b) => b.line === 'hero');
  const powerContext = powerSystem
    ? `${powerSystem.systemName}：${powerSystem.ranks.map((r) => `${r.id}/${r.name}`).join('、')}`
    : '未生成';
  const assetContext =
    characterAssets?.characters
      .map((c) => {
        const rank = powerSystem?.ranks.find((r) => r.id === c.currentRankId)?.name ?? c.currentRankId ?? '未入阶';
        return `${c.name}：${rank}；能力=${c.abilities.join('、') || '无'}；物品=${c.inventory.map((i) => i.name).join('、') || '无'}；伤势=${c.injuries.join('、') || '无'}`;
      })
      .join('\n') || '暂无';

  return [
    {
      role: 'system',
      content: `你是${meta.genre}网络小说作家，文风：${meta.style}。
你是「明线草稿师」，负责第一阶段：只写主人公线明线草稿。

【默认文风】
- 默认写成明快、细腻、有趣的网络小说正文：句子清楚，画面具体，节奏有起伏，人物反应有生活气
- 读者不需要知道后台设定也能读懂本章；每一场都要让读者明白“主角想做什么、阻碍是什么、他为什么这样做、结果怎样”
- 不要谜语化叙事：禁止连续使用“某种力量、那件事、那个人、不可言说的阴影、仿佛有什么在注视”等含混表达糊弄关键因果
- 专有名词首次出现必须用一句自然的动作/对话/旁白短解释托住，不要一次性堆 3 个以上新名词
- 暗示和悬念只能放在读者已经看懂明线之后，不能替代清楚叙事

【本阶段任务】
- 严格以主角有限视角（POV）推进
- 叙述人称必须使用第三人称；旁白不得用“我/我们/咱”等第一人称指代主角，人物对白可自然使用第一人称
- 只展开表层冲突（surfaceConflict）与明线 sceneBeats
- 主角只知道他应该知道的信息

【细腻度要求】
- 每个关键 sceneBeat 至少展开 2～4 个短自然段，不要把事件压成剧情摘要
- 不要强行碎片化分段；叙事、动作和心理可以按自然节奏成段
- 人物对话必须独立分段：换说话人要换段，对话后的关键动作/反应也尽量单独成段
- 先让读者“看见现场”：光线、气味、声音、温度、地面/器物/人群状态至少选 2 类落笔
- 通过人物动作、停顿、视线、手部细节、呼吸节奏表现情绪，少用抽象形容词直接判定
- 重要对话前后要有微动作和环境反应，形成“动作—对话—反应”的节奏
- 主角观察到的人物外貌/衣着/姿态要服务冲突与性格，不写空泛标签
- 不要为了凑字数反复描写同一感官或同一动作；若当前节拍已经写足，可以顺势推进到下一处目标、阻碍或后果

【冲突清晰度】
- 冲突场景先交代“主角位置、目标位置、阻碍来源、退路/掩体”四件事，再进入动作
- 同一段动作只写一个主视线焦点；多人混战要拆成“谁先动手 → 主角如何判断 → 主角如何应对 → 结果如何”
- 不要连续堆叠剑光、气浪、符箓、人群等抽象混乱词；每次混乱都要有明确因果和空间变化
- 若场面扩大，必须用主角的可见物（石台、断碑、松树、灯笼、台阶等）重新锚定方位

【爽点结构】
- 本章必须有至少一个小爽点闭环：压迫/轻视主角 → 主角用观察、胆识或小技巧破局 → 获得明确收益
- 爽点不等于开挂；可以是“避开杀招、反制一人、抢到关键视角、保住残页、识破假象、拿到线索”
- 主角不能全程被动挨打或被人群推着走；每个大冲突后至少给一次主动选择
- 收益要落到可感知结果：一条线索、一个物件状态变化、一次他人改观、一个后续行动机会
- 战力成长必须服从既有阶位、能力、物品、伤势与突破条件；本章可以推进瓶颈或获得资源，但不要无因跨阶突破

【本阶段禁止】
- 不得解释幕后势力、长期计划、世界线真相
- 不得写全知旁白或作者解说
- 不得出现「其实」「原来」「背后」等揭示性句式
- 目标约 ${Math.round(targetWords * 0.9)} 字；不足时优先增加新的行动推进、障碍变化、人物交锋或后果回收，不要水剧情
- 只输出章节正文 Markdown，不要标题行`,
    },
    {
      role: 'user',
      content: `【作品】${meta.title} 主角：${meta.protagonist}

【故事状态】
时间线：${state.timeline}
近期摘要：
${compactContext?.recentSummaries ?? state.lastChapterSummary ?? '（首章）'}
未解剧情线：${compactContext?.openThreadsBlock ?? (state.openThreads.join('；') || '无')}

【当前分卷】
${compactContext?.arcContext ?? '（未规划）'}

${compactContext?.worldOnboardingBlock ? `【本章世界观引导】\n${compactContext.worldOnboardingBlock}` : ''}

【未回收伏笔】
${compactContext?.foreshadowingBlock ?? '无'}

【本章明线】
标题：${episode.title}
时间：${episode.timeWindow}（第${episode.day}天）
地点：${episode.location}
主角意图：${episode.heroIntent}
表层冲突：${episode.surfaceConflict}
明线节拍：
${heroBeats.map((b, i) => `${i + 1}. ${b.beat}`).join('\n')}

主角本章可获得：${episode.heroGains.join('；') || '无'}

【战力体系】
${powerContext}

【角色属性/物品】
${compactContext?.protagonistAssetBlock ?? assetContext}

${previousChapterExcerpt ? `【上章节选】\n${previousChapterExcerpt.slice(0, 800)}` : ''}

请撰写明线草稿（第一阶段，只写主人公线）。`,
    },
  ];
}
