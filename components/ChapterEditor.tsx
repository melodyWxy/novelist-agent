'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props {
  novelId: string;
  chapterNumber: number;
  initialTitle: string;
  initialContent: string;
}

export function ChapterEditor({
  novelId,
  chapterNumber,
  initialTitle,
  initialContent,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSave() {
    if (!content.trim()) {
      setMessage('正文不能为空');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/novels/${novelId}/chapters/${chapterNumber}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '保存失败');
      setEditing(false);
      setMessage(`已保存（约 ${data.wordCount ?? content.replace(/\s/g, '').length} 字）`);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    const ok = window.confirm(
      `确定删除第 ${chapterNumber} 章《${title}》？\n\n将删除正文与审稿记录，并回滚章节记忆与主人公线消费标记。此操作不可撤销。`
    );
    if (!ok) return;

    setDeleting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/novels/${novelId}/chapters/${chapterNumber}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '删除失败');
      router.push(`/novels/${novelId}`);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  }

  function onCancel() {
    setTitle(initialTitle);
    setContent(initialContent);
    setEditing(false);
    setMessage(null);
  }

  return (
    <section className="card chapter-editor">
      <div className="chapter-editor-toolbar">
        <h3 style={{ margin: 0 }}>章节管理</h3>
        <div className="chapter-editor-actions">
          {!editing ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEditing(true)}
              disabled={deleting}
            >
              编辑正文
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn"
                onClick={onSave}
                disabled={saving || deleting}
              >
                {saving ? '保存中…' : '保存'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onCancel}
                disabled={saving || deleting}
              >
                取消
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-danger"
            onClick={onDelete}
            disabled={saving || deleting}
          >
            {deleting ? '删除中…' : '删除本章'}
          </button>
        </div>
      </div>

      {message && <p className="muted">{message}</p>}

      {editing && (
        <div className="chapter-editor-form">
          <label className="chapter-editor-label">
            章节标题
            <input
              className="chapter-editor-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="章节标题"
            />
          </label>
          <label className="chapter-editor-label">
            正文
            <textarea
              className="chapter-editor-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={24}
              spellCheck={false}
            />
          </label>
          <p className="muted">
            保存会更新正文、事件包标题（若改标题）与章节记忆字数。删除会同步回滚：记忆索引、state.json
            进度尾部、伏笔（按章号裁剪）、删至仅余第 1 章时的人物/悬念线，以及主人公线消费标记。
          </p>
        </div>
      )}
    </section>
  );
}
