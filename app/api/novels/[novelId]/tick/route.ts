import { jsonError, jsonOk } from '@/lib/api';
import { enqueueUniverseTick } from '@core/services/narrative-service';
import * as narrativeStore from '@core/narrative/store';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ novelId: string }> }
) {
  try {
    const { novelId } = await params;
    const hasUniverse = await narrativeStore.hasUniverse(novelId);
    if (!hasUniverse) {
      return jsonError('请先生成叙事宇宙', 400);
    }

    const body = (await request.json().catch(() => ({}))) as {
      tickDays?: number;
      autoDiscoverCollisions?: boolean;
      maxCollisions?: number;
    };

    const job = await enqueueUniverseTick(novelId, body);
    return jsonOk({ job }, 202);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }
}
