import Link from 'next/link';
import { listNovelSummaries } from '@core/services/novel-service';
import { listJobs } from '@core/jobs/queue';
import { formatDateTime } from '@/lib/format-datetime';
import { NovelImportForm } from '@/components/NovelImportForm';

export const dynamic = 'force-dynamic';

function statusBadge(enabled: boolean) {
  return enabled ? (
    <span className="badge badge-success">定时 ON</span>
  ) : (
    <span className="badge">定时 OFF</span>
  );
}

export default async function HomePage() {
  const [novels, jobs] = await Promise.all([listNovelSummaries(), listJobs(5)]);
  const pendingCount = jobs.filter((j) => j.status === 'pending' || j.status === 'running').length;

  return (
    <div>
      <div className="card">
        <h2>叙事宇宙工作台</h2>
        <p className="muted">
          共 {novels.length} 部作品 · 活跃任务 {pendingCount} 个 · 双线叙事引擎
        </p>
        <p className="muted">
          启动方式：<code>npm run dev:all</code>（Web 固定{' '}
          <a href="http://localhost:3020">http://localhost:3020</a>，勿用 3000 — 常被其他进程占用）
        </p>
        <NovelImportForm />
      </div>

      <h2>作品列表</h2>
      {novels.length === 0 ? (
        <div className="card">
          <p>暂无作品。</p>
          <Link href="/novels/new" className="btn">
            创建第一部作品
          </Link>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>书名</th>
              <th>题材</th>
              <th>进度</th>
              <th>宇宙</th>
              <th>碰撞</th>
              <th>调度</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {novels.map((n) => (
              <tr key={n.id}>
                <td>
                  <Link href={`/novels/${n.id}`}>{n.title}</Link>
                  <div className="muted">{n.id}</div>
                </td>
                <td>{n.genre}</td>
                <td>
                  第 {n.lastChapterNumber} 章
                  {n.hasUniverse && <span className="muted"> · 世界第{n.worldDay}天</span>}
                </td>
                <td>{n.hasUniverse ? '✓' : '—'}</td>
                <td>{n.candidateCollisions > 0 ? n.candidateCollisions : '—'}</td>
                <td>{statusBadge(n.scheduleEnabled)}</td>
                <td>
                  <a className="btn btn-secondary" href={`/api/novels/${n.id}/export`}>
                    导出
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: '2rem' }}>最近任务</h2>
      <table>
        <thead>
          <tr>
            <th>作品</th>
            <th>类型</th>
            <th>状态</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
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
            </tr>
          ))}
        </tbody>
      </table>
      <Link href="/jobs" className="btn btn-secondary" style={{ marginTop: '1rem' }}>
        查看全部任务
      </Link>
    </div>
  );
}
