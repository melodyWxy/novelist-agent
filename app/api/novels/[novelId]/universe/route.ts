import { jsonError, jsonOk } from '@/lib/api';
import { getUniverseDetail, enqueueBuildUniverse } from '@core/services/narrative-service';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ novelId: string }> }
) {
  try {
    const { novelId } = await params;
    const universe = await getUniverseDetail(novelId);
    return jsonOk({ universe });
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
    const body = (await request.json().catch(() => ({}))) as {
      worldEventCount?: number;
      heroEventCount?: number;
    };
    const job = await enqueueBuildUniverse(novelId, body);
    return jsonOk({ job }, 202);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }
}
