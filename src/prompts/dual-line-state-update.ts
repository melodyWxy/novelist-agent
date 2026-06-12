import type { ChatMessage } from '../llm/client.js';
import type { NovelMeta, StoryState } from '../novel/types.js';
import type {
  CharacterAssetsFile,
  EpisodePlan,
  HeroTimeline,
  PowerSystemFile,
  WorldTimeline,
} from '../narrative/types.js';

export function buildDualLineStateUpdatePrompt(input: {
  meta: NovelMeta;
  state: StoryState;
  episode: EpisodePlan;
  world: WorldTimeline;
  hero: HeroTimeline;
  chapterNumber: number;
  chapterContent: string;
  powerSystem?: PowerSystemFile | null;
  characterAssets?: CharacterAssetsFile | null;
}): ChatMessage[] {
  const { meta, state, episode, world, hero, chapterNumber, chapterContent, powerSystem, characterAssets } = input;
  const powerCtx = powerSystem
    ? `${powerSystem.systemName}：${powerSystem.ranks.map((r) => `${r.id}/${r.name}`).join('、')}`
    : '未生成';

  return [
    {
      role: 'system',
      content: `你是双线状态更新器。根据本章正文，更新世界线（隐线）、主人公线（明线）、故事记忆。

POV 规则（严格执行）：
- 世界线可完整更新幕后状态
- 主人公线 knownWorldFacts 只能来自事件包 heroGains，不得把 readerGains 或隐线真相写入主角已知信息
- newEvents 中 hero 的 knownWorldFacts 必须为空数组或 heroGains 的子集

输出 JSON：{ worldTimeline: { currentDay, eventUpdates[], newEvents[] }, heroTimeline: { protagonistGoal, crisis, eventUpdates[], newEvents[] }, storyState: { timeline, lastChapterSummary, characters[], foreshadowing[], openThreads[] }, characterAssets: { characters[] } }
eventUpdates 标记本章涉及的事件为 resolved 并填 usedInChapter。`,
    },
    {
      role: 'user',
      content: `作品：${meta.title} 主角：${meta.protagonist} 第${chapterNumber}章

【事件包】${episode.title} 第${episode.day}天
世界状态变化预期：${episode.worldStateChanges.join('；')}
主角状态变化预期：${episode.heroStateChanges.join('；')}

【主角本章实际获得（knownWorldFacts 只能来自此处）】
${episode.heroGains.join('；') || '无'}

【读者本章获得（不得写入主角 knownWorldFacts）】
${episode.readerGains.join('；') || '无'}

当前世界时间：第${world.currentDay}天，事件数 ${world.events.length}
当前主角目标：${hero.protagonistGoal}

【旧故事状态】${JSON.stringify(state, null, 0).slice(0, 1500)}

【战力体系】
${powerCtx}

【旧角色资产】${JSON.stringify(characterAssets ?? { characters: [] }, null, 0).slice(0, 3000)}

角色资产更新要求：
- characterAssets.characters 只返回本章发生变化的角色；若无变化返回 []
- 若某角色有变化，返回该角色完整资产对象（characterId/name/role/currentRankId/attributes/abilities/inventory/injuries/notes/updatedAt）
- inventory 中每个物品必须是对象：{ id, name, type, description, status, obtainedInChapter? }，不要只写字符串
- updatedAt 必须是 ISO 时间字符串；不确定可用当前章节时间占位：${new Date().toISOString()}
- 若本章没有明确突破，不要提高 currentRankId
- 获得/失去/损坏物品必须写进 inventory.status
- injuries 必须是字符串数组，如 ["左臂刀伤","灵力紊乱"]，每项是简短文字，不要写成 {description:...} 对象
- notes 必须是字符串数组，如 ["刚掌握引气术"]，不要写成单个字符串或对象
- 受伤、瓶颈、能力熟练度变化写进 injuries 或 notes
- 主角使用新能力必须能追溯到本章正文或既有资产

【本章正文】
${chapterContent.slice(0, 3000)}`,
    },
  ];
}
