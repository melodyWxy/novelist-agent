import { JobRetryButton } from '@/components/JobRetryButton';
import { formatDateTime } from '@/lib/format-datetime';
import { listJobsForDisplay } from '@core/jobs/queue';
import { formatRetryWait, isJobDue } from '@core/jobs/retry-backoff';

export const dynamic = 'force-dynamic';

export default async function JobsPage() {
  const { jobs, stats } = await listJobsForDisplay(80);

  return (
    <div>
      <h2>任务队列</h2>
      <p className="muted">
        任务由 worker 进程执行。运行 <code>npm run dev:worker</code>
        {' · '}
        进行中 {stats.pending + stats.running}（pending {stats.pending} / running{' '}
        {stats.running}）· 失败 {stats.failed} · 已完成 {stats.completed}
        （本页优先展示进行中与近期失败）
      </p>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>作品</th>
            <th>类型</th>
            <th>状态</th>
            <th>创建</th>
            <th>尝试</th>
            <th>计划执行</th>
            <th>结果 / 错误</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td className="muted" style={{ fontSize: '0.75rem' }}>
                {j.id.slice(0, 8)}…
              </td>
              <td>{j.novelId}</td>
              <td>{j.type}</td>
              <td>
                <span
                  className={`badge ${
                    j.status === 'completed'
                      ? 'badge-success'
                      : j.status === 'failed'
                        ? 'badge-danger'
                        : j.status === 'running'
                          ? 'badge-warn'
                          : ''
                  }`}
                >
                  {j.status}
                </span>
              </td>
              <td className="muted">{formatDateTime(j.createdAt)}</td>
              <td className="muted">
                {j.attempt ?? 1}/{j.maxAttempts ?? 1}
              </td>
              <td className="muted">
                {j.status === 'pending' && j.runAt && !isJobDue(j)
                  ? formatRetryWait(j.runAt)
                  : j.status === 'pending' && j.runAt
                    ? formatDateTime(j.runAt)
                    : '—'}
              </td>
              <td className="muted">{j.resultSummary ?? j.error ?? '—'}</td>
              <td>
                {j.status === 'failed' && <JobRetryButton jobId={j.id} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
