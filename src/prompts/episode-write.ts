import type { ChatMessage } from '../llm/client.js';
import type { NovelMeta, StoryState } from '../novel/types.js';
import type { CharacterAssetsFile, EpisodePlan, PowerSystemFile } from '../narrative/types.js';
import { formatSceneBeats } from '../narrative/disclosure.js';

export function buildEpisodeWritePrompt(input: {
  meta: NovelMeta;
  state: StoryState;
  episode: EpisodePlan;
  previousChapterExcerpt?: string;
  targetWords?: number;
  forbiddenTerms?: string[];
  powerSystem?: PowerSystemFile | null;
  characterAssets?: CharacterAssetsFile | null;
}): ChatMessage[] {
  const { meta, state, episode, previousChapterExcerpt, targetWords = 3500, forbiddenTerms = [], powerSystem, characterAssets } = input;

  const heroBeats = episode.sceneBeats.filter((b) => b.line === 'hero');
  const shadowBeats = episode.sceneBeats.filter((b) => b.line === 'shadow-hint');
  const assetContext =
    characterAssets?.characters
      .map((c) => {
        const rank = powerSystem?.ranks.find((r) => r.id === c.currentRankId)?.name ?? c.currentRankId ?? '未入阶';
        return `${c.name}：${rank}；能力=${c.abilities.join('、') || '无'}；物品=${c.inventory.map((i) => `${i.name}/${i.status}`).join('、') || '无'}；伤势=${c.injuries.join('、') || '无'}`;
      })
      .join('\n') || '暂无';

  return [
    {
      role: 'system',
      content: `你是${meta.genre}网络小说作家，文风：${meta.style}。
本章不是按章节大纲扩写，而是把一次「世界线×主人公线碰撞」写成完整章节。

【默认文风】
- 默认写成明快、细腻、有趣的网络小说正文：叙事顺，画面清，人物有反应，段落有呼吸
- 读者不需要看系统设定也能读懂本章；每个场景都要交代“主角目标、可见阻碍、主角判断、行动结果”
- 不要谜语化叙事：关键因果、空间方位、人物动作必须写明白；悬念只能藏幕后动机，不能藏主角眼前正在发生什么
- 禁止连续堆叠“某种力量、那件事、那个人、不可名状、命运齿轮、黑暗深处”等空泛神秘词
- 新专有名词首次出现时，要用一句自然短解释或具体用途托住，让读者马上知道它大概是什么
- 暗线只做余味，不能淹没主线冲突与爽点
- 开场前三段必须落到具体现场和具体麻烦，不要从宏大设定、抽象情绪或作者总结开篇
- 主角性格要通过小动作、小算计、小吐槽或临场取舍呈现；不要只用“冷静、聪明、谨慎”这类标签概括
- 每场都要有一个可读变化：规则变化、人物插话、物件异常、对手误判、主角换策略、收益落袋或代价出现

【明线任务】
- 以主角有限视角（POV）推进叙事，读者跟随主人公线
- 叙述人称必须使用第三人称；旁白不得用“我/我们/咱”等第一人称指代主角，人物对白可自然使用第一人称
- 按明线 sceneBeats 顺序展开表层冲突（surfaceConflict）
- 主角只知道他应该知道的信息，禁止全知旁白

【隐线约束】
- 世界线是隐线：幕后因果不得直述、不得解释、不得一次性说破
- 只能通过 shadowHints 与 shadow-hint 节拍，用环境细节/反常行为/对话潜台词暗示
- 禁止在正文中出现 hiddenCausality 的原词或同义改写
${forbiddenTerms.length > 0 ? `- 正文禁止出现以下专有词/计划名：${forbiddenTerms.join('、')}` : ''}

【写作纪律】
- 暗示 : 揭示 ≥ 3:1
- 场景不能写成梗概：每个关键节拍都要有环境层、人物层、动作层
- 不要强行把叙事拆成大量短段；动作、心理和环境描写按自然阅读节奏成段
- 人物对话必须独立分段：换说话人要换段，对话后的关键动作、停顿、反应尽量另起一段
- 环境描写要具体到可感知的光线、气味、声音、温度、材质或空间阻隔，并影响人物行动
- 人物刻画用动作、眼神、停顿、语气变化承载心理，不要频繁直接解释“他很震惊/愤怒”
- 对话之间穿插身体反应和场面变化，保持长篇小说的沉浸感与呼吸感
- 世界观信息必须借任务、规矩、称呼、处罚、公开结果或旁人反应自然露出；不要连续百科式解释，也不要整章用贡献点/公示阁查账充世界观
- 至少写出一段带态度变化的对话：试探、误会、嘲讽、讨价还价、敷衍、威胁或临时结盟任选其一
- 避免 AI 腔收束句：少用“他知道事情远没有结束”“一切才刚刚开始”“暗流正在涌动”等空泛尾句，改写成具体动作、物件变化或下一步决定
- 冲突段落必须清楚：先写主角所在位置、目标、阻碍和退路，再写动作；多人混战按因果顺序拆开，不得让读者分不清谁在打谁、主角为什么动
- 每个大冲突至少给主角一次主动选择，不要全程被推着走；选择应带来一个可见结果
- 本章至少完成一个“小爽点闭环”：被压制/被轻视 → 主角以观察、胆识或技巧破局 → 拿到线索、物件、视角优势或他人改观
- 爽点要落在主角能力和选择上，不靠无理由天降强援或全知信息
- 爽点闭环必须让现场出现可见反馈：旁人改口、队伍安静、令牌亮起、账册改动、对手退让、主角少付代价或拿到下一步通行条件
- 战力成长、能力使用和物品变化必须服从角色资产；突破必须有代价、资源或瓶颈铺垫
- 目标约 ${targetWords} 字，最低不要低于 ${Math.floor(targetWords * 0.9)} 字；不要为了凑字数重复同一描写，篇幅不足时优先把剧情推进到下一处目标、阻碍、后果或短余波
- 只输出章节正文 Markdown，不要标题行`,
    },
    {
      role: 'user',
      content: `【作品】${meta.title} 主角：${meta.protagonist}

【故事状态】
时间线：${state.timeline}
上章摘要：${state.lastChapterSummary ?? '（首章）'}
未解伏笔：${state.foreshadowing.filter((f) => !f.resolved).map((f) => f.description).join('；') || '无'}

【本章明线（主人公线）】
标题：${episode.title}
时间：${episode.timeWindow}（第${episode.day}天）
地点：${episode.location}
主角意图：${episode.heroIntent}
表层冲突：${episode.surfaceConflict}
明线节拍：
${heroBeats.map((b, i) => `${i + 1}. ${b.beat}`).join('\n') || '（按事件包展开）'}

【隐线暗示清单（可嵌入正文，禁止直述幕后）】
${(episode.shadowHints.length > 0 ? episode.shadowHints : shadowBeats.map((b) => b.beat)).map((h, i) => `${i + 1}. ${h}`).join('\n')}

【信息边界】
读者本章可多知道：${episode.readerGains.join('；') || '无'}
主角本章实际获得：${episode.heroGains.join('；') || '无'}
（正文写主角视角时，不得超过「主角本章实际获得」）

【角色战力/物品约束】
${assetContext}

${previousChapterExcerpt ? `【上章节选】\n${previousChapterExcerpt.slice(0, 800)}` : ''}

请撰写本章正文。`,
    },
  ];
}

/** @deprecated 保留兼容导出 */
export function formatEpisodeSceneBeats(episode: EpisodePlan): string {
  return formatSceneBeats(episode.sceneBeats);
}
