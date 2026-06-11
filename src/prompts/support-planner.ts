import type { ChatMessage } from '../llm/client.js';
import type { NovelMeta } from '../novel/types.js';
import type { WorldBible, WorldTimeline } from '../narrative/types.js';

/** 配角隐线种子：在世界线大势之后、主人公线之前生成 */
export function buildSupportTimelinePrompt(
  meta: NovelMeta,
  bible: WorldBible,
  world: WorldTimeline,
  eventCount = 8
): ChatMessage[] {
  const characters = bible.supportCharacters
    .map(
      (c) =>
        `[${c.id}] ${c.name}（${c.role}）目标:${c.goals.join('、')}${c.factionId ? ` 势力:${c.factionId}` : ''}`
    )
    .join('\n');

  const worldEvents = world.events
    .slice(0, 12)
    .map((e) => `第${e.day}天 ${e.title} @${e.location} [${e.id}]`)
    .join('\n');

  return [
    {
      role: 'system',
      content: `你是配角隐线编剧。配角有独立目标，在世界线推动下自然行动，主角通常感知不到。
输出 JSON：{ events: [{ characterId, day, title, intent, location, protagonistAwareness, worldEventIds[] }] }
要求：
- characterId 必须来自配角档案
- day 分布在 1～${world.currentDay}，生成 ${eventCount} 个左右
- protagonistAwareness 多为 none；仅当行动可能留下痕迹时用 rumor/partial
- worldEventIds 可引用近期世界线事件 id 表示因果关联
- 不得复述主角视角，写的是配角幕后行动`,
    },
    {
      role: 'user',
      content: `作品：${meta.title} 主角：${meta.protagonist}

【配角档案】
${characters || '（无配角，返回空 events）'}

【世界线大势（节选）】
${worldEvents}`,
    },
  ];
}
