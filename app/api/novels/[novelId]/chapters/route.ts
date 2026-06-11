import { jsonError, jsonOk } from '@/lib/api';
import { enqueueJob } from '@core/jobs/queue';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ novelId: string }> }
) {
  try {
    const { novelId } = await params;
    const body = (await request.json()) as {
      mode?: 'next' | 'specific';
      chapterNumber?: number;
      targetWords?: number;
    };

    const mode = body.mode ?? 'next';

    if (mode === 'next') {
      const job = await enqueueJob(novelId, 'write-next-chapter', {
        targetWords: body.targetWords,
      });
      return jsonOk({ job }, 202);
    }

    if (!body.chapterNumber) {
      return jsonError('指定章节模式需要 chapterNumber');
    }

    const job = await enqueueJob(novelId, 'write-chapter', {
      chapterNumber: body.chapterNumber,
      targetWords: body.targetWords,
    });
    return jsonOk({ job }, 202);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }
}
