'use client';

import type { QualityMetrics } from '@core/narrative/quality-metrics';

interface Props {
  metrics: QualityMetrics;
}

function fmtScore(score: number | null): string {
  if (score == null) return '—';
  return score.toFixed(1);
}

function fmtRate(rate: number | null): string {
  if (rate == null) return '—';
  return `${Math.round(rate * 100)}%`;
}

export function QualityMetricsPanel({ metrics }: Props) {
  const { currentArc, recentScores, recentMemories } = metrics;

  return (
    <div className="metrics-panel">
      <h4>连载质量面板</h4>
      <div className="metrics-grid">
        <div className="metric-card">
          <span className="metric-label">已写章节</span>
          <strong>{metrics.totalChapters}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">累计字数</span>
          <strong>{metrics.totalWords.toLocaleString()}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">平均审稿分</span>
          <strong>{fmtScore(metrics.avgReviewScore)}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">通过率</span>
          <strong>{fmtRate(metrics.passRate)}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">未回收伏笔</span>
          <strong>{metrics.openForeshadowing}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">已回收伏笔</span>
          <strong>{metrics.resolvedForeshadowing}</strong>
        </div>
      </div>

      {currentArc && (
        <div className="metrics-arc">
          <p>
            <strong>当前分卷：</strong>第 {currentArc.volumeNumber} 卷《{currentArc.name}》（第
            {currentArc.chapterStart}–{currentArc.chapterEnd} 章）
          </p>
          <p className="muted">阶段目标：{currentArc.phaseGoal}</p>
        </div>
      )}

      <p className="muted">
        <strong>节奏建议：</strong>
        {metrics.pacingNote}
      </p>

      {recentScores.length > 0 && (
        <div className="metrics-recent">
          <p className="muted">近 {recentScores.length} 章审稿</p>
          <ul>
            {recentScores.map((r) => (
              <li key={r.chapterNumber}>
                第 {r.chapterNumber} 章 · {r.score} 分 · {r.wordCount} 字
                {r.passed ? '' : ' · 未通过'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recentMemories.length > 0 && (
        <div className="metrics-recent">
          <p className="muted">章节记忆（压缩上下文）</p>
          <ul>
            {recentMemories.map((m) => (
              <li key={m.chapterNumber}>
                第 {m.chapterNumber} 章《{m.title}》：{m.summary}
                {m.powerChanges.length > 0 ? ` · 战力：${m.powerChanges.join('、')}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
