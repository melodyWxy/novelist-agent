import { jsonError, jsonOk } from '@/lib/api';
import { getQualityMetrics } from '@core/narrative/quality-metrics';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ novelId: string }> }
) {
  try {
    const { novelId } = await params;
    const metrics = await getQualityMetrics(novelId);
    return jsonOk({ metrics });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }
}
