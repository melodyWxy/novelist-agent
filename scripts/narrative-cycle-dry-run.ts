#!/usr/bin/env tsx
/**
 * MVP4 叙事周期 dry-run：tick → 选碰撞 → 事件包 → 写章
 */
import { bootstrapEnvSync } from '../src/config.js';
import { NovelistAgentRuntime } from '../src/agent/runtime.js';
import * as narrativeStore from '../src/narrative/store.js';
import * as store from '../src/novel/store.js';

bootstrapEnvSync();

const novelId = 'test-xiaoshuo';

async function main() {
  if (!(await store.novelExists(novelId))) {
    console.error(`作品 ${novelId} 不存在`);
    process.exit(1);
  }
  if (!(await narrativeStore.hasUniverse(novelId))) {
    console.error('缺少叙事宇宙，请先 npm run narrative:dry-run');
    process.exit(1);
  }

  const worldBefore = await narrativeStore.loadWorldTimeline(novelId);
  const chaptersBefore = (await store.listChapterNumbers(novelId)).length;

  const runtime = new NovelistAgentRuntime({ dryRun: true, verbose: true });
  const result = await runtime.runNarrativeCycle(novelId, {
    tickDays: 1,
    autoDiscoverCollisions: true,
    targetWords: 1500,
  });

  console.log('\n验收：');
  console.log(`- Tick：${result.ticked ? `至第 ${result.tickToDay} 天 ✓` : '跳过'}`);
  console.log(`- 碰撞：${result.collision.title} ✓`);
  console.log(`- 事件包：#${result.episode.episodeNumber}《${result.episode.title}》✓`);
  console.log(
    `- 章节：${result.chapter ? `第${result.chapter.chapterNumber}章 ${result.chapter.wordCount}字 ✓` : '✗'}`
  );
  console.log(`- narrative-cycle.json：runsTotal=${result.log.runsTotal} ✓`);

  const worldAfter = await narrativeStore.loadWorldTimeline(novelId);
  const chaptersAfter = (await store.listChapterNumbers(novelId)).length;
  if (result.ticked && worldAfter && worldBefore) {
    console.log(`- 世界时间：${worldBefore.currentDay} → ${worldAfter.currentDay}`);
  }
  console.log(`- 章节数：${chaptersBefore} → ${chaptersAfter}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
