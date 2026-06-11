#!/usr/bin/env tsx
/**
 * MVP2 时间轴编辑 smoke test（无需 LLM）
 */
import { bootstrapEnvSync } from '../src/config.js';
import * as narrativeStore from '../src/narrative/store.js';
import * as store from '../src/novel/store.js';
import { applyTimelinePatch, applyCollisionPatch } from '../src/narrative/timeline-editor.js';

bootstrapEnvSync();

const novelId = 'test-xiaoshuo';

async function main() {
  if (!(await store.novelExists(novelId))) {
    console.error(`作品 ${novelId} 不存在`);
    process.exit(1);
  }

  const world = await narrativeStore.loadWorldTimeline(novelId);
  const hero = await narrativeStore.loadHeroTimeline(novelId);
  const collisions = await narrativeStore.loadCollisions(novelId);
  if (!world?.events[0] || !hero || !collisions?.collisions[0]) {
    console.error('缺少宇宙数据，请先 npm run narrative:dry-run');
    process.exit(1);
  }

  const w = world.events[0];
  await applyTimelinePatch(novelId, {
    op: 'updateWorldEvent',
    eventId: w.id,
    patch: { day: w.day + 1, locked: true },
  });
  console.log(`✓ 世界事件 ${w.id} 天数+1 并锁定`);

  await applyTimelinePatch(novelId, {
    op: 'addHeroEvent',
    event: {
      day: 20,
      title: '手动添加：探查异常',
      intent: '调查黑石谷异象',
      location: '黑石谷',
      constraints: [],
      knownWorldFacts: [],
    },
  });
  console.log('✓ 添加主角行动');

  const c = collisions.collisions.find((x) => x.status === 'candidate') ?? collisions.collisions[0];
  await applyCollisionPatch(novelId, { op: 'update', collisionId: c.id, required: true });
  console.log(`✓ 碰撞 ${c.title} 标为必须发生`);

  const bible = await narrativeStore.loadWorldBible(novelId);
  if (bible?.factions[0]) {
    await applyTimelinePatch(novelId, {
      op: 'updateFactionGoals',
      factionId: bible.factions[0].id,
      goals: ['测试目标A', '测试目标B'],
    });
    console.log('✓ 更新势力目标');
  }

  const world2 = await narrativeStore.loadWorldTimeline(novelId);
  if (!world2 || world2.events.length < 2) {
    console.error('世界事件不足，无法测试排序');
    process.exit(1);
  }
  const sameDay = world2.events.filter((e) => e.day === world2.events[0].day);
  if (sameDay.length < 2) {
    const target = world2.events[1];
    await applyTimelinePatch(novelId, {
      op: 'updateWorldEvent',
      eventId: target.id,
      patch: { day: world2.events[0].day },
    });
    console.log(`✓ 将事件 ${target.title} 调到与 ${world2.events[0].title} 同日`);
  }

  const world3 = await narrativeStore.loadWorldTimeline(novelId);
  const day = world3!.events[0].day;
  const onDay = world3!.events.filter((e) => e.day === day);
  if (onDay.length >= 2) {
    const [first, second] = onDay.sort((a, b) => a.sortOrder - b.sortOrder);
    await applyTimelinePatch(novelId, {
      op: 'moveWorldEvent',
      eventId: second.id,
      day,
      beforeEventId: first.id,
    });
    const world4 = await narrativeStore.loadWorldTimeline(novelId);
    const reordered = world4!.events
      .filter((e) => e.day === day)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (reordered[0]?.id === second.id) {
      console.log('✓ 同日内 sortOrder 重排');
    } else {
      console.error('sortOrder 重排失败');
      process.exit(1);
    }
  }

  const support = await narrativeStore.loadSupportTimeline(novelId);
  if (support?.events[0] && bible?.supportCharacters[0]) {
    const s = support.events[0];
    await applyTimelinePatch(novelId, {
      op: 'updateSupportEvent',
      eventId: s.id,
      patch: { protagonistAwareness: 'rumor', locked: true },
    });
    console.log(`✓ 配角事件 ${s.id} 设为 rumor 并锁定`);

    await applyTimelinePatch(novelId, {
      op: 'addSupportEvent',
      event: {
        characterId: bible.supportCharacters[0].id,
        day: s.day,
        title: '手动添加：暗中联络',
        intent: '与线人交换情报',
        location: '城中',
        protagonistAwareness: 'none',
        worldEventIds: [],
      },
    });
    console.log('✓ 添加配角行动');

    const support2 = await narrativeStore.loadSupportTimeline(novelId);
    const onDay = support2!.events.filter((e) => e.day === s.day);
    if (onDay.length >= 2) {
      const [first, second] = [...onDay].sort((a, b) => a.sortOrder - b.sortOrder);
      await applyTimelinePatch(novelId, {
        op: 'moveSupportEvent',
        eventId: second.id,
        day: s.day,
        beforeEventId: first.id,
      });
      const support3 = await narrativeStore.loadSupportTimeline(novelId);
      const reordered = support3!.events
        .filter((e) => e.day === s.day)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      if (reordered[0]?.id === second.id) {
        console.log('✓ 配角同日内 sortOrder 重排');
      } else {
        console.error('配角 sortOrder 重排失败');
        process.exit(1);
      }
    }

    await applyTimelinePatch(novelId, {
      op: 'updateSupportCharacterGoals',
      characterId: bible.supportCharacters[0].id,
      goals: ['测试配角目标'],
    });
    console.log('✓ 更新配角目标');
  } else {
    console.log('⊘ 跳过配角隐线测试（无配角数据，请先 narrative:dry-run 重建宇宙）');
  }

  console.log('\n时间轴编辑 smoke test 通过');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
