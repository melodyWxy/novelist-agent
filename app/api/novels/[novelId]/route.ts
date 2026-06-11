import { jsonError, jsonOk } from '@/lib/api';
import { getNovelDetail } from '@core/services/novel-service';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ novelId: string }> }
) {
  try {
    const { novelId } = await params;
    const detail = await getNovelDetail(novelId);
    return jsonOk(detail);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 404);
  }
}
