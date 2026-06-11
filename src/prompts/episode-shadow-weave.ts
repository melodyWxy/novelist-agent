import type { ChatMessage } from '../llm/client.js';
import type { NovelMeta } from '../novel/types.js';
import type { CharacterAssetsFile, EpisodePlan, PowerSystemFile } from '../narrative/types.js';

/**
 * 第二阶段：隐线织入
 * 在明线草稿中嵌入暗示，不破坏 POV
 */
export function buildEpisodeShadowWeavePrompt(input: {
  meta: NovelMeta;
  episode: EpisodePlan;
  surfaceDraft: string;
  forbiddenTerms?: string[];
  targetWords?: number;
  powerSystem?: PowerSystemFile | null;
  characterAssets?: CharacterAssetsFile | null;
}): ChatMessage[] {
  const { meta, episode, surfaceDraft, forbiddenTerms = [], targetWords = 3500, powerSystem, characterAssets } = input;
  const shadowBeats = episode.sceneBeats.filter((b) => b.line === 'shadow-hint');
  const hints =
    episode.shadowHints.length > 0
      ? episode.shadowHints
      : shadowBeats.map((b) => b.beat);
  const assetContext =
    characterAssets?.characters
      .map((c) => {
        const rank = powerSystem?.ranks.find((r) => r.id === c.currentRankId)?.name ?? c.currentRankId ?? '未入阶';
        return `${c.name}：${rank}；能力=${c.abilities.join('、') || '无'}；物品=${c.inventory.map((i) => `${i.name}/${i.status}`).join('、') || '无'}`;
      })
      .join('\n') || '暂无';

  return [
    {
      role: 'system',
      content: `你是${meta.genre}网络小说作家，文风：${meta.style}。
你是「隐线织入师」，负责第二阶段：在明线草稿中织入世界线隐线暗示。

【最高优先级】
- 保持正文明快、细腻、有趣、读得懂；隐线暗示不得让章节变成谜语
- 如果暗示会让读者看不清主角目标、阻碍、动作因果或本章收益，必须放弃该暗示或改成更生活化的边角细节
- 不要新增含混神秘句式，例如“仿佛某种不可言说的力量”“那个人早已注视一切”；暗示必须落在可见物件、声音、气味、表情、价格、规则、传闻上

【本阶段任务】
- 保留明线草稿的情节走向、对话主干、POV 不变
- 叙述人称必须保持第三人称；旁白不得改成“我/我们/咱”等第一人称叙事
- 将 shadowHints 以环境细节/道具/感官/对话潜台词嵌入正文
- 暗示 : 揭示 ≥ 3:1
- 在织入暗示时同步润色文笔：补足场景质感、人物神态、动作停顿和感官细节
- 不要只追加说明句；优先把暗示藏进物件状态、旁人反应、光影声响、主角误读中
- 每个新增细节都要推动氛围、人物关系或悬疑感，避免无效堆砌
- 不要为了织入暗示而重排成大量短段；保留原文自然段落节奏
- 人物对话必须独立分段；如果新增对话或换说话人，必须另起一段
- 不要为了达到字数反复描写同一道具或同一感官；篇幅不足时可以把后果、撤离、追踪、下一目标自然推进一小步

【织入纪律】
- 不得为了塞暗示而重复同一场目击、同一人物出场或同一道具反应
- 新增暗示必须服从既有空间关系；如果明线中主角在断碑后，就不要突然看清远处隐秘动作
- 暗示要增强“读者回味”，不能削弱冲突可读性；混战段落中每次新增细节都要有清楚的视线来源
- 保留并强化明线里的小爽点：主角主动判断、主动规避、主动拿到线索的瞬间不得被隐线说明淹没
- 保留战力边界：不得新增未在角色资产中铺垫过的高阶能力；物品变化必须能被读者看见

【本阶段禁止】
- 不得直述幕后计划、势力密谋、hiddenCausality 原词或同义改写
- 不得新增主角不可能知道的信息
- 不得用旁白揭示真相
${forbiddenTerms.length > 0 ? `- 正文禁止出现：${forbiddenTerms.join('、')}` : ''}

目标约 ${targetWords} 字，最低不要低于 ${Math.floor(targetWords * 0.9)} 字；如果剧情自然推进已完成，不要硬凑。只输出完整章节正文 Markdown，不要标题行或修改说明。`,
    },
    {
      role: 'user',
      content: `【作品】${meta.title} 主角：${meta.protagonist}

【明线草稿（请在此基础上织入暗示，勿推翻情节）】
${surfaceDraft}

【隐线暗示清单（必须自然嵌入，不可堆砌）】
${hints.map((h, i) => `${i + 1}. ${h}`).join('\n')}

【隐线节拍参考】
${shadowBeats.map((b, i) => `${i + 1}. ${b.beat}`).join('\n') || '（按暗示清单织入）'}

读者本章可多知道：${episode.readerGains.join('；') || '无'}
主角本章实际获得：${episode.heroGains.join('；') || '无'}

【角色战力/物品约束】
${assetContext}

请输出织入隐线暗示后的完整章节正文。`,
    },
  ];
}
