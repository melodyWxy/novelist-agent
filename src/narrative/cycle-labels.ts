import type { CycleStageName, CycleStageStatus } from './types.js';

export const CYCLE_STAGE_LABELS: Record<CycleStageName, string> = {
  tick: '推进世界',
  collision: '选碰撞',
  plan: '生成事件包',
  write: '写章',
};

export function stageStatusLabel(status: CycleStageStatus): string {
  switch (status) {
    case 'pending':
      return '待执行';
    case 'running':
      return '进行中';
    case 'completed':
      return '完成';
    case 'failed':
      return '失败';
    case 'skipped':
      return '跳过';
  }
}
