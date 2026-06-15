import type { ChatMessage } from '../llm/client.js';
import type { NovelMeta } from '../novel/types.js';
import type {
  CharacterAssetsFile,
  Collision,
  HeroEvent,
  HeroTimeline,
  PowerSystemFile,
  SupportEvent,
  WorldEvent,
  WorldTimeline,
} from '../narrative/types.js';
import { COLLISION_TYPE_PROMPT_HINT } from '../narrative/types.js';

export function buildHeroEpisodePlannerPrompt(input: {
  meta: NovelMeta;
  hero: HeroTimeline;
  heroEvent: HeroEvent;
  world: WorldTimeline;
  nearbyWorldEvents: WorldEvent[];
  nearbySupportEvents: SupportEvent[];
  supportNames: Map<string, string>;
  enhancementCollision?: Collision | null;
  powerSystem?: PowerSystemFile | null;
  characterAssets?: CharacterAssetsFile | null;
  arcContext?: string;
  pacingNote?: string;
  recentChaptersBlock?: string;
}): ChatMessage[] {
  const {
    meta,
    hero,
    heroEvent,
    world,
    nearbyWorldEvents,
    nearbySupportEvents,
    supportNames,
    enhancementCollision,
    powerSystem,
    characterAssets,
    arcContext,
    pacingNote,
    recentChaptersBlock,
  } = input;

  const heroCtx = `主角行动 [${heroEvent.id}] 第${heroEvent.day}天 @${heroEvent.location}
标题：${heroEvent.title}
意图：${heroEvent.intent}
约束：${heroEvent.constraints.join('、') || '无'}
情绪：${heroEvent.emotionalState ?? '未标注'}
已知信息：${heroEvent.knownWorldFacts.join('；') || '无'}`;

  const worldCtx =
    nearbyWorldEvents.length > 0
      ? nearbyWorldEvents
          .map((e) => `世界：第${e.day}天 ${e.title} @${e.location} (${e.visibility}) ${e.description}`)
          .join('\n')
      : '（本章附近无显式世界线事件）';

  const supportCtx =
    nearbySupportEvents.length > 0
      ? nearbySupportEvents
          .map((e) => {
            const who = supportNames.get(e.characterId) ?? e.characterId;
            return `配角：第${e.day}天 ${who} ${e.title} @${e.location} 意图:${e.intent} 主角感知:${e.protagonistAwareness}`;
          })
          .join('\n')
      : '（本章附近无配角隐线事件）';

  const collisionCtx = enhancementCollision
    ? `【可插入的碰撞增强】
标题：${enhancementCollision.title}
类型：${enhancementCollision.collisionType}
表层冲突：${enhancementCollision.surfaceConflict}
隐藏因果：${enhancementCollision.hiddenCausality}
碰撞理由：${enhancementCollision.rationale}
读者揭示级别：${enhancementCollision.readerRevealLevel} / 主角揭示级别：${enhancementCollision.heroRevealLevel}`
    : '【碰撞增强】本章无预置碰撞，以主人公线日常推进为主；若配角线事件与主角同日同地，可作为表层阻碍或误会来源。';

  const powerCtx = powerSystem
    ? [
        `体系：${powerSystem.systemName}，核心：${powerSystem.coreEnergy}`,
        `阶位：${powerSystem.ranks.map((r) => `${r.id}:${r.name}`).join(' / ')}`,
      ].join('\n')
    : '未生成结构化战力体系';

  const assetCtx =
    characterAssets?.characters
      .map((c) => {
        const rank =
          powerSystem?.ranks.find((r) => r.id === c.currentRankId)?.name ?? c.currentRankId ?? '未入阶';
        return `${c.name}(${c.role})：${rank}；能力=${c.abilities.join('、') || '无'}；物品=${c.inventory.map((i) => `${i.name}/${i.status}`).join('、') || '无'}`;
      })
      .join('\n') || '暂无角色资产';

  return [
    {
      role: 'system',
      content: `你是章节事件包编剧。本章以主人公线行动为主轴，读者全程跟随主角视角。

核心原则：
- 章节必须回答：主角此刻想要什么、知道什么、不知道什么、遇到什么阻碍、做了什么选择、得到什么结果
- 世界线/配角线是隐线，只能通过主角可观察到的异常、对话、误会、规则限制渗透进正文
- 若有碰撞增强，把它嵌入主角行动过程中，而不是让主角被动目击幕后真相
- hiddenCausality 只供系统存档，不得出现在 sceneBeats 明线节拍中
- shadowHints 必须是可观察暗示，不得直述幕后计划
- 作品设定、世界观引导和分卷目标只是素材来源，不得覆盖章节节奏底线；即使设定强调制度/资源/规则，也必须落到人物交锋、任务成败、公开结果或行动选择里
- 本章必须有一个一句话卖点：让读者觉得「这场戏值得看」，优先人物交锋、公开胜负、身份误会、势力站队、外出险境、同门恩怨、突破契机；制度钻空子可作手段，不能当整章主题
- 场景要有画面与 stakes：演武胜负、任务险境、宴饮暗斗、坊市捡漏、秘境边缘、长老问话、同门赌约、外出护送等；办事场景（排队、登记、核细则、远距观察）全章最多 1～2 个节拍，且须服务于更大目标，禁止整章围着贡献点/公示阁/积分底簿打转
- 趣味来自反差和选择：主角可以怕麻烦、会吐槽、会钻规则空子，但必须主动做出判断，而不是只被系统/长老/人群推着走

章节尺度（硬性）：
- 每章至少 1 个「大格戏」：公开对决、任务成败、关系破裂或结盟、境界/战力可见变化、势力正面施压、险地脱身等，让读者能一句话说清「本章发生了什么大事」
- 连续 2 章不得核心场景同为：贡献点阁/公示阁查账、积分底簿核验、巡视路径远距观察、笔迹/朱砂/印泥微观比对
- 制度、资源、积分细节只能作背景或一个节拍，不能占据 3 条以上 hero beat

输出 JSON：{
  title, timeWindow, day, location, worldEventsInPlay[], heroIntent, collisionType,
  surfaceConflict, hiddenCausality,
  sceneBeats: [{ line: "hero"|"shadow-hint", beat: string }],
  shadowHints: string[],
  readerGains[], heroGains[], foreshadowing[], worldStateChanges[], heroStateChanges[]
}

${COLLISION_TYPE_PROMPT_HINT}
无预置碰撞增强时，collisionType 选最贴近表层阻碍的一项；人物冲突、公开胜负、价值抉择优先用 relationship 或 value，勿默认 resource。勿用 minor-friction 等自造词。
若有碰撞增强，collisionType 必须与增强块中的类型一致。

sceneBeats 至少 7 个，建议：
1 hero（开场钩子：具体地点 + 主角目标 + 一个有趣异常/麻烦）
1 hero（第一层阻碍：人物/规则/环境，写清失败代价；避免纯「查账/核细则」）
1 hero（人物交锋：对话、赌约、误会、站队、挑衅、拉拢任选其一）
1 shadow-hint（隐线异常，必须是主角可观察且可误读的细节）
1 hero（大格戏推进：试炼胜负、任务转折、公开对峙、险境抉择、关系变化）
1 hero（主角主动试探/设局/借势破局，不能只是等待或远距偷看）
1 hero（小爽点闭环：主角用观察/胆识/技巧获得明确、可感知的收益）
1 hero（余波与下一步：留下新问题，但本章结果要清楚）

额外要求：
- surfaceConflict 必须写成“当下可见麻烦”，不要写抽象主题；读者一眼能知道主角正在被什么卡住
- sceneBeats 每条都要能直接扩写成一场或半场正文，不要使用“局势复杂”“暗流涌动”“命运开始转动”等空泛句
- 至少 2 条 hero beat 要包含可写对话或人物互动，避免整章只有旁白推进
- heroGains 不得超过 readerGains 的信息量；heroGains 至少包含一项可感知收益：关键线索、物件入手、关系变化、公开胜负、行动资格、境界/战力推进；「搞清某条细则措辞」 alone 不算合格收益

反重复硬性约束：
- 不得与【近期已写章节】重复同一核心场景（例如连续多章都是同一对手、同一擂台、同一套对练流程）
- 不得连续两章以贡献点阁/公示阁/积分底簿/巡视偷看为核心；若上章已是办事查账类，本章必须换场景类型
- 若主角节点主轴是登记、领资源、勘察、旁听、打探等非战斗意图，对练/比武最多占 1 条 sceneBeat 小插曲，不得扩写成完整两回合对练章
- title 必须与近期章节标题明显区分；禁止复用近期章节标题或仅改一两个字的同义标题
- 若节点意图已在对练/比武中兑现，本章应写该节点的余波、后续调查、规则变化或新地点行动，而不是再打一遍`,
    },
    {
      role: 'user',
      content: `作品：${meta.title} 主角：${meta.protagonist} 文风：${meta.style}

主角当前总目标：${hero.protagonistGoal}
当前危机：${hero.crisis ?? '无'}
世界当前：第${world.currentDay}天

【本章主轴 — 主人公行动】
${heroCtx}

${collisionCtx}

【附近世界线事件】
${worldCtx}

【附近配角线事件】
${supportCtx}

【战力体系】
${powerCtx}

【角色资产】
${assetCtx}

${arcContext ? `【当前分卷】\n${arcContext}` : ''}
${pacingNote ? `【连载节奏】${pacingNote}` : ''}

【近期已写章节 — 禁止重复以下核心剧情】
${recentChaptersBlock ?? '（尚无已写章节）'}`,
    },
  ];
}
