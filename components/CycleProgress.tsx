'use client';

import type { CycleRun, CycleStageName } from '@core/narrative/types';
import { CYCLE_STAGE_LABELS, stageStatusLabel } from '@core/narrative/cycle-labels';
import { formatDateTime } from '@/lib/format-datetime';

const STAGE_ORDER: CycleStageName[] = ['tick', 'collision', 'plan', 'write'];

interface Props {
  run: CycleRun;
}

export function CycleProgress({ run }: Props) {
  return (
    <div className="cycle-progress">
      <p className="muted" style={{ marginBottom: '0.5rem' }}>
        周期链进行中 · 开始于 {formatDateTime(run.startedAt)}
      </p>
      <ol className="cycle-stages">
        {STAGE_ORDER.map((name) => {
          const stage = run.stages[name];
          const isActive = stage.status === 'running';
          const isFailed = stage.status === 'failed';
          return (
            <li
              key={name}
              className={`cycle-stage cycle-stage--${stage.status}${isActive ? ' cycle-stage--active' : ''}${isFailed ? ' cycle-stage--failed' : ''}`}
            >
              <span className="cycle-stage-label">{CYCLE_STAGE_LABELS[name]}</span>
              <span className="cycle-stage-status">{stageStatusLabel(stage.status)}</span>
              {stage.error && (
                <span className="cycle-stage-error" title={stage.error}>
                  {stage.error}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {run.collisionTitle && (
        <p className="muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
          碰撞：{run.collisionTitle}
          {run.episodeNumber ? ` · 事件包 #${run.episodeNumber}` : ''}
        </p>
      )}
    </div>
  );
}
