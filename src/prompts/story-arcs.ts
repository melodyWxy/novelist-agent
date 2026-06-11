import type { ChatMessage } from '../llm/client.js';
import type { NovelMeta } from '../novel/types.js';
import type { PowerSystemFile, WorldBible } from '../narrative/types.js';

export function buildStoryArcsPrompt(
  meta: NovelMeta,
  bible: WorldBible,
  powerSystem: PowerSystemFile
): ChatMessage[] {
  const targetWords = meta.targetWordCount ?? 2_000_000;
  const estChapters = Math.max(60, Math.round(targetWords / 3300));
  const volumeCount = Math.min(12, Math.max(6, Math.round(estChapters / 80)));

  return [
    {
      role: 'system',
      content: `你是长篇网文总编剧，负责把作品拆成可连载的分卷阶段大纲。
每卷要有独立阶段目标、阶段反派、战力上限、爽点节拍，能支撑几十万字连载而不跑偏。
输出精简 JSON，不要 Markdown。`,
    },
    {
      role: 'user',
      content: `作品：${meta.title}
题材：${meta.genre}
主角：${meta.protagonist}
目标总字数：约 ${targetWords} 字（预估 ${estChapters} 章，每章约 3300 字）
请规划 ${volumeCount} 卷左右。

【世界】${bible.era}
核心矛盾：${bible.coreConflicts.join('；')}
势力：${bible.factions.map((f) => f.name).join('、')}

【战力体系】${powerSystem.systemName}
阶位：${powerSystem.ranks.map((r) => `${r.id}/${r.name}`).join('、')}

输出 JSON：
{
  "currentArcId": "arc_01",
  "arcs": [
    {
      "id": "arc_01",
      "volumeNumber": 1,
      "name": "卷名",
      "chapterStart": 1,
      "chapterEnd": 80,
      "phaseGoal": "本卷主角要达成的阶段目标",
      "antagonist": "本卷主要对手/阻力",
      "powerCeilingRankId": "rank_02",
      "payoffBeats": ["卷内关键爽点1", "卷内关键爽点2"],
      "status": "active"
    }
  ]
}

要求：
- 第一卷 status=active，其余 planned
- 第一卷的核心职责是“带读者进入世界”：phaseGoal 必须包含世界观引导目标，让读者逐步理解地理、阶层、势力、修行/能力规则、资源链和主角所处位置
- 第一卷 payoffBeats 至少包含 2 条世界观认知爽点，例如“看清底层资源如何被垄断”“第一次理解某势力规则并反制”“发现修行代价与阶层压迫的关系”
- 第一卷不要过早进入纯谜团推进；悬念要建立在读者已经看懂世界基本规则之后
- chapterStart/chapterEnd 连续覆盖 1～${estChapters}，不重叠不留空
- powerCeilingRankId 必须来自已有 rank id，且随卷递进
- 每卷 payoffBeats 至少 2 条，体现升级/打脸/揭秘/夺宝等节奏`,
    },
  ];
}
