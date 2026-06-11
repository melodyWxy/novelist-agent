import { jsonError, jsonOk } from '@/lib/api';
import { getUniverseDetail, enqueueDiscoverCollisions } from '@core/services/narrative-service';
import { applyCollisionPatch } from '@core/narrative/timeline-editor';
import type { CollisionPatch } from '@core/narrative/types';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ novelId: string }> }
) {
  try {
    const { novelId } = await params;
    const { collisions } = await getUniverseDetail(novelId);
    return jsonOk({ collisions });
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
    const body = (await request.json().catch(() => ({}))) as { maxCollisions?: number };
    const job = await enqueueDiscoverCollisions(novelId, body.maxCollisions ?? 6);
    return jsonOk({ job }, 202);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ novelId: string }> }
) {
  try {
    const { novelId } = await params;
    const body = (await request.json()) as CollisionPatch;
    if (!body?.op || !body.collisionId) {
      return jsonError('缺少 op 或 collisionId', 400);
    }
    const file = await applyCollisionPatch(novelId, body);
    return jsonOk({ collisions: file.collisions });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }
}
