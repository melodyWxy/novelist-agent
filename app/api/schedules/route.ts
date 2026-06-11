import { jsonError, jsonOk } from '@/lib/api';
import { listSchedules, upsertSchedule } from '@core/jobs/queue';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const novelId = searchParams.get('novelId');
    const schedules = await listSchedules();
    if (novelId) {
      const schedule = schedules.find((s) => s.novelId === novelId) ?? null;
      return jsonOk({ schedule });
    }
    return jsonOk({ schedules });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      novelId: string;
      enabled?: boolean;
      cron?: string;
      targetWords?: number;
      maxChapters?: number;
      mode?: 'classic' | 'narrative' | 'narrative-auto';
      tickDays?: number;
      autoDiscoverCollisions?: boolean;
      maxCollisions?: number;
    };

    if (!body.novelId) return jsonError('需要 novelId');

    const schedule = await upsertSchedule(body.novelId, {
      enabled: body.enabled,
      cron: body.cron,
      targetWords: body.targetWords,
      maxChapters: body.maxChapters,
      mode: body.mode,
      tickDays: body.tickDays,
      autoDiscoverCollisions: body.autoDiscoverCollisions,
      maxCollisions: body.maxCollisions,
    });
    return jsonOk({ schedule });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }
}
