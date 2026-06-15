import { jsonError, jsonOk } from '@/lib/api';
import { getUniverseDetail, enqueuePlanEpisode } from '@core/services/narrative-service';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ novelId: string }> }
) {
  try {
    const { novelId } = await params;
    const { episodes } = await getUniverseDetail(novelId);
    return jsonOk({ episodes });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ novelId: string }> }
) {
  try {
    const { novelId } = await params;
    const body = (await request.json()) as {
      collisionId?: string;
      heroEventId?: string;
    };
    const job = await enqueuePlanEpisode(novelId, {
      collisionId: body.collisionId,
      heroEventId: body.heroEventId,
    });
    return jsonOk({ job }, 202);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }
}
