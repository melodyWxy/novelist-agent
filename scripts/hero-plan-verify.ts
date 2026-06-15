#!/usr/bin/env tsx
/** 主人公线规划链路验证（无 LLM） */
import { bootstrapEnvSync } from '../src/config.js';
import * as narrativeStore from '../src/narrative/store.js';
import { pickNextHeroEvent, findCollisionsForHeroEvent } from '../src/narrative/hero-selection.js';
import { startCycleChain } from '../src/narrative/cycle-chain.js';

bootstrapEnvSync();

async function main() {
  for (const novelId of ['xianmen-inner-disciple', 'occult-sequence-nightwatch']) {
    const hero = await narrativeStore.loadHeroTimeline(novelId);
    const world = await narrativeStore.loadWorldTimeline(novelId);
    const collisions = (await narrativeStore.loadCollisions(novelId))?.collisions ?? [];
    const next = hero ? pickNextHeroEvent(hero, { narrativeDay: world?.currentDay }) : null;
    const matched = next ? findCollisionsForHeroEvent(collisions, next) : [];
    console.log(`--- ${novelId}`);
    console.log(`  next hero: ${next ? `[${next.id}] d${next.day} ${next.title}` : 'NONE'}`);
    console.log(`  nearby collisions: ${matched.length}`);
    if (!next) {
      console.error(`  ✗ 无待写主人公行动节点`);
      process.exit(1);
    }
  }

  const novelId = 'xianmen-inner-disciple';
  const { run } = await startCycleChain(novelId, { tickDays: 0, skipWrite: true });
  if (run.stages.collision.status !== 'skipped') {
    console.error('collision 阶段应默认 skipped，实际:', run.stages.collision.status);
    process.exit(1);
  }
  console.log('--- cycle chain');
  console.log(`  collision stage: ${run.stages.collision.status} ✓`);
  await narrativeStore.archiveTerminalCycleRun(novelId, run);
  console.log('\n主人公线规划链路验证通过');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
