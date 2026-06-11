import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChapterPreview } from '@/components/ChapterPreview';
import { ChapterAssistant } from '@/components/ChapterAssistant';
import { getChapterContent } from '@core/services/novel-service';
import * as store from '@core/novel/store';

export const dynamic = 'force-dynamic';

function splitChapterParagraphs(content: string): string[] {
  return content
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ novelId: string; chapterNumber: string }>;
}) {
  const { novelId, chapterNumber: chStr } = await params;
  const chapterNumber = parseInt(chStr, 10);
  if (Number.isNaN(chapterNumber)) notFound();

  if (!(await store.novelExists(novelId))) notFound();

  let chapter;
  try {
    chapter = await getChapterContent(novelId, chapterNumber);
  } catch {
    notFound();
  }

  const meta = await store.loadNovelMeta(novelId);
  const paragraphs = splitChapterParagraphs(chapter.content);

  return (
    <div className="chapter-page">
      <p>
        <Link href={`/novels/${novelId}`}>← {meta.title}</Link>
      </p>
      <h2>
        第 {chapterNumber} 章 {chapter.title}
      </h2>

      <ChapterAssistant novelId={novelId} chapterNumber={chapterNumber} />

      {chapter.review && (
        <div className="card">
          <h3>审稿</h3>
          <p>
            {chapter.review.passed ? '通过' : '未通过'}
            {chapter.review.score != null && ` · 评分 ${chapter.review.score}`}
          </p>
          <p className="muted">{chapter.review.summary}</p>
          {chapter.review.issues.length > 0 && (
            <ul>
              {chapter.review.issues.map((issue, i) => (
                <li key={i}>
                  [{issue.severity}] {issue.category}: {issue.description}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ChapterPreview chapterNumber={chapterNumber} title={chapter.title} paragraphs={paragraphs} />
    </div>
  );
}
