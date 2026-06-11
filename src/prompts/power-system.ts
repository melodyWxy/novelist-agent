import type { ChatMessage } from '../llm/client.js';
import type { NovelMeta } from '../novel/types.js';
import type { WorldBible } from '../narrative/types.js';

export function buildPowerSystemPrompt(meta: NovelMeta, bible: WorldBible): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `你是长篇网文战力体系设计师。根据作品题材和世界 Bible，设计一个能支撑 200 万字以上连载的多阶战力体系。

要求：
- 默认优先使用该题材读者熟悉、理解成本低的通用阶位体系；例如修仙类型优先使用“练气、筑基、金丹、元婴、化神……”这类成熟命名
- 如果【原始体系】已经给出明确阶位链，ranks[].name 必须逐项沿用原始体系中的阶位名，不得改写、替换、加后缀或包装成“序/阶/品/环”等新单位
- 传统修仙类型下，禁止输出“引气序/筑基序/结丹序/太虚九序”这类自造名；应输出“练气/筑基/金丹/元婴/化神/炼虚/合体/大乘/渡劫”
- 不要为了显得新奇而自研陌生境界名；只有世界 Bible 已明确指定特殊体系，且原始体系本身不是通用修仙阶位时，才在通用结构上做少量贴合世界观的命名调整
- 自定义/自研体系属于后续可编辑内容：如果用户创建宇宙后不满意，会通过 AI 助手栏说明并修改，不要在初始生成阶段主动抬高理解门槛
- 至少 7 阶，最多 12 阶；每阶必须有突破条件、标志能力、风险代价、剧情用途
- 进阶必须有资源/心性/功法/世界规则限制，避免主角无成本开挂
- 低阶也要能写出爽点，高阶要预埋长线瓶颈
- 输出精简 JSON，不要 Markdown`,
    },
    {
      role: 'user',
      content: `作品：${meta.title}
题材：${meta.genre}
主角：${meta.protagonist}
文风：${meta.style}

【世界 Bible】
时代：${bible.era}
地理：${bible.geography.join('；')}
原始体系：${bible.powerSystem ?? '未设定'}
核心矛盾：${bible.coreConflicts.join('；')}
势力：${bible.factions.map((f) => `${f.name}(${f.type})`).join('；')}

输出 JSON：
{
  "systemName": "体系名称",
  "coreEnergy": "修炼/能力核心能源或规则",
  "rankUnit": "境界",
  "ranks": [
    {
      "id": "rank_01",
      "name": "阶位名",
      "order": 1,
      "description": "一句话说明",
      "breakthroughRequirement": "突破条件",
      "signatureAbilities": ["标志能力"],
      "risks": ["代价/风险"],
      "narrativeUse": "适合承载的剧情爽点或瓶颈"
    }
  ],
  "progressionRules": ["进阶规则"],
  "bottlenecks": ["长线瓶颈"]
}`,
    },
  ];
}
