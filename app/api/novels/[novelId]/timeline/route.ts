import { jsonError, jsonOk } from '@/lib/api';
import { applyTimelinePatch } from '@core/narrative/timeline-editor';
import type { TimelinePatch } from '@core/narrative/types';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ novelId: string }> }
) {
  try {
    const { novelId } = await params;
    const body = (await request.json()) as TimelinePatch;
    if (!body?.op) {
      return jsonError('缺少 op 字段', 400);
    }
    const result = await applyTimelinePatch(novelId, body);
    return jsonOk(result);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }
}
