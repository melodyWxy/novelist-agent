'use client';

import { useState } from 'react';

interface Props {
  chapterNumber: number;
  title: string;
  paragraphs: string[];
}

type PreviewMode = 'pc' | 'mobile';

export function ChapterPreview({ chapterNumber, title, paragraphs }: Props) {
  const [mode, setMode] = useState<PreviewMode>('pc');

  return (
    <section className={`chapter-preview chapter-preview-${mode}`} aria-label="章节预览">
      <div className="chapter-preview-toolbar">
        <div>
          <strong>{mode === 'pc' ? 'PC 预览' : '移动端预览'}</strong>
          <span className="muted"> · {paragraphs.length} 段</span>
        </div>
        <div className="preview-toggle" role="group" aria-label="切换预览模式">
          <button
            type="button"
            className={`btn btn-secondary${mode === 'pc' ? ' preview-toggle-active' : ''}`}
            onClick={() => setMode('pc')}
          >
            PC
          </button>
          <button
            type="button"
            className={`btn btn-secondary${mode === 'mobile' ? ' preview-toggle-active' : ''}`}
            onClick={() => setMode('mobile')}
          >
            移动端
          </button>
        </div>
      </div>

      {mode === 'pc' ? (
        <article className="pc-reader-frame">
          <div className="pc-reader-title">
            <span>第 {chapterNumber} 章</span>
            <strong>{title}</strong>
          </div>
          <ChapterParagraphs paragraphs={paragraphs} />
        </article>
      ) : (
        <article className="phone-reader-frame">
          <div className="phone-reader-title">
            <span>第 {chapterNumber} 章</span>
            <strong>{title}</strong>
          </div>
          <ChapterParagraphs paragraphs={paragraphs} />
        </article>
      )}
    </section>
  );
}

function ChapterParagraphs({ paragraphs }: { paragraphs: string[] }) {
  return (
    <div className="chapter-content">
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="chapter-paragraph">
          {paragraph}
        </p>
      ))}
    </div>
  );
}
