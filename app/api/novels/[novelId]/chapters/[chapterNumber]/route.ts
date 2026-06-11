import { jsonError, jsonOk, parseBody } from '@/lib/api';
import { getChapterContent, saveChapterContent } from '@core/services/novel-service';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ novelId: string; chapterNumber: string }> }
) {
  try {
    const { novelId, chapterNumber } = await params;
    const num = parseInt(chapterNumber, 10);
    if (Number.isNaN(num)) return jsonError('无效章节号');

    const chapter = await getChapterContent(novelId, num);
    return jsonOk({ chapterNumber: num, ...chapter });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 404);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ novelId: string; chapterNumber: string }> }
) {
  try {
    const { novelId, chapterNumber } = await params;
    const num = parseInt(chapterNumber, 10);
    if (Number.isNaN(num)) return jsonError('无效章节号');

    const body = await parseBody<{ content: string; title?: string }>(request);
    if (!body.content || typeof body.content !== 'string') {
      return jsonError('缺少 content', 400);
    }

    const saved = await saveChapterContent(novelId, num, body.content, body.title);
    return jsonOk(saved);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }
}
