import { jsonError, jsonOk } from '@/lib/api';
import { enqueueNarrativeCycleRetry } from '@core/jobs/queue';
import * as narrativeStore from '@core/narrative/store';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ novelId: string }> }
) {
  try {
    const { novelId } = await params;
    const hasUniverse = await narrativeStore.hasUniverse(novelId);
    if (!hasUniverse) {
      return jsonError('请先生成叙事宇宙', 400);
    }

    const job = await enqueueNarrativeCycleRetry(novelId);
    return jsonOk({ job }, 202);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }
}
