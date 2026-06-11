import type { ChatMessage } from '../llm/client.js';
import type { NovelMeta } from '../novel/types.js';

export function buildWorldBiblePrompt(meta: NovelMeta): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `你是世界观架构师，擅长构建${meta.genre}题材的宏大世界。
输出精简 JSON（单条描述尽量 ≤40 字，避免冗长对象），字段：
- era: 字符串
- geography: 字符串数组，每项为「地名·简短特征」，如 ["清光峰·上古洞府","万宝坊·三界集市"]，禁止用 {id,name} 对象
- powerSystem: 字符串
- coreConflicts: 字符串数组
- factions: [{ id, name, type, goals[], resources[], relationships{} }]
- supportCharacters: [{ id, name, role, goals[], factionId?, traits[] }]
要求：
- 这是百万字级长篇的“可扩展世界种子”，不是短篇背景板
- 地理至少 8 处，覆盖政治中心、边陲、资源地、底层生活区、禁区/遗迹、交通节点、黑市/灰产、主角早期活动区
- 势力至少 5 个，必须有不同层级：统治/宗门或军政、商业或资源垄断、地方基层、秘密组织、边缘反抗者
- 核心矛盾至少 5 条，覆盖资源、阶层、旧案、制度代价、外部威胁或认知误区
- 每个势力 resources 至少 2 条，relationships 至少写 2 个与其他势力的张力
- 配角 5～8 名，各有独立目标且非主角本人
- 保留“待扩展空间”：不要一次性解释所有终极真相，但要留下能继续长线生长的制度、地理、利益链`,
    },
    {
      role: 'user',
      content: `为以下作品构建世界 Bible：
书名：${meta.title}
题材：${meta.genre}
主角：${meta.protagonist}
文风：${meta.style}
${meta.worldSetting ? `世界观简述：${meta.worldSetting}` : ''}`,
    },
  ];
}

export function buildWorldTimelinePrompt(
  meta: NovelMeta,
  bible: { era: string; factions: { id: string; name: string; goals: string[] }[] },
  eventCount = 20,
  startDay = 1
): ChatMessage[] {
  const factions = bible.factions.map((f) => `${f.id}:${f.name} 目标:${f.goals.join('、')}`).join('\n');
  return [
    {
      role: 'system',
      content: `你是世界线编剧。生成幕后大势事件，不围绕主角，而是势力博弈、阴谋、战争、灾害。
输出 JSON：{ events: [{ day, title, description, location, factionIds[], visibility, consequences[] }] }
day 从 ${startDay} 起，生成 ${eventCount} 个事件，时间跨度合理分布。visibility 为 public/rumor/secret。
要求事件能持续拓展世界观：每 3～5 个事件至少带出一个新地点功能、资源链、制度规则或势力关系变化；不要只围绕同一个地点反复打转。`,
    },
    {
      role: 'user',
      content: `作品：${meta.title}（${meta.genre}）
时代：${bible.era}
势力：
${factions}`,
    },
  ];
}
