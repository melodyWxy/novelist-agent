#!/usr/bin/env tsx
/**
 * 双线叙事 dry-run 全流程验证
 */
import { bootstrapEnvSync } from '../src/config.js';
import { NovelistAgentRuntime } from '../src/agent/runtime.js';
import * as narrativeStore from '../src/narrative/store.js';
import * as store from '../src/novel/store.js';

bootstrapEnvSync();

const novelId = 'test-xiaoshuo';

async function main() {
  if (!(await store.novelExists(novelId))) {
    console.error(`作品 ${novelId} 不存在，请先 npm run dry-run`);
    process.exit(1);
  }

  const runtime = new NovelistAgentRuntime({ dryRun: true, verbose: true });

  console.log('1/4 生成叙事宇宙...');
  const { world, support, hero } = await runtime.buildUniverse(novelId);
  console.log(
    `   世界事件 ${world.events.length}，配角隐线 ${support.events.length}，主角行动 ${hero.events.length}`
  );

  console.log('2/4 发现碰撞...');
  const collisions = await runtime.discoverCollisions(novelId);
  console.log(`   候选碰撞 ${collisions.length}`);
  if (collisions.length === 0) {
    console.error('无碰撞候选');
    process.exit(1);
  }

  console.log('3/4 生成事件包...');
  const episode = await runtime.planEpisode(novelId, collisions[0].id);
  console.log(`   事件包 #${episode.episodeNumber}《${episode.title}》`);

  console.log('4/4 写出章节（双阶段 + 泄露修复）...');
  const result = await runtime.writeEpisode(novelId, episode.episodeNumber);
  console.log(`   第${result.chapterNumber}章 ${result.wordCount} 字`);
  console.log(
    `   写作：${result.writingMeta.twoStage ? '双阶段' : '单阶段'}，` +
      `明线草稿 ${result.writingMeta.surfaceDraftChars ?? '-'} 字，` +
      `泄露修复 ${result.writingMeta.leakRetries} 次` +
      (result.writingMeta.hadLeak ? '（曾检测到泄露）' : '')
  );

  const bible = await narrativeStore.loadWorldBible(novelId);
  console.log('\n验收：');
  console.log(`- 世界 Bible: ${bible ? '✓' : '✗'}`);
  console.log(`- 世界线事件: ${world.events.length} 个`);
  console.log(`- 主人公线: ${hero.events.length} 个`);
  console.log(`- 碰撞: ${collisions.length} 个`);
  console.log(`- 事件包: episode #${episode.episodeNumber}`);
  console.log(`- 章节: #${result.chapterNumber}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
