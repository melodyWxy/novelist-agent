'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type AssistantScope =
  | 'overview'
  | 'timeline'
  | 'world'
  | 'support'
  | 'hero'
  | 'power'
  | 'collisions'
  | 'episodes'
  | 'chapter';

interface ContentEdit {
  target: string;
  label: string;
  summary: string;
}

interface AgentAction {
  action: string;
  label: string;
  summary: string;
}

interface AssistantProposal {
  proposalId: string;
  scope: AssistantScope;
  summary: string;
  risks: string[];
  contentEdits: ContentEdit[];
  agentActions: AgentAction[];
  createdAt: string;
}

interface Props {
  novelId: string;
  scope: AssistantScope;
  chapterNumber?: number;
  className?: string;
}

const SCOPE_LABELS: Record<AssistantScope, string> = {
  overview: '总览',
  timeline: '时间轴',
  world: '世界线',
  support: '配角隐线',
  hero: '主人公线',
  power: '战力体系',
  collisions: '碰撞工坊',
  episodes: '章节产出',
  chapter: '章节正文',
};

export function AIAssistantPanel({ novelId, scope, chapterNumber, className }: Props) {
  const router = useRouter();
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState<'preview' | 'apply' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<AssistantProposal | null>(null);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  async function handlePreview() {
    if (!instruction.trim()) {
      setError('请输入指令');
      return;
    }
    setLoading('preview');
    setError(null);
    setApplyMessage(null);
    try {
      const res = await fetch(`/api/novels/${novelId}/assistant/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: instruction.trim(),
          scope,
          chapterNumber,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '生成预览失败');
      setProposal(data.proposal);
      setExpanded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }

  async function handleApply() {
    if (!proposal) return;
    setLoading('apply');
    setError(null);
    setApplyMessage(null);
    try {
      const res = await fetch(`/api/novels/${novelId}/assistant/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '应用失败');

      const parts: string[] = [];
      if (data.result.appliedEdits?.length) {
        parts.push(`已应用 ${data.result.appliedEdits.length} 项内容修改`);
      }
      if (data.result.enqueuedJobs?.length) {
        parts.push(`已入队 ${data.result.enqueuedJobs.length} 个任务`);
      }
      if (data.result.agentResults?.length && !data.result.enqueuedJobs?.length) {
        parts.push(data.result.agentResults.map((r: { detail: string }) => r.detail).join('；'));
      }
      setApplyMessage(parts.join(' · ') || '已应用');
      setProposal(null);
      setInstruction('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className={`assistant-panel${className ? ` ${className}` : ''}`}>
      <div className="assistant-panel-header">
        <button
          type="button"
          className="assistant-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <span className="assistant-badge">AI</span>
          <strong>助手栏</strong>
          <span className="muted">· {SCOPE_LABELS[scope]}</span>
          <span className="assistant-chevron">{expanded ? '▾' : '▸'}</span>
        </button>
      </div>

      {expanded && (
        <div className="assistant-panel-body">
          <p className="muted assistant-hint">
            描述你想改什么或要执行的操作，先生成预览，确认后再应用。
          </p>
          <div className="assistant-input-row">
            <textarea
              className="assistant-input"
              rows={2}
              placeholder={
                scope === 'chapter'
                  ? '例如：按审稿意见润色本章，加强开篇悬念…'
                  : '例如：把第3天世界事件延后一天，并发现新碰撞…'
              }
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              disabled={loading !== null}
            />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={loading !== null || !instruction.trim()}
              onClick={handlePreview}
            >
              {loading === 'preview' ? '生成中…' : '生成预览'}
            </button>
          </div>

          {error && <p className="assistant-error">{error}</p>}
          {applyMessage && <p className="assistant-success">{applyMessage}</p>}

          {proposal && (
            <div className="assistant-preview">
              <h4>预览提案</h4>
              <p>{proposal.summary}</p>

              {proposal.risks.length > 0 && (
                <div className="assistant-risks">
                  <strong>风险提示</strong>
                  <ul>
                    {proposal.risks.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {proposal.contentEdits.length > 0 && (
                <div className="assistant-section">
                  <strong>内容修改（{proposal.contentEdits.length}）</strong>
                  <ul className="assistant-list">
                    {proposal.contentEdits.map((edit, i) => (
                      <li key={i}>
                        <span className="badge badge-muted">{edit.target}</span>{' '}
                        <strong>{edit.label}</strong>
                        <div className="muted">{edit.summary}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {proposal.agentActions.length > 0 && (
                <div className="assistant-section">
                  <strong>Agent 操作（{proposal.agentActions.length}）</strong>
                  <ul className="assistant-list">
                    {proposal.agentActions.map((action, i) => (
                      <li key={i}>
                        <span className="badge badge-accent">{action.action}</span>{' '}
                        <strong>{action.label}</strong>
                        <div className="muted">{action.summary}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {proposal.contentEdits.length === 0 && proposal.agentActions.length === 0 && (
                <p className="muted">本次提案无具体修改或操作项。</p>
              )}

              <div className="assistant-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={loading !== null}
                  onClick={handleApply}
                >
                  {loading === 'apply' ? '应用中…' : '确认应用'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={loading !== null}
                  onClick={() => setProposal(null)}
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
