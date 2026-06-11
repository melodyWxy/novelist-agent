import { jsonError, jsonOk } from '@/lib/api';
import { enqueueWriteEpisode } from '@core/services/narrative-service';
import * as narrativeStore from '@core/narrative/store';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ novelId: string; episodeNumber: string }> }
) {
  try {
    const { novelId, episodeNumber: epStr } = await params;
    const episodeNumber = parseInt(epStr, 10);
    if (Number.isNaN(episodeNumber)) return jsonError('无效 episodeNumber');
    const episode = await narrativeStore.loadEpisode(novelId, episodeNumber);
    if (!episode) return jsonError('事件包不存在', 404);
    return jsonOk({ episode });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ novelId: string; episodeNumber: string }> }
) {
  try {
    const { novelId, episodeNumber: epStr } = await params;
    const episodeNumber = parseInt(epStr, 10);
    if (Number.isNaN(episodeNumber)) return jsonError('无效 episodeNumber');
    const body = (await request.json().catch(() => ({}))) as { targetWords?: number };
    const job = await enqueueWriteEpisode(novelId, episodeNumber, body.targetWords);
    return jsonOk({ job }, 202);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }
}
