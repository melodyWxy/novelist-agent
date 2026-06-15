'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type {
  WorldBible,
  WorldTimeline,
  HeroTimeline,
  SupportTimeline,
  Collision,
  EpisodePlan,
  UniverseSimState,
  NarrativeCycleLog,
  CycleRun,
  PowerSystemFile,
  CharacterAssetsFile,
  StoryArcsFile,
} from '@core/narrative/types';
import type { QualityMetrics } from '@core/narrative/quality-metrics';
import { formatDateTime } from '@/lib/format-datetime';
import { TimelineVisualizer } from './TimelineVisualizer';
import { QualityMetricsPanel } from './QualityMetricsPanel';
import { CycleProgress } from './CycleProgress';
import { CycleRunHistoryList } from './CycleRunHistoryList';
import { AIAssistantPanel } from './AIAssistantPanel';

type Tab = 'overview' | 'timeline' | 'world' | 'support' | 'hero' | 'power' | 'collisions' | 'episodes';

interface Props {
  novelId: string;
  title: string;
  protagonist: string;
  bible: WorldBible | null;
  world: WorldTimeline | null;
  hero: HeroTimeline | null;
  support: SupportTimeline | null;
  powerSystem: PowerSystemFile | null;
  characterAssets: CharacterAssetsFile | null;
  storyArcs: StoryArcsFile | null;
  qualityMetrics: QualityMetrics;
  collisions: Collision[];
  episodes: EpisodePlan[];
  chapterNumbers: number[];
  hasUniverse: boolean;
  simState: UniverseSimState | null;
  cycleLog: NarrativeCycleLog | null;
  activeCycleRun: CycleRun | null;
  cycleRunHistory: CycleRun[];
  nextRecommendedCollision: Collision | null;
  schedule: {
    enabled: boolean;
    cron: string;
    mode: 'classic' | 'narrative' | 'narrative-auto';
    tickDays: number;
    autoDiscoverCollisions: boolean;
    targetWords: number;
    maxCollisions: number;
  } | null;
  pendingJobCount?: number;
}

export function NarrativeWorkbench({
  novelId,
  title,
  protagonist,
  bible,
  world,
  hero,
  support,
  powerSystem,
  characterAssets,
  storyArcs,
  qualityMetrics,
  collisions,
  episodes,
  chapterNumbers,
  hasUniverse,
  simState,
  cycleLog,
  activeCycleRun,
  cycleRunHistory,
  nextRecommendedCollision,
  schedule,
  pendingJobCount = 0,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [tickDays, setTickDays] = useState(schedule?.tickDays ?? 1);
  const [targetWords, setTargetWords] = useState(schedule?.targetWords ?? 3500);
  const [schedEnabled, setSchedEnabled] = useState(schedule?.enabled ?? false);
  const [schedCron, setSchedCron] = useState(schedule?.cron ?? '*/10 * * * *');
  const [schedMode, setSchedMode] = useState<'classic' | 'narrative' | 'narrative-auto'>(
    schedule?.mode ?? 'narrative-auto'
  );
  const [schedAutoCollisions, setSchedAutoCollisions] = useState(
    schedule?.autoDiscoverCollisions ?? true
  );
  const [maxCollisions, setMaxCollisions] = useState(schedule?.maxCollisions ?? 6);

  async function post(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '请求失败');
    return data;
  }

  async function patch(url: string, body: unknown) {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '保存失败');
    return data;
  }

  async function run(action: string, fn: () => Promise<void>) {
    setLoading(action);
    try {
      await fn();
      router.refresh();
      alert('已提交任务，请确保 worker 进程在运行');
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }

  async function put(url: string, body: unknown) {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '保存失败');
    return data;
  }

  async function save(action: string, fn: () => Promise<void>) {
    setLoading(action);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }

  function parseJsonField<T>(value: FormDataEntryValue | null): T | null {
    try {
      return JSON.parse(String(value ?? '')) as T;
    } catch {
      alert('JSON 格式不正确，请检查逗号、引号和括号。');
      return null;
    }
  }

  async function saveNarrativeAutoSchedule(enabled: boolean) {
    const nextCron = schedCron.trim() || '*/10 * * * *';
    setSchedEnabled(enabled);
    setSchedMode('narrative-auto');
    setSchedCron(nextCron);
    setSchedAutoCollisions(true);
    await put('/api/schedules', {
      novelId,
      enabled,
      cron: nextCron,
      mode: 'narrative-auto',
      tickDays,
      targetWords,
      maxCollisions,
      autoDiscoverCollisions: true,
    });
    setStatusMessage(
      enabled
        ? `已开启定时自动产出（${nextCron}）`
        : '已关闭定时自动产出，不会再按 cron 启动新周期'
    );
  }

  async function stopProduction() {
    const res = await post(`/api/novels/${novelId}/production/stop`);
    setSchedEnabled(false);
    const parts: string[] = ['已停止产出'];
    if (res.cancelledCycle) parts.push('已终止进行中的周期链');
    if (res.cancelledPendingJobs > 0) {
      parts.push(`已取消 ${res.cancelledPendingJobs} 个排队任务`);
    }
    if (res.cancelledRunningJobs > 0) {
      parts.push(`已标记停止 ${res.cancelledRunningJobs} 个执行中任务`);
    }
    if (res.scheduleDisabled) parts.push('定时调度已关闭');
    if (res.runningJobNote) parts.push(res.runningJobNote);
    setStatusMessage(parts.join('；'));
  }

  const canStopProduction =
    Boolean(activeCycleRun) || schedEnabled || pendingJobCount > 0;

  const candidates = collisions
    .filter((c) => c.status === 'candidate')
    .sort((a, b) => {
      const rank = (c: Collision) => {
        const s = { high: 3, medium: 2, low: 1 };
        const r = { low: 3, medium: 2, high: 1 };
        return s[c.surfaceStrength] * 2 + r[c.disclosureRisk] + s[c.causalTightness];
      };
      return rank(b) - rank(a);
    });
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: '宇宙概览' },
    { id: 'timeline', label: '时间轴' },
    { id: 'world', label: '世界线' },
    { id: 'support', label: '配角隐线' },
    { id: 'hero', label: '主人公线' },
    { id: 'power', label: '战力/资产' },
    { id: 'collisions', label: '碰撞工坊' },
    { id: 'episodes', label: '章节产出' },
  ];

  return (
    <div>
      <AIAssistantPanel novelId={novelId} scope={tab} />

      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${tab === t.id ? 'tab-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="card">
          <h3>叙事宇宙 · {title}</h3>
          <p className="muted">主角 {protagonist}</p>
          {!hasUniverse ? (
            <>
              <p>尚未生成双线宇宙。点击下方按钮生成世界 Bible、世界线、主人公线。</p>
              <button
                className="btn"
                disabled={loading !== null}
                onClick={() => run('universe', () => post(`/api/novels/${novelId}/universe`))}
              >
                {loading === 'universe' ? '提交中...' : '生成叙事宇宙'}
              </button>
            </>
          ) : (
            <>
              <p>世界时间：第 {world?.currentDay ?? 0} 天</p>
              <p>
                世界事件：{world?.events.length ?? 0} · 配角隐线：{support?.events.length ?? 0} ·
                主角行动：{hero?.events.length ?? 0}
              </p>
              <p>碰撞候选：{candidates.length} · 事件包：{episodes.length} · 已写章节：{chapterNumbers.length}</p>
              <QualityMetricsPanel metrics={qualityMetrics} />
              {candidates.length === 0 && (
                <div className="alert alert-warn">
                  碰撞池为空时仍可按主人公线写章；若要插入碰撞增强，请先{' '}
                  <button
                    type="button"
                    className="btn-link"
                    disabled={loading !== null}
                    onClick={() =>
                      run('collisions', () =>
                        post(`/api/novels/${novelId}/collisions`, { maxCollisions })
                      )
                    }
                  >
                    发现碰撞
                  </button>{' '}
                  或{' '}
                  <button
                    type="button"
                    className="btn-link"
                    disabled={loading !== null}
                    onClick={() =>
                      run('tick', () =>
                        post(`/api/novels/${novelId}/tick`, {
                          tickDays,
                          maxCollisions,
                          autoDiscoverCollisions: true,
                        })
                      )
                    }
                  >
                    推进世界
                  </button>
                  刷新碰撞池。
                </div>
              )}
              <p>主角目标：{hero?.protagonistGoal}</p>
              {hero?.crisis && <p>当前危机：{hero.crisis}</p>}
              {simState && (
                <p className="muted">
                  上次 Tick：第 {simState.fromDay}～{simState.toDay} 天（
                  {formatDateTime(simState.lastTickAt)}）· 累计 {simState.ticksTotal} 次
                  <br />
                  +{simState.newWorldEvents} 世界 / +{simState.newSupportEvents ?? 0} 配角 / +
                  {simState.newHeroEvents} 主角
                  {simState.newCollisions > 0 ? ` / +${simState.newCollisions} 碰撞` : ''}
                </p>
              )}
              {activeCycleRun && <CycleProgress run={activeCycleRun} />}
              {statusMessage && (
                <div className="alert" style={{ marginTop: '0.75rem' }}>
                  {statusMessage}
                </div>
              )}
              {cycleLog?.lastStatus === 'failed' && !activeCycleRun && (
                <div className="alert alert-warn">
                  上次周期失败（{cycleLog.failedStage ?? '未知阶段'}）：{cycleLog.lastError}
                  {cycleLog.resume && (
                    <>
                      <br />
                      <span className="muted" style={{ fontSize: '0.85rem' }}>
                        续跑：{cycleLog.resume.skipTick ? '跳过 tick' : '含 tick'}
                        {cycleLog.resume.collisionId ? ' · 保留碰撞' : ''}
                        {cycleLog.resume.episodeNumber
                          ? ` · 事件包 #${cycleLog.resume.episodeNumber}`
                          : ''}
                      </span>
                    </>
                  )}
                  <div style={{ marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={loading !== null}
                      onClick={() =>
                        run('cycle-retry', () => post(`/api/novels/${novelId}/cycle/retry`))
                      }
                    >
                      {loading === 'cycle-retry' ? '提交中...' : '续跑失败周期'}
                    </button>
                  </div>
                </div>
              )}
              {cycleLog && cycleLog.lastStatus !== 'failed' && (
                <p className="muted">
                  上次周期：{formatDateTime(cycleLog.lastRunAt)} · 累计{' '}
                  {cycleLog.runsTotal} 次
                  <br />
                  {cycleLog.skippedTick ? '' : `推进 ${cycleLog.tickDays} 天 → `}
                  {cycleLog.collisionTitle
                    ? `碰撞「${cycleLog.collisionTitle}」→ `
                    : '主人公线 → '}
                  事件包 #{cycleLog.episodeNumber}
                  {cycleLog.chapterNumber
                    ? ` → 第${cycleLog.chapterNumber}章《${cycleLog.chapterTitle}》`
                    : ''}
                </p>
              )}
              <CycleRunHistoryList runs={cycleRunHistory} />
              {nextRecommendedCollision && (
                <p className="muted">
                  推荐碰撞：{nextRecommendedCollision.title}
                  {nextRecommendedCollision.required ? '（必须发生）' : ''}
                </p>
              )}
              <div className="actions" style={{ marginBottom: '0.75rem' }}>
                <button
                  className="btn"
                  disabled={loading !== null || Boolean(activeCycleRun)}
                  title={activeCycleRun ? '周期链执行中' : undefined}
                  onClick={() =>
                    run('cycle', () =>
                      post(`/api/novels/${novelId}/cycle`, {
                        tickDays,
                        targetWords,
                        maxCollisions,
                        autoDiscoverCollisions: true,
                      })
                    )
                  }
                >
                  {loading === 'cycle' ? '提交中...' : '按主人公线写下一章'}
                </button>
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  tick → 主人公线事件包 → 写章（有碰撞则自动插入增强）
                </span>
              </div>
              <div className="actions">
                <label className="muted">
                  推进天数{' '}
                  <input
                    type="number"
                    min={1}
                    max={7}
                    value={tickDays}
                    onChange={(e) => setTickDays(Number(e.target.value))}
                    style={{ width: 48, display: 'inline-block', marginBottom: 0 }}
                  />
                </label>
                <label className="muted">
                  碰撞数{' '}
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={maxCollisions}
                    onChange={(e) => setMaxCollisions(Number(e.target.value))}
                    style={{ width: 56, display: 'inline-block', marginBottom: 0 }}
                  />
                </label>
                <button
                  className="btn"
                  disabled={loading !== null}
                  onClick={() =>
                    run('tick', () =>
                      post(`/api/novels/${novelId}/tick`, {
                        tickDays,
                        maxCollisions,
                        autoDiscoverCollisions: true,
                      })
                    )
                  }
                >
                  {loading === 'tick' ? '提交中...' : `推进世界 +${tickDays} 天`}
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={loading !== null}
                  onClick={() =>
                    run('collisions', () =>
                      post(`/api/novels/${novelId}/collisions`, { maxCollisions })
                    )
                  }
                >
                  {loading === 'collisions' ? '提交中...' : '发现碰撞'}
                </button>
              </div>
              <h4 style={{ marginTop: '1.25rem' }}>产出控制</h4>
              <p className="muted">
                {activeCycleRun
                  ? '周期链进行中：worker 正在执行 tick → 主人公线事件包 → 写章'
                  : schedEnabled && schedMode === 'narrative-auto'
                    ? `定时已开启：${schedCron} · 每轮推进 ${tickDays} 天 · 目标 ${targetWords} 字`
                    : pendingJobCount > 0
                      ? `队列中有 ${pendingJobCount} 个待执行任务`
                      : '未在自动产出'}
              </p>
              <div className="actions" style={{ marginBottom: '0.75rem' }}>
                <button
                  className="btn btn-secondary"
                  disabled={loading !== null || !canStopProduction}
                  onClick={() => save('production-stop', () => stopProduction())}
                  title={
                    canStopProduction
                      ? '关闭定时调度、取消排队任务、终止周期链'
                      : '当前没有可停止的产出任务'
                  }
                >
                  {loading === 'production-stop' ? '停止中...' : '停止产出'}
                </button>
                <button
                  className="btn"
                  disabled={loading !== null || Boolean(activeCycleRun)}
                  onClick={() => save('schedule-start', () => saveNarrativeAutoSchedule(true))}
                >
                  {loading === 'schedule-start' ? '启动中...' : '启动持续自动产出'}
                </button>
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  「停止产出」适用于一键章节与定时两种模式；正在执行的 LLM 任务会跑完当前步后停下
                </span>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={schedEnabled}
                  onChange={(e) => setSchedEnabled(e.target.checked)}
                />{' '}
                启用定时
              </label>
              <label>
                模式{' '}
                <select
                  value={schedMode}
                  onChange={(e) =>
                    setSchedMode(e.target.value as 'classic' | 'narrative' | 'narrative-auto')
                  }
                >
                  <option value="narrative-auto">双线自动（tick + 写章）</option>
                  <option value="narrative">双线叙事（仅推进世界）</option>
                  <option value="classic">经典大纲（写下一章）</option>
                </select>
              </label>
              <label>Cron</label>
              <input value={schedCron} onChange={(e) => setSchedCron(e.target.value)} />
              {(schedMode === 'narrative' || schedMode === 'narrative-auto') && (
                <>
                  <label>
                    每次推进天数{' '}
                    <input
                      type="number"
                      min={1}
                      max={7}
                      value={tickDays}
                      onChange={(e) => setTickDays(Number(e.target.value))}
                      style={{ width: 48 }}
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={schedAutoCollisions}
                      onChange={(e) => setSchedAutoCollisions(e.target.checked)}
                    />{' '}
                    Tick 后自动发现碰撞
                  </label>
                  <label>
                    每轮碰撞候选数{' '}
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={maxCollisions}
                      onChange={(e) => setMaxCollisions(Number(e.target.value))}
                      style={{ width: 56 }}
                    />
                  </label>
                </>
              )}
              {schedMode === 'narrative-auto' && (
                <label>
                  目标字数{' '}
                  <input
                    type="number"
                    min={3300}
                    value={targetWords}
                    onChange={(e) => setTargetWords(Number(e.target.value))}
                    style={{ width: 80 }}
                  />
                </label>
              )}
              <button
                className="btn btn-secondary"
                disabled={loading !== null}
                onClick={() =>
                  save('schedule', () =>
                    put('/api/schedules', {
                      novelId,
                      enabled: schedEnabled,
                      cron: schedCron,
                      mode: schedMode,
                      tickDays,
                      targetWords,
                      maxCollisions,
                      autoDiscoverCollisions: schedAutoCollisions,
                    })
                  )
                }
              >
                {loading === 'schedule' ? '保存中...' : '保存调度'}
              </button>
            </>
          )}
          {bible && (
            <>
              <h4>势力（可编辑目标）</h4>
              <ul>
                {bible.factions.map((f) => (
                  <li key={f.id} style={{ marginBottom: '0.75rem' }}>
                    <strong>{f.name}</strong>（{f.type}）
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        const goals = String(fd.get('goals') ?? '')
                          .split(/[,，、]/)
                          .map((s) => s.trim())
                          .filter(Boolean);
                        save(`faction-${f.id}`, () =>
                          patch(`/api/novels/${novelId}/timeline`, {
                            op: 'updateFactionGoals',
                            factionId: f.id,
                            goals,
                          })
                        );
                      }}
                    >
                      <input name="goals" defaultValue={f.goals.join('、')} />
                      <button type="submit" className="btn btn-sm btn-secondary" disabled={loading !== null}>
                        保存目标
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {tab === 'timeline' && (
        <div className="card card-wide">
          <h3>双线时间轴</h3>
          <p className="muted">
            横轴为故事内天数：世界线 → 配角隐线 → 主人公线。三轨均可拖拽改天与同日内排序。
          </p>
          {!world || !hero ? (
            <p className="muted">请先生成叙事宇宙</p>
          ) : (
            <TimelineVisualizer
              world={world}
              hero={hero}
              support={support}
              supportCharacters={bible?.supportCharacters ?? []}
              collisions={collisions}
              disabled={loading !== null}
              onMoveEvent={async (lane, eventId, day, beforeEventId) => {
                const op =
                  lane === 'world'
                    ? 'moveWorldEvent'
                    : lane === 'support'
                      ? 'moveSupportEvent'
                      : 'moveHeroEvent';
                await save(`tl-move-${eventId}`, () =>
                  patch(`/api/novels/${novelId}/timeline`, { op, eventId, day, beforeEventId })
                );
              }}
            />
          )}
        </div>
      )}

      {tab === 'world' && (
        <div className="card">
          <h3>世界线时间轴</h3>
          <p className="muted">可调整天数、锁定关键事件（锁定后 AI 不得改写）</p>
          {!world ? (
            <p className="muted">请先生成叙事宇宙</p>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>天</th>
                    <th>事件</th>
                    <th>地点</th>
                    <th>可见性</th>
                    <th>状态</th>
                    <th>锁定</th>
                  </tr>
                </thead>
                <tbody>
                  {world.events
                    .sort((a, b) => a.day - b.day)
                    .map((e) => (
                      <tr key={e.id}>
                        <td>
                          <input
                            className="inline-input"
                            type="number"
                            min={0}
                            defaultValue={e.day}
                            disabled={loading !== null}
                            onBlur={(ev) => {
                              const day = parseInt(ev.target.value, 10);
                              if (Number.isNaN(day) || day === e.day) return;
                              save(`wday-${e.id}`, () =>
                                patch(`/api/novels/${novelId}/timeline`, {
                                  op: 'updateWorldEvent',
                                  eventId: e.id,
                                  patch: { day },
                                })
                              );
                            }}
                          />
                        </td>
                        <td>
                          <strong>{e.title}</strong>
                          {e.locked && <span className="badge badge-warn">锁定</span>}
                          <div className="muted">{e.description}</div>
                        </td>
                        <td>{e.location}</td>
                        <td>{e.visibility}</td>
                        <td>{e.status}</td>
                        <td>
                          <input
                            type="checkbox"
                            checked={e.locked}
                            disabled={loading !== null}
                            onChange={(ev) =>
                              save(`wlock-${e.id}`, () =>
                                patch(`/api/novels/${novelId}/timeline`, {
                                  op: 'updateWorldEvent',
                                  eventId: e.id,
                                  patch: { locked: ev.target.checked },
                                })
                              )
                            }
                          />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <h4>添加世界事件</h4>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  save('add-world', () =>
                    patch(`/api/novels/${novelId}/timeline`, {
                      op: 'addWorldEvent',
                      event: {
                        day: parseInt(String(fd.get('day')), 10) || 0,
                        title: String(fd.get('title')),
                        description: String(fd.get('description')),
                        location: String(fd.get('location')),
                        visibility: 'secret',
                        consequences: [],
                        factionIds: [],
                      },
                    })
                  );
                  e.currentTarget.reset();
                }}
              >
                <div className="edit-row">
                  <input className="inline-input" name="day" type="number" min={0} placeholder="天" required />
                  <input name="title" placeholder="标题" required style={{ flex: 1, minWidth: 120 }} />
                  <input name="location" placeholder="地点" required style={{ flex: 1, minWidth: 100 }} />
                </div>
                <input name="description" placeholder="描述" required />
                <button type="submit" className="btn btn-secondary btn-sm" disabled={loading !== null}>
                  添加
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {tab === 'support' && (
        <div className="card">
          <h3>配角隐线</h3>
          <p className="muted">配角幕后行动，主角通常不知；可调整感知程度与锁定关键节点</p>
          {!support || !bible?.supportCharacters.length ? (
            <p className="muted">请先生成叙事宇宙（含配角档案）</p>
          ) : (
            <>
              {bible.supportCharacters.map((c) => (
                <form
                  key={c.id}
                  className="support-char-goals"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const goals = String(fd.get('goals') || '')
                      .split(/[,，、]/)
                      .map((g) => g.trim())
                      .filter(Boolean);
                    save(`sgoals-${c.id}`, () =>
                      patch(`/api/novels/${novelId}/timeline`, {
                        op: 'updateSupportCharacterGoals',
                        characterId: c.id,
                        goals,
                      })
                    );
                  }}
                >
                  <label>
                    {c.name}（{c.role}）目标
                  </label>
                  <input name="goals" defaultValue={c.goals.join('、')} />
                  <button type="submit" className="btn btn-sm btn-secondary" disabled={loading !== null}>
                    保存
                  </button>
                </form>
              ))}
              <table>
                <thead>
                  <tr>
                    <th>天</th>
                    <th>配角</th>
                    <th>行动</th>
                    <th>意图</th>
                    <th>地点</th>
                    <th>主角感知</th>
                    <th>锁定</th>
                  </tr>
                </thead>
                <tbody>
                  {support.events
                    .sort((a, b) => a.day - b.day || a.sortOrder - b.sortOrder)
                    .map((e) => {
                      const who =
                        bible.supportCharacters.find((c) => c.id === e.characterId)?.name ??
                        e.characterId;
                      return (
                        <tr key={e.id}>
                          <td>
                            <input
                              className="inline-input"
                              type="number"
                              min={0}
                              defaultValue={e.day}
                              disabled={loading !== null}
                              onBlur={(ev) => {
                                const day = parseInt(ev.target.value, 10);
                                if (Number.isNaN(day) || day === e.day) return;
                                save(`sday-${e.id}`, () =>
                                  patch(`/api/novels/${novelId}/timeline`, {
                                    op: 'updateSupportEvent',
                                    eventId: e.id,
                                    patch: { day },
                                  })
                                );
                              }}
                            />
                          </td>
                          <td>{who}</td>
                          <td>
                            {e.title}
                            {e.locked && <span className="badge badge-warn">锁定</span>}
                          </td>
                          <td className="muted">{e.intent}</td>
                          <td>{e.location}</td>
                          <td>
                            <select
                              className="inline-input"
                              defaultValue={e.protagonistAwareness}
                              disabled={loading !== null}
                              onChange={(ev) =>
                                save(`saware-${e.id}`, () =>
                                  patch(`/api/novels/${novelId}/timeline`, {
                                    op: 'updateSupportEvent',
                                    eventId: e.id,
                                    patch: {
                                      protagonistAwareness: ev.target.value as
                                        | 'none'
                                        | 'rumor'
                                        | 'partial',
                                    },
                                  })
                                )
                              }
                            >
                              <option value="none">none</option>
                              <option value="rumor">rumor</option>
                              <option value="partial">partial</option>
                            </select>
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              checked={e.locked}
                              disabled={loading !== null}
                              onChange={(ev) =>
                                save(`slock-${e.id}`, () =>
                                  patch(`/api/novels/${novelId}/timeline`, {
                                    op: 'updateSupportEvent',
                                    eventId: e.id,
                                    patch: { locked: ev.target.checked },
                                  })
                                )
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              <h4>添加配角行动</h4>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  save('add-support', () =>
                    patch(`/api/novels/${novelId}/timeline`, {
                      op: 'addSupportEvent',
                      event: {
                        characterId: String(fd.get('characterId')),
                        day: parseInt(String(fd.get('day')), 10) || 0,
                        title: String(fd.get('title')),
                        intent: String(fd.get('intent')),
                        location: String(fd.get('location')),
                        protagonistAwareness: String(fd.get('awareness') || 'none') as
                          | 'none'
                          | 'rumor'
                          | 'partial',
                        worldEventIds: [],
                      },
                    })
                  );
                  e.currentTarget.reset();
                }}
              >
                <div className="edit-row">
                  <select name="characterId" required className="inline-input">
                    {bible.supportCharacters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input className="inline-input" name="day" type="number" min={0} placeholder="天" required />
                  <input name="title" placeholder="行动标题" required style={{ flex: 1 }} />
                  <input name="location" placeholder="地点" required style={{ flex: 1 }} />
                </div>
                <input name="intent" placeholder="意图" required />
                <select name="awareness" className="inline-input" defaultValue="none">
                  <option value="none">主角感知：none</option>
                  <option value="rumor">主角感知：rumor</option>
                  <option value="partial">主角感知：partial</option>
                </select>
                <button type="submit" className="btn btn-secondary btn-sm" disabled={loading !== null}>
                  添加
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {tab === 'hero' && (
        <div className="card">
          <h3>主人公线</h3>
          {!hero ? (
            <p className="muted">请先生成叙事宇宙</p>
          ) : (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  save('hero-profile', () =>
                    patch(`/api/novels/${novelId}/timeline`, {
                      op: 'updateHeroProfile',
                      protagonistGoal: String(fd.get('goal')),
                      crisis: String(fd.get('crisis') || ''),
                    })
                  );
                }}
              >
                <label>当前目标</label>
                <input name="goal" defaultValue={hero.protagonistGoal} />
                <label>当前危机</label>
                <input name="crisis" defaultValue={hero.crisis ?? ''} />
                <button type="submit" className="btn btn-sm btn-secondary" disabled={loading !== null}>
                  保存主角状态
                </button>
              </form>
              <div className="actions" style={{ margin: '0.75rem 0' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={loading !== null}
                  onClick={() =>
                    run('plan-hero', () => post(`/api/novels/${novelId}/episodes`, {}))
                  }
                >
                  {loading === 'plan-hero' ? '提交中...' : '按主人公线规划下一章'}
                </button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>天</th>
                    <th>行动</th>
                    <th>意图</th>
                    <th>地点</th>
                    <th>锁定</th>
                  </tr>
                </thead>
                <tbody>
                  {hero.events
                    .sort((a, b) => a.day - b.day)
                    .map((e) => (
                      <tr key={e.id}>
                        <td>
                          <input
                            className="inline-input"
                            type="number"
                            min={0}
                            defaultValue={e.day}
                            disabled={loading !== null}
                            onBlur={(ev) => {
                              const day = parseInt(ev.target.value, 10);
                              if (Number.isNaN(day) || day === e.day) return;
                              save(`hday-${e.id}`, () =>
                                patch(`/api/novels/${novelId}/timeline`, {
                                  op: 'updateHeroEvent',
                                  eventId: e.id,
                                  patch: { day },
                                })
                              );
                            }}
                          />
                        </td>
                        <td>
                          {e.title}
                          {e.locked && <span className="badge badge-warn">锁定</span>}
                        </td>
                        <td className="muted">{e.intent}</td>
                        <td>{e.location}</td>
                        <td>
                          <input
                            type="checkbox"
                            checked={e.locked}
                            disabled={loading !== null}
                            onChange={(ev) =>
                              save(`hlock-${e.id}`, () =>
                                patch(`/api/novels/${novelId}/timeline`, {
                                  op: 'updateHeroEvent',
                                  eventId: e.id,
                                  patch: { locked: ev.target.checked },
                                })
                              )
                            }
                          />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <h4>添加主角行动</h4>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  save('add-hero', () =>
                    patch(`/api/novels/${novelId}/timeline`, {
                      op: 'addHeroEvent',
                      event: {
                        day: parseInt(String(fd.get('day')), 10) || 0,
                        title: String(fd.get('title')),
                        intent: String(fd.get('intent')),
                        location: String(fd.get('location')),
                        constraints: [],
                        knownWorldFacts: [],
                      },
                    })
                  );
                  e.currentTarget.reset();
                }}
              >
                <div className="edit-row">
                  <input className="inline-input" name="day" type="number" min={0} placeholder="天" required />
                  <input name="title" placeholder="行动" required style={{ flex: 1 }} />
                  <input name="location" placeholder="地点" required style={{ flex: 1 }} />
                </div>
                <input name="intent" placeholder="意图" required />
                <button type="submit" className="btn btn-secondary btn-sm" disabled={loading !== null}>
                  添加
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {tab === 'power' && (
        <div className="card card-wide">
          <h3>战力体系 / 角色资产</h3>
          {!powerSystem ? (
            <p className="muted">请先生成叙事宇宙，系统会自动设计战力体系。</p>
          ) : (
            <>
              <h4>{powerSystem.systemName}</h4>
              <p className="muted">
                核心：{powerSystem.coreEnergy} · 单位：{powerSystem.rankUnit}
              </p>
              <div className="rank-grid">
                {powerSystem.ranks
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((rank) => (
                    <div className="rank-card" key={rank.id}>
                      <strong>
                        {rank.order}. {rank.name}
                      </strong>
                      <p>{rank.description}</p>
                      <p className="muted">突破：{rank.breakthroughRequirement}</p>
                      <p className="muted">能力：{rank.signatureAbilities.join('、') || '无'}</p>
                    </div>
                  ))}
              </div>

              <h4>角色属性与物品</h4>
              {!characterAssets?.characters.length ? (
                <p className="muted">暂无角色资产。</p>
              ) : (
                <div className="asset-grid">
                  {characterAssets.characters.map((c) => {
                    const rank = powerSystem.ranks.find((r) => r.id === c.currentRankId);
                    return (
                      <div className="rank-card" key={c.characterId}>
                        <strong>
                          {c.name}（{c.role}）
                        </strong>
                        <p className="muted">当前阶位：{rank?.name ?? c.currentRankId ?? '未入阶'}</p>
                        <p className="muted">能力：{c.abilities.join('、') || '无'}</p>
                        <p className="muted">
                          物品：{c.inventory.map((i) => `${i.name}/${i.status}`).join('、') || '无'}
                        </p>
                        <p className="muted">伤势：{c.injuries.join('、') || '无'}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const next = parseJsonField<PowerSystemFile>(fd.get('powerSystem'));
                  if (!next) return;
                  save('power-system', () =>
                    patch(`/api/novels/${novelId}/timeline`, {
                      op: 'replacePowerSystem',
                      powerSystem: next,
                    })
                  );
                }}
              >
                <h4>编辑战力体系 JSON</h4>
                <textarea
                  name="powerSystem"
                  className="json-editor"
                  defaultValue={JSON.stringify(powerSystem, null, 2)}
                />
                <button className="btn btn-secondary btn-sm" disabled={loading !== null}>
                  保存战力体系
                </button>
              </form>

              {characterAssets && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const next = parseJsonField<CharacterAssetsFile>(fd.get('characterAssets'));
                    if (!next) return;
                    save('character-assets', () =>
                      patch(`/api/novels/${novelId}/timeline`, {
                        op: 'replaceCharacterAssets',
                        characterAssets: next,
                      })
                    );
                  }}
                >
                  <h4>编辑角色资产 JSON</h4>
                  <textarea
                    name="characterAssets"
                    className="json-editor"
                    defaultValue={JSON.stringify(characterAssets, null, 2)}
                  />
                  <button className="btn btn-secondary btn-sm" disabled={loading !== null}>
                    保存角色资产
                  </button>
                </form>
              )}

              {storyArcs && (
                <>
                  <h4>分卷大纲</h4>
                  <ul className="arc-list">
                    {storyArcs.arcs.map((arc) => (
                      <li key={arc.id}>
                        第 {arc.volumeNumber} 卷《{arc.name}》（{arc.chapterStart}–{arc.chapterEnd} 章）·{' '}
                        {arc.status}
                      </li>
                    ))}
                  </ul>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      const next = parseJsonField<StoryArcsFile>(fd.get('storyArcs'));
                      if (!next) return;
                      save('story-arcs', () =>
                        patch(`/api/novels/${novelId}/timeline`, {
                          op: 'replaceStoryArcs',
                          storyArcs: next,
                        })
                      );
                    }}
                  >
                    <h4>编辑分卷大纲 JSON</h4>
                    <textarea
                      name="storyArcs"
                      className="json-editor"
                      defaultValue={JSON.stringify(storyArcs, null, 2)}
                    />
                    <button className="btn btn-secondary btn-sm" disabled={loading !== null}>
                      保存分卷大纲
                    </button>
                  </form>
                </>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'collisions' && (
        <div className="card">
          <h3>碰撞工坊</h3>
          <p className="muted">
            碰撞用于增强主人公线章节；也可在此从指定碰撞手动生成事件包
          </p>
          <button
            className="btn btn-secondary"
            disabled={loading !== null || !hasUniverse}
            onClick={() =>
              run('collisions', () =>
                post(`/api/novels/${novelId}/collisions`, { maxCollisions })
              )
            }
          >
            {loading === 'collisions' ? '提交中...' : '重新发现碰撞'}
          </button>
          {candidates.length === 0 ? (
            <p className="muted" style={{ marginTop: '1rem' }}>
              暂无候选碰撞
            </p>
          ) : (
            <div className="collision-list">
              {candidates.map((c) => (
                <div key={c.id} className={`collision-card${c.required ? ' required' : ''}`}>
                  <h4>
                    {c.title}
                    {c.required && <span className="badge badge-warn"> 必须发生</span>}
                  </h4>
                  <p className="muted">
                    第{c.day}天 · {c.location} · {c.collisionType}
                  </p>
                  <p className="muted">
                    明线强度 {c.surfaceStrength} · 隐线暴露风险 {c.disclosureRisk} · 因果紧密度{' '}
                    {c.causalTightness}
                  </p>
                  <p>
                    <strong>表层冲突（明线）：</strong>
                    {c.surfaceConflict}
                  </p>
                  <p>
                    <strong>幕后因果（隐线，仅供策划）：</strong>
                    {c.hiddenCausality}
                  </p>
                  <p className="muted">{c.rationale}</p>
                  <div className="actions">
                    <button
                      className="btn"
                      disabled={loading !== null}
                      onClick={() =>
                        run(`plan-${c.id}`, () =>
                          post(`/api/novels/${novelId}/episodes`, { collisionId: c.id })
                        )
                      }
                    >
                      {loading === `plan-${c.id}` ? '提交中...' : '生成事件包'}
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={loading !== null}
                      onClick={() =>
                        save(`req-${c.id}`, () =>
                          patch(`/api/novels/${novelId}/collisions`, {
                            op: 'update',
                            collisionId: c.id,
                            required: !c.required,
                          })
                        )
                      }
                    >
                      {c.required ? '取消必须' : '标为必须发生'}
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={loading !== null}
                      onClick={() =>
                        save(`rej-${c.id}`, () =>
                          patch(`/api/novels/${novelId}/collisions`, {
                            op: 'reject',
                            collisionId: c.id,
                          })
                        )
                      }
                    >
                      拒绝
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'episodes' && (
        <div className="card">
          <h3>章节产出</h3>
          {episodes.length === 0 ? (
            <>
              <p className="muted">
                还没有事件包。默认按主人公线规划下一章；若附近有碰撞，会自动插入为章节增强。
              </p>
              <div className="actions">
                <button
                  className="btn"
                  disabled={loading !== null || !hero}
                  onClick={() =>
                    run('plan-hero-episodes', () => post(`/api/novels/${novelId}/episodes`, {}))
                  }
                >
                  {loading === 'plan-hero-episodes' ? '提交中...' : '按主人公线规划下一章'}
                </button>
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  也可在「宇宙概览」一键产出，或在「碰撞工坊」从指定碰撞生成事件包
                </span>
              </div>
            </>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>标题</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {episodes.map((ep) => (
                  <tr key={ep.episodeNumber}>
                    <td>{ep.episodeNumber}</td>
                    <td>
                      {ep.title}
                      <div className="muted">{ep.surfaceConflict}</div>
                      {ep.shadowHints?.length > 0 && (
                        <div className="muted">
                          隐线暗示 {ep.shadowHints.length} 条 · 明线节拍{' '}
                          {ep.sceneBeats.filter((b) => b.line === 'hero').length} / 暗示{' '}
                          {ep.sceneBeats.filter((b) => b.line === 'shadow-hint').length}
                        </div>
                      )}
                    </td>
                    <td>{ep.status}</td>
                    <td>
                      {ep.status !== 'written' && (
                        <button
                          className="btn btn-secondary"
                          disabled={loading !== null}
                          onClick={() =>
                            run(`write-${ep.episodeNumber}`, () =>
                              post(`/api/novels/${novelId}/episodes/${ep.episodeNumber}`)
                            )
                          }
                        >
                          {loading === `write-${ep.episodeNumber}` ? '提交中...' : '写出章节'}
                        </button>
                      )}
                      {ep.chapterNumber && (
                        <Link href={`/novels/${novelId}/chapters/${ep.chapterNumber}`}>
                          阅读第{ep.chapterNumber}章
                        </Link>
                      )}
                      {ep.writingDrafts?.surfaceDraft && (
                        <details>
                          <summary className="muted">写作中间稿</summary>
                          <div className="draft-preview">
                            <strong>明线草稿</strong>
                            {ep.writingDrafts.surfaceDraft.slice(0, 300)}
                            {ep.writingDrafts.wovenDraft && (
                              <>
                                {'\n\n'}
                                <strong>织入后</strong>
                                {ep.writingDrafts.wovenDraft.slice(0, 300)}
                              </>
                            )}
                          </div>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {chapterNumbers.length > 0 && (
            <>
              <h4>已产出章节</h4>
              <ul>
                {chapterNumbers.map((n) => (
                  <li key={n}>
                    <Link href={`/novels/${novelId}/chapters/${n}`}>第 {n} 章</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
