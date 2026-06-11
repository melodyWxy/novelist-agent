import type { ChatMessage } from '../llm/client.js';
import type { AssistantScope } from '../assistant/types.js';

const SCOPE_HINTS: Record<AssistantScope, string> = {
  overview:
    '总览：可调势力目标、调度设置、启停产出。内容修改优先用 timeline_patch（updateFactionGoals）或 world_bible；Agent 可 build_universe、universe_tick、narrative_cycle、stop_production、enable_schedule。',
  timeline:
    '双线时间轴：可移动/修改世界线、配角隐线、主人公线事件。内容修改用 timeline_patch（move/update/add 各类事件）；Agent 可 universe_tick、discover_collisions。',
  world:
    '世界线：修改世界事件天/描述/锁定，或添加事件。用 timeline_patch；Agent 可 universe_tick。',
  support:
    '配角隐线：修改配角行动与目标。用 timeline_patch（support 相关 op）或 world_bible（配角档案）；Agent 可 universe_tick。',
  hero:
    '主人公线：修改主角目标/危机与行动。用 timeline_patch（hero 相关 op）；Agent 可 universe_tick。',
  power:
    '战力与资产：替换战力体系、角色资产、分卷大纲。用 power_system / character_assets / story_arcs 整文件写回（data 为完整 JSON 对象，保留既有 id 与时间戳字段）。',
  collisions:
    '碰撞工坊：标记必须发生、拒绝碰撞。用 collision_patch；Agent 可 discover_collisions、plan_episode（需 collisionId）。',
  episodes:
    '章节产出：修改事件包或触发写作。用 episode 写回（data 为完整 EpisodePlan，须含 episodeNumber）；Agent 可 plan_episode、write_episode、narrative_cycle。',
  chapter:
    '章节正文：润色/改写整章或按审稿意见修改。必须优先用 chapter（data: { chapterNumber, title?, content }，content 为改好的完整正文）；只有用户明确要求重生成时才用 write_episode。不要用 power_system、story_arcs、timeline_patch 代替正文修复。',
};

const ACTION_CATALOG = `
允许的 agentActions.action（白名单，params 为可选 JSON 对象）：
- build_universe: { worldEventCount?, heroEventCount? }
- discover_collisions: { maxCollisions? }
- universe_tick: { tickDays?, autoDiscoverCollisions?, maxCollisions? }
- plan_episode: { collisionId } 必填
- write_episode: { episodeNumber, targetWords? } episodeNumber 必填
- narrative_cycle: { tickDays?, autoDiscoverCollisions?, maxCollisions?, collisionId?, episodeNumber?, targetWords?, skipWrite? }
- cycle_retry: {}
- stop_production: {}
- enable_schedule: { enabled?, cron?, mode?: "classic"|"narrative"|"narrative-auto", tickDays?, targetWords?, maxCollisions?, autoDiscoverCollisions? }

允许的 contentEdits.target（白名单，data 形状）：
- world_bible: 完整 WorldBible JSON（含 era, geography, factions, supportCharacters, generatedAt）
- timeline_patch: 单个 TimelinePatch 对象（op 如 updateWorldEvent, addHeroEvent, replacePowerSystem 等）
- collision_patch: { op: "update"|"reject", collisionId, required?, status? }
- power_system: 完整 PowerSystemFile
- character_assets: 完整 CharacterAssetsFile
- story_arcs: 完整 StoryArcsFile
- episode: 完整 EpisodePlan（collisionType 须为 time|location|resource|value|information|faction 之一；day 为 number）
- chapter: { chapterNumber: number, title?: string, content: string }
`.trim();

export function buildAssistantPrompt(
  scope: AssistantScope,
  instruction: string,
  contextJson: string
): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `你是小说创作工作台 AI 助手。用户会描述修改意图，你必须先给出可审阅的提案，不直接执行。

工作方式：
1. 阅读当前 scope 下的上下文 JSON
2. 根据用户 instruction 生成结构化提案
3. 只使用白名单内的 contentEdits.target 与 agentActions.action
4. 每项修改写清 label（短标题）与 summary（说明改什么、为什么）
5. risks 列出可能影响连续性的风险（如重写章节、改动锁定事件、启动自动产出）
6. 若用户请求超出白名单，在 summary 中说明限制，不要编造非法 action
7. 优先最小改动：能用一个 timeline_patch 就不要整文件替换
8. 不要修改 locked 为 true 的事件（除非用户明确要求且 risks 中警告）
9. 当 scope=chapter 且用户要求“修文章/修正文/按审稿意见修改/润色/重写”时，必须产出 contentEdits: [{ target: "chapter", data: { chapterNumber, title?, content } }]，其中 content 是修复后的完整章节正文。不得只修改设定文件、战力体系、卷纲或事件包来替代正文修复。
10. 当 scope=chapter 时，除非用户明确说“更新设定/更新战力体系/更新卷纲/更新事件包”，不要输出 chapter 以外的 contentEdits.target。

当前 scope：${scope}
${SCOPE_HINTS[scope]}

${ACTION_CATALOG}

只输出 JSON，格式：
{
  "summary": "本次建议总述",
  "risks": ["风险1"],
  "contentEdits": [{ "target": "timeline_patch", "label": "...", "summary": "...", "data": { ... } }],
  "agentActions": [{ "action": "universe_tick", "label": "...", "summary": "...", "params": { "tickDays": 1 } }]
}`,
    },
    {
      role: 'user',
      content: `用户指令：${instruction}

当前上下文：
${contextJson}`,
    },
  ];
}
