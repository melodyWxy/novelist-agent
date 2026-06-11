/**
 * 定时调度：根据 schedules.json 向队列入队任务
 *
 * `runSchedulerTick` 使用自研 cron 匹配（仅支持 `*`、精确整数、`*\/n` 步进），
 * 不支持范围 `1-5`、列表 `1,3`、星期名等 node-cron 全语法。
 */
import cron from 'node-cron';
import * as store from '../novel/store.js';
import * as narrativeStore from '../narrative/store.js';
import {
  enqueueJob,
  listSchedules,
  hasPendingOrRunningForNovel,
  markScheduleTriggered,
} from './queue.js';
import { hasActiveCycleChain, startCycleChain } from '../narrative/cycle-chain.js';
import type { Schedule } from './types.js';

export async function tickNarrativeCycleSchedule(schedule: Schedule): Promise<void> {
  if (!schedule.enabled) return;

  const exists = await store.novelExists(schedule.novelId);
  if (!exists) return;

  const hasUniverse = await narrativeStore.hasUniverse(schedule.novelId);
  if (!hasUniverse) {
    console.warn(`[scheduler] ${schedule.novelId} 无叙事宇宙，跳过 narrative-cycle`);
    return;
  }

  if (await hasActiveCycleChain(schedule.novelId)) {
    return;
  }

  await startCycleChain(schedule.novelId, {
    tickDays: schedule.tickDays ?? 1,
    autoDiscoverCollisions: schedule.autoDiscoverCollisions !== false,
    maxCollisions: schedule.maxCollisions ?? 6,
    targetWords: schedule.targetWords,
  });
  console.log(`[scheduler] 已为 ${schedule.novelId} 启动周期链（tick→写章）`);
}

export async function tickNarrativeSchedule(schedule: Schedule): Promise<void> {
  if (!schedule.enabled) return;

  const exists = await store.novelExists(schedule.novelId);
  if (!exists) return;

  const hasUniverse = await narrativeStore.hasUniverse(schedule.novelId);
  if (!hasUniverse) {
    console.warn(`[scheduler] ${schedule.novelId} 无叙事宇宙，跳过 universe-tick`);
    return;
  }

  if (await hasPendingOrRunningForNovel(schedule.novelId, 'universe-tick')) {
    return;
  }

  await enqueueJob(schedule.novelId, 'universe-tick', {
    tickDays: schedule.tickDays ?? 1,
    autoDiscoverCollisions: schedule.autoDiscoverCollisions !== false,
    maxCollisions: schedule.maxCollisions ?? 6,
  });
  console.log(
    `[scheduler] 已为 ${schedule.novelId} 入队 universe-tick（+${schedule.tickDays ?? 1} 天）`
  );
}

export async function tickSchedule(schedule: Schedule): Promise<void> {
  if (!schedule.enabled) return;

  if (schedule.mode === 'narrative-auto') {
    await tickNarrativeCycleSchedule(schedule);
    return;
  }

  if (schedule.mode === 'narrative') {
    await tickNarrativeSchedule(schedule);
    return;
  }

  const exists = await store.novelExists(schedule.novelId);
  if (!exists) return;

  const outline = await store.loadOutline(schedule.novelId);
  if (!outline) {
    console.warn(`[scheduler] ${schedule.novelId} 无大纲，跳过定时任务`);
    return;
  }

  const state = await store.loadStoryState(schedule.novelId);
  const nextChapter = state.lastChapterNumber + 1;

  if (schedule.maxChapters && nextChapter > schedule.maxChapters) {
    console.log(`[scheduler] ${schedule.novelId} 已达 maxChapters=${schedule.maxChapters}，跳过`);
    return;
  }

  if (outline.chapters.every((c) => c.chapterNumber !== nextChapter)) {
    console.warn(`[scheduler] ${schedule.novelId} 大纲无第 ${nextChapter} 章，跳过`);
    return;
  }

  if (await hasPendingOrRunningForNovel(schedule.novelId, 'write-next-chapter')) {
    return;
  }

  await enqueueJob(schedule.novelId, 'write-next-chapter', {
    targetWords: schedule.targetWords,
  });
  console.log(`[scheduler] 已为 ${schedule.novelId} 入队 write-next-chapter #${nextChapter}`);
}

/** 每分钟扫描所有 enabled schedule，判断当前时间是否命中 cron */
export async function runSchedulerTick(): Promise<void> {
  const schedules = await listSchedules();
  const now = new Date();
  const currentMinute = now.toISOString().slice(0, 16);

  for (const schedule of schedules) {
    if (!schedule.enabled) continue;
    if (!cron.validate(schedule.cron)) continue;
    if (schedule.lastTriggeredAt?.slice(0, 16) === currentMinute) continue;

    // node-cron 无直接 "is due now" API，用 schedule 包装单次检查
    const parts = schedule.cron.split(' ');
    if (parts.length < 5) continue;

    const [minExpr, hourExpr, domExpr, monExpr, dowExpr] = parts;
    const match = (expr: string, value: number, max: number): boolean => {
      if (expr === '*') return true;
      if (expr.startsWith('*/')) {
        const step = parseInt(expr.slice(2), 10);
        return value % step === 0;
      }
      return parseInt(expr, 10) === value;
    };

    const minute = now.getMinutes();
    const hour = now.getHours();
    const dom = now.getDate();
    const month = now.getMonth() + 1;
    const dow = now.getDay();

    const due =
      match(minExpr, minute, 59) &&
      match(hourExpr, hour, 23) &&
      match(domExpr, dom, 31) &&
      match(monExpr, month, 12) &&
      match(dowExpr, dow, 6);

    if (due) {
      await markScheduleTriggered(schedule.novelId, now.toISOString());
      await tickSchedule(schedule);
    }
  }
}
