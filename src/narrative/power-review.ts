/**
 * 战力一致性程序检测 — 补充 LLM 审稿
 */
import type {
  CharacterAsset,
  CharacterAssetsFile,
  EpisodePlan,
  PowerSystemFile,
} from './types.js';

export interface PowerConsistencyResult {
  ok: boolean;
  issues: string[];
}

const BREAKTHROUGH_RE = /突破|进阶|晋阶|破境|升阶|凝丹|筑基|金丹|元婴|化神|大乘|飞升/;
const POWER_UP_RE = /实力暴涨|修为暴涨|一步登天|瞬间变强|无敌|碾压一切/;

function rankOrder(powerSystem: PowerSystemFile | null, rankId?: string): number {
  if (!rankId || !powerSystem) return -1;
  return powerSystem.ranks.find((r) => r.id === rankId)?.order ?? -1;
}

function protagonistAsset(assets: CharacterAssetsFile | null): CharacterAsset | undefined {
  return assets?.characters.find((c) => c.characterId === 'protagonist');
}

export function checkPowerConsistency(input: {
  content: string;
  episode: EpisodePlan;
  powerSystem: PowerSystemFile | null;
  assetsBefore: CharacterAssetsFile | null;
  assetsAfter: CharacterAssetsFile | null;
  storyArcPowerCeilingRankId?: string;
}): PowerConsistencyResult {
  const { content, episode, powerSystem, assetsBefore, assetsAfter, storyArcPowerCeilingRankId } =
    input;
  const issues: string[] = [];

  const before = protagonistAsset(assetsBefore);
  const after = protagonistAsset(assetsAfter);
  const beforeOrder = rankOrder(powerSystem, before?.currentRankId);
  const afterOrder = rankOrder(powerSystem, after?.currentRankId);
  const ceilingOrder = rankOrder(powerSystem, storyArcPowerCeilingRankId);

  const contentSuggestsBreakthrough = BREAKTHROUGH_RE.test(content);
  const gainsMentionPower = [...episode.heroGains, ...episode.heroStateChanges].some((g) =>
    BREAKTHROUGH_RE.test(g)
  );

  if (contentSuggestsBreakthrough && !gainsMentionPower && afterOrder <= beforeOrder) {
    issues.push('正文出现突破/进阶描写，但事件包未记录战力收益，且角色阶位未更新');
  }

  if (afterOrder > beforeOrder + 1) {
    issues.push(`主角阶位一次跃迁超过 1 阶（${beforeOrder} → ${afterOrder}）`);
  }

  if (ceilingOrder >= 0 && afterOrder > ceilingOrder) {
    issues.push('主角当前阶位已超过本卷战力上限');
  }

  if (POWER_UP_RE.test(content) && !gainsMentionPower) {
    issues.push('正文出现夸张战力暴涨表述，但缺乏剧情铺垫与事件包记录');
  }

  const invBefore = new Set((before?.inventory ?? []).map((i) => i.name));
  for (const item of after?.inventory ?? []) {
    if (!invBefore.has(item.name) && item.obtainedInChapter == null) {
      const mentionedInGains = episode.heroGains.some((g) => g.includes(item.name));
      if (!mentionedInGains && content.includes(item.name)) {
        issues.push(`物品「${item.name}」在正文中出现但未在 heroGains 中铺垫`);
      }
    }
  }

  if ((after?.injuries.length ?? 0) === 0 && before?.injuries.length) {
    const stillHurt = before.injuries.some((inj) => content.includes(inj.slice(0, 4)));
    if (stillHurt) {
      issues.push('主角伤势在资产中已清空，但正文仍描写相关伤势');
    }
  }

  return { ok: issues.length === 0, issues };
}
