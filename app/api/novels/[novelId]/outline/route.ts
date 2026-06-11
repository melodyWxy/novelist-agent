import { jsonError, jsonOk } from '@/lib/api';
import { enqueueJob } from '@core/jobs/queue';
import * as store from '@core/novel/store';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ novelId: string }> }
) {
  try {
    const { novelId } = await params;
    const outline = await store.loadOutline(novelId);
    return jsonOk({ outline });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 404);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ novelId: string }> }
) {
  try {
    const { novelId } = await params;
    const body = (await request.json().catch(() => ({}))) as { chapterCount?: number };
    const job = await enqueueJob(novelId, 'plan-outline', {
      chapterCount: body.chapterCount ?? 10,
    });
    return jsonOk({ job }, 202);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }
}
