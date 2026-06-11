import { formatDateTime } from '../lib/format-datetime.js';

/**
 * 任务失败后的指数退避延迟
 *
 * nextAttempt=2 → baseMs
 * nextAttempt=3 → baseMs * 2
 * nextAttempt=4 → baseMs * 4
 */

export interface RetryBackoffOptions {
  /** 首次重试基础等待（毫秒） */
  baseMs: number;
  /** 单次等待上限 */
  maxMs: number;
  /** 是否在 [0, delay] 内随机抖动，减轻惊群 */
  jitter: boolean;
}

export const DEFAULT_RETRY_BACKOFF: RetryBackoffOptions = {
  baseMs: 30_000,
  maxMs: 15 * 60_000,
  jitter: true,
};

/** 根据即将入队的 attempt 计算等待毫秒（attempt≥2 时有效） */
export function computeRetryDelayMs(
  nextAttempt: number,
  options: RetryBackoffOptions = DEFAULT_RETRY_BACKOFF
): number {
  if (nextAttempt < 2) return 0;
  const exponent = nextAttempt - 2;
  let delay = options.baseMs * 2 ** exponent;
  delay = Math.min(delay, options.maxMs);
  if (options.jitter && delay > 0) {
    delay = Math.floor(Math.random() * (delay + 1));
  }
  return Math.max(0, delay);
}

export function computeRetryRunAt(
  nextAttempt: number,
  options?: RetryBackoffOptions,
  nowMs: number = Date.now()
): string {
  const delayMs = computeRetryDelayMs(nextAttempt, options);
  return new Date(nowMs + delayMs).toISOString();
}

/** pending 任务是否已到可执行时间（无 runAt 视为立即可执行） */
export function isJobDue(job: { runAt?: string }, nowMs: number = Date.now()): boolean {
  if (!job.runAt) return true;
  return new Date(job.runAt).getTime() <= nowMs;
}

export function formatRetryWait(runAt: string, nowMs: number = Date.now()): string {
  const diffMs = new Date(runAt).getTime() - nowMs;
  if (diffMs <= 0) return '即将执行';
  const sec = Math.ceil(diffMs / 1000);
  if (sec < 60) return `${sec} 秒后`;
  const min = Math.ceil(sec / 60);
  if (min < 60) return `${min} 分钟后`;
  return formatDateTime(runAt);
}
