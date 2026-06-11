import type { ChatMessage } from '../llm/client.js';
import type { NovelMeta } from '../novel/types.js';
import type { HeroTimeline, WorldTimeline, SupportTimeline, WorldBible } from '../narrative/types.js';

/** 主人公线 Tick：根据当前目标生成下一步行动 */
export function buildHeroTickPrompt(
  meta: NovelMeta,
  hero: HeroTimeline,
  world: WorldTimeline,
  fromDay: number,
  toDay: number,
  bible?: WorldBible | null,
  support?: SupportTimeline | null
): ChatMessage[] {

  const recentHero = hero.events
    .sort((a, b) => b.day - a.day)
    .slice(0, 6)
    .map((e) => `第${e.day}天 ${e.title} 意图:${e.intent} @${e.location}${e.locked ? ' [锁定]' : ''}`)
    .join('\n');

  const perceptible = world.events
    .filter((e) => e.visibility !== 'secret' && e.day <= toDay)
    .slice(-6)
    .map((e) => `第${e.day}天 ${e.title}（${e.location}）`)
    .join('\n');

  const charName = new Map((bible?.supportCharacters ?? []).map((c) => [c.id, c.name]));
  const supportRipples = (support?.events ?? [])
    .filter((e) => e.protagonistAwareness !== 'none' && e.day <= toDay)
    .slice(-4)
    .map((e) => {
      const who = charName.get(e.characterId) ?? e.characterId;
      const level = e.protagonistAwareness === 'rumor' ? '传闻' : '部分察觉';
      return `第${e.day}天 ${level}：${who}在${e.location}一带有异动（${e.title}）`;
    })
    .join('\n');

  return [
    {
      role: 'system',
      content: `你是主人公线推进器（HeroPlanner Tick）。根据主角当前目标与限制，生成第 ${fromDay}～${toDay} 天的行动节点。
输出 JSON：{ protagonistGoal?, crisis?, events: [{ day, title, intent, location, constraints[], emotionalState?, knownWorldFacts[] }] }
要求：
- 主角是有限视野行动者，knownWorldFacts 不得包含 secret 世界线真相
- 生成 1～3 个行动节点，day 在 ${fromDay}～${toDay}
- 可更新 protagonistGoal / crisis 以反映形势变化`,
    },
    {
      role: 'user',
      content: `作品：${meta.title}
主角：${meta.protagonist}
当前目标：${hero.protagonistGoal}
当前危机：${hero.crisis ?? '无'}

近期主角行动：
${recentHero || '（尚无行动）'}

主角可感知的世界动态：
${perceptible || '（暂无公开动态）'}

主角可能听说的配角涟漪（不得当作确证事实，仅 rumor/partial）：
${supportRipples || '（无）'}`,
    },
  ];
}
