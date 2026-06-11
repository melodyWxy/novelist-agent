import type { ChatMessage } from '../llm/client.js';
import type { NovelMeta } from '../novel/types.js';
import type { WorldBible, WorldTimeline, SupportTimeline } from '../narrative/types.js';

/** 配角隐线 Tick：世界线推进后，配角各自推进目标 */
export function buildSupportTickPrompt(
  meta: NovelMeta,
  bible: WorldBible,
  world: WorldTimeline,
  support: SupportTimeline,
  fromDay: number,
  toDay: number
): ChatMessage[] {

  const characters = bible.supportCharacters
    .map((c) => `[${c.id}] ${c.name}（${c.role}）目标:${c.goals.join('、')}`)
    .join('\n');

  const recentWorld = world.events
    .filter((e) => e.day >= fromDay - 3 && e.day <= toDay)
    .sort((a, b) => b.day - a.day)
    .slice(0, 8)
    .map((e) => `第${e.day}天 ${e.title} @${e.location} [${e.id}] (${e.visibility})`)
    .join('\n');

  const recentSupport = support.events
    .sort((a, b) => b.day - a.day)
    .slice(0, 8)
    .map(
      (e) =>
        `第${e.day}天 [${e.characterId}] ${e.title} @${e.location}${e.locked ? ' [锁定]' : ''}`
    )
    .join('\n');

  return [
    {
      role: 'system',
      content: `你是配角隐线推进器（Support Tick）。世界线已推进到第 ${toDay} 天，请为各配角生成第 ${fromDay}～${toDay} 天的幕后行动。
输出 JSON：{ events: [{ characterId, day, title, intent, location, protagonistAwareness, worldEventIds[] }], resolvedEventIds?: [] }
要求：
- 每个配角 0～2 个新节点，合计 1～4 个
- 行动由配角目标 + 近期世界动态推导，非主角 POV
- protagonistAwareness 默认 none；街头传闻/痕迹用 rumor，主角可能撞见边角用 partial
- worldEventIds 关联触发本次行动的世界事件 id
- resolvedEventIds 可标记已完结的配角事件 id`,
    },
    {
      role: 'user',
      content: `作品：${meta.title}

【配角】
${characters || '（无配角）'}

【近期世界动态】
${recentWorld || '（无）'}

【近期配角行动】
${recentSupport || '（尚无）'}`,
    },
  ];
}
