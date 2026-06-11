import type { ChatMessage } from '../llm/client.js';
import type { NovelMeta } from '../novel/types.js';
import type {
  Collision,
  WorldTimeline,
  HeroTimeline,
  PowerSystemFile,
  CharacterAssetsFile,
} from '../narrative/types.js';

export function buildEpisodePlannerPrompt(
  meta: NovelMeta,
  collision: Collision,
  world: WorldTimeline,
  hero: HeroTimeline,
  powerSystem?: PowerSystemFile | null,
  characterAssets?: CharacterAssetsFile | null,
  arcContext?: string,
  pacingNote?: string
): ChatMessage[] {
  const worldCtx = collision.worldEventIds
    .map((id) => world.events.find((e) => e.id === id))
    .filter(Boolean)
    .map((e) => `世界：第${e!.day}天 ${e!.title} — ${e!.description}`)
    .join('\n');
  const heroCtx = collision.heroEventIds
    .map((id) => hero.events.find((e) => e.id === id))
    .filter(Boolean)
    .map((e) => `主角：第${e!.day}天 ${e!.title} — 意图:${e!.intent}`)
    .join('\n');
  const powerCtx = powerSystem
    ? [
        `体系：${powerSystem.systemName}，核心：${powerSystem.coreEnergy}`,
        `阶位：${powerSystem.ranks.map((r) => `${r.id}:${r.name}`).join(' / ')}`,
        `进阶规则：${powerSystem.progressionRules.join('；')}`,
      ].join('\n')
    : '未生成结构化战力体系';
  const assetCtx =
    characterAssets?.characters
      .map((c) => {
        const rank = powerSystem?.ranks.find((r) => r.id === c.currentRankId)?.name ?? c.currentRankId ?? '未入阶';
        return `${c.name}(${c.role})：${rank}；能力=${c.abilities.join('、') || '无'}；物品=${c.inventory.map((i) => `${i.name}/${i.status}`).join('、') || '无'}；伤势=${c.injuries.join('、') || '无'}`;
      })
      .join('\n') || '暂无角色资产';

  return [
    {
      role: 'system',
      content: `你是章节事件包编剧。把一次双线碰撞转成可写作的结构化事件包。

叙事原则：世界线是隐线（系统掌握），主人公线是明线（读者跟随主角视野）。
- hiddenCausality 只供系统存档，不得出现在 sceneBeats 明线节拍中
- shadowHints 是唯一能渗透进正文的隐线表达，必须是可观察的暗示（环境/道具/对话潜台词），不得直述幕后计划
- 默认章节读感必须明快、细腻、有趣：读者读完本章要能复述“主角想要什么、遇到什么阻碍、做了什么选择、得到什么结果”
- 暗线只能增加回味，不能让本章像谜语；如果某个暗示会牺牲明线可读性，宁可删掉或改成生活化细节

输出 JSON：{
  title, timeWindow, day, location, worldEventsInPlay[], heroIntent, collisionType,
  surfaceConflict, hiddenCausality,
  sceneBeats: [{ line: "hero"|"shadow-hint", beat: string }],
  shadowHints: string[],
  readerGains[], heroGains[], foreshadowing[], worldStateChanges[], heroStateChanges[]
}

sceneBeats 至少 7 个，建议结构：
1 个 hero（明线开场：主角目标、空间锚点、失败代价）
1 个 hero（第一层阻碍：人物/规则/地形/资源限制）
1 个 shadow-hint（隐线异常信号，主角可误读）
1 个 hero（主角主动试探或小设局）
1 个 hero（阻碍升级或第三方插手，形成第二场景）
1 个 shadow-hint（换一种载体暗示，不重复上一暗示）
1 个 hero（小爽点闭环与余波推进）
shadowHints 至少 3 条，每条都是「可写进正文的暗示句」，禁止复述 hiddenCausality 原文。
heroGains 必须是主角本章实际获得的信息，不得超过 readerGains 的信息量。

事件包还必须保证：
- surfaceConflict 写清楚主角的当下目标、可见阻碍、空间锚点和失败代价，不能只写“混战/争夺/追逐”
- sceneBeats 每条都要可拍成镜头，避免抽象词堆叠；禁止把关键节拍写成“局势更加复杂”“真相若隐若现”这类空话
- 第一条 hero 节拍必须让读者立刻站稳：地点是什么、主角为什么来、此刻最想解决什么
- 最后一条 hero 节拍必须明确本章结果：主角拿到什么、失去什么、下一步去哪
- 如果当前是第一卷/早期章节，事件包必须承担世界观引导：至少安排一个 hero 节拍，让主角通过交易、盘查、见闻、冲突、对话或失败代价理解一条世界规则
- 第一卷 readerGains 至少包含 1 条“读者更理解世界”的收益，例如地点功能、阶层规则、势力资源、修行代价、资源链或主角所处阶层
- 世界观说明必须服务当场冲突，不能写成百科式旁白
- 事件包必须能自然撑起 3300 字以上章节：至少包含“进入场景、第一次阻碍、主角主动应对、阻碍升级、明确收益、短余波/下一步”六个可写段落模块
- 不要把冲突设计得过短；如果核心冲突单薄，主动增加一处合理的规则限制、误判、临时交易、第三方插手或追踪余波
- 可以适度增加碰撞创意，但不能违背已有世界线/主人公线；优先选择信息差、规则漏洞、公开场合暗斗、价值冲突、资源交换等更耐写的结构
- sceneBeats 中至少 1 个 hero 节拍必须是“小爽点闭环”：主角被压制或低估 → 主角主动判断/设局/反制 → 获得明确收益
- heroGains 至少包含 1 个可落地收益：线索、物件状态变化、视角优势、脱身机会、对手误判或他人改观
- 若本章涉及战斗/修炼/资源争夺，heroGains 或 heroStateChanges 必须写清楚战力收益、物品变化、伤势代价或瓶颈推进；不要让主角无因突破
- shadow-hint 不得让神秘人物反复近距离出现；同一隐线暗示优先用不同载体承接（气味、残留物、旁人反应、道具异动）`,
    },
    {
      role: 'user',
      content: `作品：${meta.title} 主角：${meta.protagonist} 文风：${meta.style}

【已选碰撞】
标题：${collision.title}
类型：${collision.collisionType}
地点：${collision.location}
表层冲突：${collision.surfaceConflict}
隐藏因果：${collision.hiddenCausality}
碰撞理由：${collision.rationale}
读者揭示级别：${collision.readerRevealLevel} / 主角揭示级别：${collision.heroRevealLevel}

${worldCtx}
${heroCtx}

【战力体系】
${powerCtx}

【角色资产】
${assetCtx}

${arcContext ? `【当前分卷】\n${arcContext}` : ''}
${pacingNote ? `【连载节奏】${pacingNote}` : ''}`,
    },
  ];
}
