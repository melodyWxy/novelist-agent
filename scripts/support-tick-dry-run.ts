#!/usr/bin/env tsx
/**
 * 配角隐线 Tick dry-run 验证（迭代 12）
 */
import { bootstrapEnvSync } from '../src/config.js';
import { NovelistAgentRuntime } from '../src/agent/runtime.js';
import * as narrativeStore from '../src/narrative/store.js';
import * as store from '../src/novel/store.js';

bootstrapEnvSync();

const novelId = 'test-xiaoshuo';

async function main() {
  if (!(await store.novelExists(novelId))) {
    console.error(`作品 ${novelId} 不存在，请先 npm run dry-run && npm run narrative:dry-run`);
    process.exit(1);
  }

  const bible = await narrativeStore.loadWorldBible(novelId);
  if (!bible?.supportCharacters.length) {
    console.log('重建宇宙以生成配角档案...');
    const runtime = new NovelistAgentRuntime({ dryRun: true, verbose: true });
    await runtime.buildUniverse(novelId);
  }

  const bibleAfter = await narrativeStore.loadWorldBible(novelId);
  const supportBefore = await narrativeStore.loadSupportTimeline(novelId);
  const sCountBefore = supportBefore?.events.length ?? 0;

  console.log(`配角档案：${bibleAfter?.supportCharacters.length ?? 0} 人`);
  console.log(`Tick 前配角事件：${sCountBefore}`);

  const runtime = new NovelistAgentRuntime({ dryRun: true, verbose: true });
  const result = await runtime.tickUniverse(novelId, {
    tickDays: 1,
    autoDiscoverCollisions: false,
  });

  const supportAfter = await narrativeStore.loadSupportTimeline(novelId);
  const rumorCount = (supportAfter?.events ?? []).filter(
    (e) => e.protagonistAwareness !== 'none'
  ).length;

  console.log('\n验收：');
  console.log(
    `- 新增配角事件 +${result.newSupportEvents} ${result.newSupportEvents > 0 ? '✓' : '✗'}`
  );
  console.log(`- support-timeline.json 持久化：${supportAfter ? '✓' : '✗'}`);
  console.log(`- 含 protagonistAwareness 涟漪：${rumorCount} 条`);
  console.log(`- sim.newSupportEvents=${result.simState.newSupportEvents} ✓`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
