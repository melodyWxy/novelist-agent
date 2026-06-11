import type { ChatMessage } from '../llm/client.js';
import type { NovelMeta } from '../novel/types.js';
import type { WorldBible, WorldTimeline } from '../narrative/types.js';

/** 世界线 Tick：势力根据目标推进下一步行动 */
export function buildWorldTickPrompt(
  meta: NovelMeta,
  bible: WorldBible,
  world: WorldTimeline,
  tickDays: number
): ChatMessage[] {
  const fromDay = world.currentDay + 1;
  const toDay = world.currentDay + tickDays;

  const recent = world.events
    .sort((a, b) => b.day - a.day)
    .slice(0, 8)
    .map(
      (e) =>
        `[${e.id}] 第${e.day}天 ${e.title} @${e.location} (${e.visibility})${e.locked ? ' [锁定]' : ''} ${e.description}`
    )
    .join('\n');

  const factions = bible.factions
    .map(
      (f) =>
        `${f.id}:${f.name} 目标:${f.goals.join('、')} 资源:${f.resources.join('、') || '未细化'} 关系:${Object.entries(f.relationships)
          .map(([id, rel]) => `${id}=${rel}`)
          .join('；') || '未细化'}`
    )
    .join('\n');

  const worldBase = [
    `地理：${bible.geography.join('；') || '未细化'}`,
    `核心矛盾：${bible.coreConflicts.join('；') || '未细化'}`,
    `体系：${bible.powerSystem ?? '未细化'}`,
  ].join('\n');

  return [
    {
      role: 'system',
      content: `你是世界模拟器（WorldSimulator）。根据势力目标推进世界线隐线，生成第 ${fromDay}～${toDay} 天的幕后事件。
输出 JSON：{
  events: [{ day, title, description, location, factionIds[], visibility, consequences[] }],
  resolvedEventIds: [],
  biblePatch?: {
    geographyAdditions: string[],
    coreConflictAdditions: string[],
    factionUpdates: [{ factionId, goalsAdditions: string[], resourcesAdditions: string[], relationships: Record<string,string> }]
  }
}
要求：
- 事件由势力目标推导，非随机灾害
- 每次 tick 都要小步扩展世界观：新增 1～3 条地点/制度/资源/禁忌/地方生态，或更新势力资源与关系
- 新增设定必须由本次事件自然带出，不能凭空百科式堆设定
- 地点建议写成「地名·读者能理解的功能/危险/生活细节」，例如「铁灯巷·夜市医馆与黑票交易混杂」
- 核心矛盾新增应服务长篇连载：资源分配、阶层压迫、旧案遗留、地域冲突、技术/修炼代价等
- 势力更新只能使用已有 factionId；不要新增势力 id
- day 必须在 ${fromDay}～${toDay} 之间
- 不要修改或复述已锁定事件，resolvedEventIds 可标记已完结的非锁定事件 id
- visibility 为 public/rumor/secret`,
    },
    {
      role: 'user',
      content: `作品：${meta.title}（${meta.genre}）
当前世界时间：第 ${world.currentDay} 天
本次推进：${tickDays} 天（至第 ${toDay} 天）

世界观底座：
${worldBase}

势力：
${factions}

近期世界线：
${recent || '（尚无事件）'}`,
    },
  ];
}
