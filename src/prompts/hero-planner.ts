import type { ChatMessage } from '../llm/client.js';
import type { NovelMeta } from '../novel/types.js';
import type { WorldTimeline } from '../narrative/types.js';

export function buildHeroTimelinePrompt(
  meta: NovelMeta,
  worldTimeline: WorldTimeline | null,
  eventCount = 20,
  startDay = 1
): ChatMessage[] {
  const publicEvents = worldTimeline?.events
    .filter((e) => e.visibility !== 'secret')
    .slice(0, 10)
    .map((e) => `第${e.day}天 ${e.title}（${e.location}）`)
    .join('\n');

  return [
    {
      role: 'system',
      content: `你是主人公线编剧。主角是有限信息、有限资源的行动者。
输出 JSON：{ protagonistGoal, crisis, events: [{ day, title, intent, location, constraints[], emotionalState, knownWorldFacts[] }] }
生成 ${eventCount} 个行动节点，day 从 ${startDay} 起。主角不知道世界线秘密，knownWorldFacts 只能包含公开/传闻信息。
节点须覆盖多种场景类型（任务、试炼、社交、外出、修炼、权斗），不要连续多个都是贡献点/公示阁/查账办事；title 简洁有戏，不要写成巡查流程清单。`,
    },
    {
      role: 'user',
      content: `作品：${meta.title}
主角：${meta.protagonist}
文风：${meta.style}
${publicEvents ? `主角可能感知到的世界动态：\n${publicEvents}` : '世界线尚未公开事件'}`,
    },
  ];
}
