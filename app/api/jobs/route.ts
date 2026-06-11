import { jsonError, jsonOk } from '@/lib/api';
import { listJobs, enqueueJob } from '@core/jobs/queue';
import type { JobType, JobPayload } from '@core/jobs/types';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const jobs = await listJobs(100);
    return jsonOk({ jobs });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      novelId: string;
      type: JobType;
      payload?: JobPayload;
    };

    if (!body.novelId || !body.type) {
      return jsonError('需要 novelId 和 type');
    }

    const job = await enqueueJob(body.novelId, body.type, body.payload ?? {});
    return jsonOk({ job }, 202);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }
}
