import { jsonError, jsonOk } from '@/lib/api';
import { stopNovelProduction } from '@core/services/narrative-service';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ novelId: string }> }
) {
  try {
    const { novelId } = await params;
    const result = await stopNovelProduction(novelId);
    return jsonOk(result);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }
}
