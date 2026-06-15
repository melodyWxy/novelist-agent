#!/usr/bin/env tsx
/**
 * 修复 xianmen-inner-disciple 数据：
 * - 删除重复事件包 #2-6
 * - 标记占位主人公节点已用于第 1 章
 * - 续跑第 2 章（事件包 #8）的状态同步
 * - 收尾卡住的周期链与 running 任务
 */
import { bootstrapEnvSync, loadLlmConfig } from '../src/config.js';
import { LlmClient } from '../src/llm/client.js';
import * as narrativeStore from '../src/narrative/store.js';
import { resumeEpisodeStateUpdate } from '../src/narrative/pipeline.js';
import { getJob, updateJob } from '../src/jobs/queue.js';
import { handleCycleJobSuccess } from '../src/narrative/cycle-chain.js';
import { countChars } from '../src/lib/text.js';

bootstrapEnvSync();

const novelId = 'xianmen-inner-disciple';
const episodeNumber = 8;
const chapterNumber = 2;
const PLACEHOLDER_HERO_ID = '1f78e1a2-44b8-4c19-9fbb-501fb6c9c755';

async function main() {
  console.log('[repair] 删除重复事件包 #2-6 …');
  for (const n of [2, 3, 4, 5, 6]) {
    const removed = await narrativeStore.deleteEpisode(novelId, n);
    console.log(`  #${n}: ${removed ? '已删除' : '不存在'}`);
  }

  const hero = await narrativeStore.loadHeroTimeline(novelId);
  if (hero) {
    const idx = hero.events.findIndex((e) => e.id === PLACEHOLDER_HERO_ID);
    if (idx >= 0) {
      hero.events[idx].usedInChapter = 1;
      hero.events[idx].status = 'resolved';
      hero.updatedAt = new Date().toISOString();
      await narrativeStore.saveHeroTimeline(novelId, hero);
      console.log('[repair] 占位主人公节点已标记为第 1 章完结');
    }
  }

  const chapter = await import('../src/novel/store.js').then((m) =>
    m.loadChapter(novelId, chapterNumber)
  );
  if (!chapter) {
    throw new Error('第 2 章正文不存在，无法续跑状态同步');
  }

  const llm = new LlmClient(loadLlmConfig());
  console.log('[repair] 续跑事件包 #8 → 第 2 章状态同步（调用 LLM）…');
  const newState = await resumeEpisodeStateUpdate(llm, novelId, episodeNumber, chapterNumber);
  console.log('[repair] state.lastChapterNumber =', newState.lastChapterNumber);

  const wordCount = countChars(chapter);
  const episode = await narrativeStore.loadEpisode(novelId, episodeNumber);
  const run = await narrativeStore.loadCycleRun(novelId);
  if (run?.stages.write.jobId) {
    const job = await getJob(run.stages.write.jobId);
    if (!job) {
      console.warn('[repair] 周期链 write job 不在队列中，跳过链收尾');
    } else {
      const summary = `第${chapterNumber}章《${episode?.title ?? ''}》状态同步续跑完成，${wordCount} 字`;
      await updateJob(job.id, {
        status: 'completed',
        finishedAt: new Date().toISOString(),
        resultSummary: summary,
        error: undefined,
      });
      await handleCycleJobSuccess(
        { ...job, status: 'completed', finishedAt: new Date().toISOString(), resultSummary: summary },
        {
          chapterNumber,
          chapterTitle: episode?.title,
          wordCount,
          episodeNumber,
          episodeTitle: episode?.title,
        }
      );
      console.log('[repair] 周期链已标记完成');
    }
  }

  console.log('[repair] 完成');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
