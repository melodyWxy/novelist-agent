import type { CycleRun } from '@core/narrative/types';
import { CYCLE_STAGE_LABELS } from '@core/narrative/cycle-labels';
import { formatDateTime } from '@/lib/format-datetime';

interface Props {
  runs: CycleRun[];
  limit?: number;
}

export function CycleRunHistoryList({ runs, limit = 8 }: Props) {
  const shown = runs.slice(0, limit);
  if (shown.length === 0) return null;

  return (
    <div className="cycle-history" style={{ marginTop: '0.75rem' }}>
      <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.35rem' }}>
        周期链历史（最近 {shown.length}
        {runs.length > shown.length ? ` / 共 ${runs.length}` : ''} 轮）
      </p>
      <ul className="cycle-history-list" style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
        {shown.map((run) => (
          <li key={run.id} style={{ marginBottom: '0.25rem' }}>
            <span
              className={run.status === 'completed' ? 'badge badge-success' : 'badge badge-danger'}
              style={{ marginRight: '0.35rem' }}
            >
              {run.status === 'completed' ? '成功' : '失败'}
            </span>
            {formatDateTime(run.startedAt)}
            {run.collisionTitle ? ` · 「${run.collisionTitle}」` : ''}
            {run.chapterNumber ? ` → 第${run.chapterNumber}章` : ''}
            {run.status === 'failed' && run.failedStage
              ? ` · ${CYCLE_STAGE_LABELS[run.failedStage]}失败`
              : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
