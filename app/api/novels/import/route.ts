import { jsonError, jsonOk } from '@/lib/api';
import { importNovelPackage } from '@core/services/novel-transfer-service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return jsonError('请用 multipart/form-data 上传作品包文件');
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return jsonError('缺少作品包文件');
    }

    const raw = Buffer.from(await file.arrayBuffer()).toString('utf-8');
    const result = await importNovelPackage(JSON.parse(raw));
    return jsonOk(result, 201);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }
}
