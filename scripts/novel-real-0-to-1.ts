#!/usr/bin/env tsx
/**
 * 真实 LLM：长篇小说 0→1（创建作品 → 叙事宇宙 → 碰撞 → 事件包 → 第一章）
 *
 * 用法：
 *   npx tsx scripts/novel-real-0-to-1.ts
 *   npx tsx scripts/novel-real-0-to-1.ts --novel chenlai-changhe
 *   npx tsx scripts/novel-real-0-to-1.ts --skip-universe --rewrite-chapter 1 --episode 2
 */
import { bootstrapEnvSync, loadLlmConfig } from '../src/config.js';
import { LlmClient } from '../src/llm/client.js';
import { NovelistAgentRuntime } from '../src/agent/runtime.js';
import * as store from '../src/novel/store.js';
import * as narrativeStore from '../src/narrative/store.js';

bootstrapEnvSync();

const args = process.argv.slice(2);
const novelIdx = args.indexOf('--novel');
const novelId = novelIdx >= 0 ? args[novelIdx + 1] : 'chenlai-changhe';
const skipUniverse = args.includes('--skip-universe');
const skipStateUpdate = args.includes('--skip-state-update');
const rewriteIdx = args.indexOf('--rewrite-chapter');
const rewriteChapter =
  rewriteIdx >= 0 ? Number.parseInt(args[rewriteIdx + 1] ?? '', 10) : undefined;
const episodeIdx = args.indexOf('--episode');
const episodeNumberArg =
  episodeIdx >= 0 ? Number.parseInt(args[episodeIdx + 1] ?? '', 10) : undefined;

const NOVEL = {
  id: novelId,
  title: '尘来长河',
  genre: '玄幻仙侠',
  protagonist: '陈徕',
  style: '慢热群像、史诗感、人物驱动',
  worldSetting:
    '末法将尽的时代，九州灵脉枯竭。陈徕出身边陲小镇，身负残缺古契，被卷入诸宗门与隐世势力的棋局。世界在明线之外仍有势力级暗流涌动。',
  targetWordCount: 1_200_000,
};

async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  console.log(`\n▶ ${label}`);
  const t0 = Date.now();
  const result = await fn();
  console.log(`  ✓ 完成 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  return result;
}

async function main() {
  const isRewriteRun =
    rewriteChapter != null && Number.isFinite(rewriteChapter) && rewriteChapter >= 1;
  if (isRewriteRun) {
    const currentTimeout = Number(process.env.LLM_TIMEOUT_MS ?? '120000');
    if (!Number.isFinite(currentTimeout) || currentTimeout < 600_000) {
      process.env.LLM_TIMEOUT_MS = '600000';
      console.log('  重写模式：LLM 超时已提升至 600s');
    }
  }

  const cfg = loadLlmConfig(false);
  console.log(`LLM: ${cfg.LLM_MODEL} @ ${cfg.LLM_BASE_URL}`);

  const ping = new LlmClient(cfg, false);
  await step('连通性探测', () =>
    ping.chat([{ role: 'user', content: '回复一个字：通' }], { maxTokens: 8, temperature: 0 })
  );
  console.log('  API 可用');

  const runtime = new NovelistAgentRuntime({ dryRun: false, verbose: true });

  const exists = await store.novelExists(NOVEL.id);
  if (!exists) {
    await step('创建作品工程', () => runtime.initNovel(NOVEL));
    console.log(`  目录: data/novels/${NOVEL.id}/`);
  } else {
    console.log(`\n▶ 作品 ${NOVEL.id} 已存在，跳过 init`);
  }

  let world;
  let support;
  let hero;
  if (skipUniverse && (await narrativeStore.hasUniverse(NOVEL.id))) {
    console.log(`\n▶ 叙事宇宙已存在，跳过 buildUniverse（--skip-universe）`);
    world = (await narrativeStore.loadWorldTimeline(NOVEL.id))!;
    support = (await narrativeStore.loadSupportTimeline(NOVEL.id))!;
    hero = (await narrativeStore.loadHeroTimeline(NOVEL.id))!;
    if (!world || !support || !hero) {
      throw new Error('叙事宇宙文件不完整，请去掉 --skip-universe 重新生成');
    }
  } else {
    ({ world, support, hero } = await step('生成叙事宇宙 (Bible+三线)', () =>
      runtime.buildUniverse(NOVEL.id, { worldEventCount: 12, heroEventCount: 12 })
    ));
  }
  console.log(
    `  世界 ${world.events.length} 事件 · 配角 ${support.events.length} · 主角 ${hero.events.length}`
  );

  let episodeNumber = episodeNumberArg;
  if (rewriteChapter != null && Number.isFinite(rewriteChapter) && rewriteChapter >= 1) {
    if (!episodeNumber) {
      throw new Error('重写章节须指定 --episode <事件包编号>');
    }
    console.log(`\n▶ 重写模式：覆盖第 ${rewriteChapter} 章（事件包 #${episodeNumber}）`);
  } else {
    const collisions = await step('发现碰撞候选', () => runtime.discoverCollisions(NOVEL.id, 5));
    console.log(`  候选 ${collisions.length} 个 · 首选「${collisions[0]?.title ?? '—'}」`);
    if (!collisions[0]) {
      throw new Error('无碰撞候选，无法继续');
    }

    const episode = await step('生成章节事件包', () =>
      runtime.planEpisode(NOVEL.id, collisions[0].id)
    );
    episodeNumber = episode.episodeNumber;
    console.log(`  事件包 #${episode.episodeNumber}《${episode.title}》`);
  }

  const writeLabel =
    rewriteChapter != null && Number.isFinite(rewriteChapter)
      ? `重写第 ${rewriteChapter} 章（双阶段+审稿，目标 3500 字）`
      : '写出第一章（双阶段+审稿）';

  const isRewrite =
    rewriteChapter != null && Number.isFinite(rewriteChapter) && rewriteChapter >= 1;

  const chapter = await step(writeLabel, () =>
    runtime.writeEpisode(NOVEL.id, episodeNumber!, {
      targetWords: 3500,
      ...(isRewrite ? { rewriteChapterNumber: rewriteChapter } : {}),
      ...(isRewrite || skipStateUpdate ? { skipStateUpdate: true } : {}),
    })
  );
  console.log(`  第${chapter.chapterNumber}章《${chapter.title}》 ${chapter.wordCount} 字`);
  if (chapter.writingMeta.reviewRewriteRetries > 0) {
    console.log(`  审稿自动修订：${chapter.writingMeta.reviewRewriteRetries} 次`);
  }
  if (chapter.review) {
    console.log(
      `  审稿: ${chapter.review.passed ? '通过' : '待改'} (${chapter.review.score ?? '—'}分) — ${chapter.review.summary}`
    );
  }

  console.log('\n══════════════════════════════════════');
  console.log('0→1 完成。下一步：');
  console.log(`  Web:  npm run dev:all  → http://localhost:3020/novels/${NOVEL.id}`);
  console.log(`  续写: 工作台「一键产出章节」或再跑本脚本前请先 tick / 新碰撞`);
  console.log(`  章节: data/novels/${NOVEL.id}/chapters/${String(chapter.chapterNumber).padStart(4, '0')}.md`);
}

main().catch((e) => {
  console.error('\n✗ 失败:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
