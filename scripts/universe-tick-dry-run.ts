#!/usr/bin/env tsx
/**
 * MVP3 世界模拟 Tick dry-run 验证
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

  const hasUniverse = await narrativeStore.hasUniverse(novelId);
  if (!hasUniverse) {
    console.error('缺少叙事宇宙，请先 npm run narrative:dry-run');
    process.exit(1);
  }

  const worldBefore = await narrativeStore.loadWorldTimeline(novelId);
  const heroBefore = await narrativeStore.loadHeroTimeline(novelId);
  const dayBefore = worldBefore?.currentDay ?? 0;
  const supportBefore = await narrativeStore.loadSupportTimeline(novelId);
  const wCountBefore = worldBefore?.events.length ?? 0;
  const sCountBefore = supportBefore?.events.length ?? 0;
  const hCountBefore = heroBefore?.events.length ?? 0;

  const runtime = new NovelistAgentRuntime({ dryRun: true, verbose: true });

  console.log(
    `Tick 前：第 ${dayBefore} 天，世界 ${wCountBefore}，配角 ${sCountBefore}，主角 ${hCountBefore}`
  );
  const result = await runtime.tickUniverse(novelId, { tickDays: 2, autoDiscoverCollisions: true });

  console.log('\n验收：');
  console.log(`- 世界时间：第 ${dayBefore} → ${result.toDay} 天 ${result.toDay === dayBefore + 2 ? '✓' : '✗'}`);
  console.log(
    `- 新增事件：世界 +${result.newWorldEvents}，配角 +${result.newSupportEvents}，主角 +${result.newHeroEvents} ${result.newWorldEvents > 0 && result.newHeroEvents > 0 ? '✓' : '✗'}`
  );
  console.log(`- 碰撞候选：${result.collisions.filter((c) => c.status === 'candidate').length} 个`);
  console.log(`- sim 记录：ticksTotal=${result.simState.ticksTotal} ✓`);

  const sim = await narrativeStore.loadUniverseSimState(novelId);
  console.log(`- universe-sim.json：${sim ? '✓' : '✗'}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
