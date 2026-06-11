'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props {
  novelId: string;
  hasOutline: boolean;
  schedule: {
    enabled: boolean;
    cron: string;
    targetWords: number;
    maxChapters?: number;
  } | null;
}

export function NovelActions({ novelId, hasOutline, schedule }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [cron, setCron] = useState(schedule?.cron ?? '0 9 * * *');
  const [enabled, setEnabled] = useState(schedule?.enabled ?? false);
  const [targetWords, setTargetWords] = useState(schedule?.targetWords ?? 3500);
  const [chapterCount, setChapterCount] = useState(10);
  const [specificChapter, setSpecificChapter] = useState(1);

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

  async function put(url: string, body: unknown) {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '请求失败');
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

  return (
    <div className="card">
      <h3>操作</h3>
      <div className="actions">
        <button
          className="btn"
          disabled={loading !== null}
          onClick={() =>
            run('outline', () =>
              post(`/api/novels/${novelId}/outline`, { chapterCount })
            )
          }
        >
          {loading === 'outline' ? '提交中...' : hasOutline ? '重新生成大纲' : '生成大纲'}
        </button>
        <label className="muted">
          章节数{' '}
          <input
            type="number"
            value={chapterCount}
            onChange={(e) => setChapterCount(Number(e.target.value))}
            style={{ width: 60, display: 'inline-block', marginBottom: 0 }}
          />
        </label>
      </div>

      <div className="actions" style={{ marginTop: '0.5rem' }}>
        <button
          className="btn"
          disabled={loading !== null || !hasOutline}
          onClick={() =>
            run('next', () =>
              post(`/api/novels/${novelId}/chapters`, { mode: 'next', targetWords })
            )
          }
        >
          {loading === 'next' ? '提交中...' : '写下一章'}
        </button>
        <input
          type="number"
          value={specificChapter}
          onChange={(e) => setSpecificChapter(Number(e.target.value))}
          style={{ width: 60 }}
        />
        <button
          className="btn btn-secondary"
          disabled={loading !== null || !hasOutline}
          onClick={() =>
            run('specific', () =>
              post(`/api/novels/${novelId}/chapters`, {
                mode: 'specific',
                chapterNumber: specificChapter,
                targetWords,
              })
            )
          }
        >
          写指定章
        </button>
      </div>

      <h3 style={{ marginTop: '1.5rem' }}>定时产出</h3>
      <p className="muted">需同时运行 npm run dev:worker</p>
      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />{' '}
        启用定时
      </label>
      <label>Cron 表达式</label>
      <input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 9 * * *" />
      <label>目标字数</label>
      <input
        type="number"
        min={3300}
        value={targetWords}
        onChange={(e) => setTargetWords(Number(e.target.value))}
      />
      <button
        className="btn btn-secondary"
        disabled={loading !== null}
        onClick={() =>
          run('schedule', () =>
            put('/api/schedules', { novelId, enabled, cron, targetWords })
          )
        }
      >
        {loading === 'schedule' ? '保存中...' : '保存调度配置'}
      </button>
    </div>
  );
}
