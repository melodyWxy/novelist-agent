import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NarrativeWorkbench } from '@/components/NarrativeWorkbench';
import { NovelActions } from '@/components/NovelActions';
import { getUniverseDetail } from '@core/services/narrative-service';
import { getNovelDetail } from '@core/services/novel-service';
import * as store from '@core/novel/store';

export const dynamic = 'force-dynamic';

export default async function NovelDetailPage({
  params,
}: {
  params: Promise<{ novelId: string }>;
}) {
  const { novelId } = await params;

  if (!(await store.novelExists(novelId))) {
    notFound();
  }

  const [universe, legacy] = await Promise.all([
    getUniverseDetail(novelId),
    getNovelDetail(novelId),
  ]);

  return (
    <div className="novel-detail">
      <h2>{universe.meta.title}</h2>
      <p className="muted">
        {universe.meta.genre} · {universe.meta.style} · 主角 {universe.meta.protagonist}
      </p>

      <NarrativeWorkbench
        novelId={novelId}
        title={universe.meta.title}
        protagonist={universe.meta.protagonist}
        bible={universe.bible}
        world={universe.world}
        hero={universe.hero}
        support={universe.support}
        powerSystem={universe.powerSystem}
        characterAssets={universe.characterAssets}
        storyArcs={universe.storyArcs}
        qualityMetrics={universe.qualityMetrics}
        collisions={universe.collisions}
        episodes={universe.episodes}
        chapterNumbers={universe.chapterNumbers}
        hasUniverse={universe.hasUniverse}
        simState={universe.simState}
        cycleLog={universe.cycleLog}
        activeCycleRun={universe.activeCycleRun}
        cycleRunHistory={universe.cycleRunHistory}
        nextRecommendedCollision={universe.nextRecommendedCollision}
        schedule={
          legacy.schedule
            ? {
                enabled: legacy.schedule.enabled,
                cron: legacy.schedule.cron,
                mode: legacy.schedule.mode ?? 'classic',
                tickDays: legacy.schedule.tickDays ?? 1,
                autoDiscoverCollisions: legacy.schedule.autoDiscoverCollisions ?? true,
                targetWords: legacy.schedule.targetWords ?? 3500,
                maxCollisions: legacy.schedule.maxCollisions ?? 6,
              }
            : null
        }
        pendingJobCount={legacy.recentJobs.filter((j) => j.status === 'pending').length}
      />

      <details className="card" style={{ marginTop: '2rem' }}>
        <summary style={{ cursor: 'pointer' }}>经典模式（章节大纲）</summary>
        <p className="muted">旧版按章节大纲写作，与双线叙事并行保留</p>
        <NovelActions
          novelId={novelId}
          hasOutline={Boolean(legacy.outline)}
          schedule={
            legacy.schedule
              ? {
                  enabled: legacy.schedule.enabled,
                  cron: legacy.schedule.cron,
                  targetWords: legacy.schedule.targetWords,
                  maxChapters: legacy.schedule.maxChapters,
                }
              : null
          }
        />
        {legacy.chapterNumbers.length > 0 && (
          <ul>
            {legacy.chapterNumbers.map((n) => (
              <li key={n}>
                <Link href={`/novels/${novelId}/chapters/${n}`}>第 {n} 章</Link>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
