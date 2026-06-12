import { jsonError } from '@/lib/api';
import { exportNovelPackage } from '@core/services/novel-transfer-service';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ novelId: string }> }
) {
  try {
    const { novelId } = await params;
    const pkg = await exportNovelPackage(novelId);
    const body = JSON.stringify(pkg, null, 2);
    const filename = `${novelId}.xiaoshuojia.json`;

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 404);
  }
}
