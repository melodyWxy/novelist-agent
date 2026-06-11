import type { ChatMessage } from '../llm/client.js';
import type { NovelMeta } from '../novel/types.js';
import type {
  CharacterAssetsFile,
  HeroTimeline,
  PowerSystemFile,
  SupportTimeline,
  WorldBible,
  WorldTimeline,
} from '../narrative/types.js';

export function buildCollisionDesignerPrompt(
  meta: NovelMeta,
  world: WorldTimeline,
  hero: HeroTimeline,
  maxCollisions = 8,
  support?: SupportTimeline | null,
  bible?: WorldBible | null,
  powerSystem?: PowerSystemFile | null,
  characterAssets?: CharacterAssetsFile | null,
  pacingNote?: string
): ChatMessage[] {
  const worldEvents = world.events
    .map((e) => `[${e.id}] 第${e.day}天 ${e.title} @${e.location} (${e.visibility}) ${e.description}`)
    .join('\n');
  const heroEvents = hero.events
    .map((e) => `[${e.id}] 第${e.day}天 ${e.title} @${e.location} 意图:${e.intent}`)
    .join('\n');

  const charName = new Map((bible?.supportCharacters ?? []).map((c) => [c.id, c.name]));
  const supportEvents = (support?.events ?? [])
    .map((e) => {
      const who = charName.get(e.characterId) ?? e.characterId;
      return `[${e.id}] 第${e.day}天 ${who} ${e.title} @${e.location} 意图:${e.intent} 主角感知:${e.protagonistAwareness}`;
    })
    .join('\n');
  const powerCtx = powerSystem
    ? `${powerSystem.systemName}：${powerSystem.ranks.map((r) => `${r.id}/${r.name}`).join('、')}`
    : bible?.powerSystem || '未设定';
  const assetCtx =
    characterAssets?.characters
      .map((c) => `${c.name}：阶位=${c.currentRankId ?? '未入阶'}；能力=${c.abilities.join('、') || '无'}；物品=${c.inventory.map((i) => i.name).join('、') || '无'}；伤势=${c.injuries.join('、') || '无'}`)
      .join('\n') || '暂无';

  return [
    {
      role: 'system',
      content: `你是碰撞引擎设计师。扫描世界线、配角隐线与主人公线，发现能形成剧情的交叉点。
世界线=势力级隐线，配角线=人物级隐线，主人公线=明线。优先推荐「明线冲突强、隐线可藏住」的碰撞。

碰撞类型：time/location/resource/value/information/relationship。
输出 JSON：{ collisions: [{
  title, collisionType, worldEventIds[], heroEventIds[], supportEventIds[]?, day, location,
  rationale, surfaceConflict, hiddenCausality,
  readerRevealLevel, heroRevealLevel,
  disclosureRisk, surfaceStrength, causalTightness,
  risks[]
}] }

评分说明：
- disclosureRisk：本章写作时隐线暴露风险（low/medium/high），information/value 碰撞通常 lower
- surfaceStrength：明线冲突能否撑起一章（low/medium/high）
- causalTightness：是否由双方目标推导而非巧合（low/medium/high）

要求：每个碰撞必须引用真实 event id；给出因果解释；生成 ${maxCollisions} 个候选，按 surfaceStrength 高、disclosureRisk 低、创意独特度高 排序。

优先推荐具备章节容量和爽点潜力的碰撞：
- 主角有明确当下目标，并能用观察、胆识、技巧或信息差主动破局
- 表层冲突有清楚空间关系和失败代价，适合写成读者看得懂的动作/博弈场景
- 本章能给主角一个小胜利或明确收益，而不是只让主角被动目击隐线
- 优先挖掘战力体系相关碰撞：突破资源、功法线索、阶位压制、旧伤代价、物品损坏/觉醒、对手误判主角战力
- 冲突必须至少包含 2 次可写成场景的转折：误判/阻断/追逐/谈判破裂/物件异动/身份压力/第三方插手任选其二
- 每个碰撞应能自然撑起 3300 字以上章节：开场目标、阻碍升级、主角主动破局、余波推进都要有内容
- 鼓励更有新鲜感的碰撞创意：信息差、资源错配、价值观冲突、临时同盟、误认身份、公开场合暗斗、规则漏洞等，避免只给“偶遇混战”
- 若场面是多人混战，必须能拆成清晰的局部对抗，不推荐纯混乱群像冲突。`,
    },
    {
      role: 'user',
      content: `作品：${meta.title} 主角：${meta.protagonist}

【世界线事件】
${worldEvents}

【主人公线事件】
${heroEvents}

【配角隐线事件】
${supportEvents || '（无）'}

【战力体系】
${powerCtx}

【角色资产】
${assetCtx}

主角当前目标：${hero.protagonistGoal}
当前危机：${hero.crisis ?? '无'}

${pacingNote ? `【连载节奏建议】${pacingNote}` : ''}`,
    },
  ];
}
