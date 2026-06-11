import { jsonError, jsonOk } from '@/lib/api';
import { retryJob } from '@core/jobs/queue';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const job = await retryJob(jobId);
    return jsonOk({ job }, 202);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }
}
