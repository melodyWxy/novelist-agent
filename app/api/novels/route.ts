import { jsonError, jsonOk } from '@/lib/api';
import { listNovelSummaries, createNovel } from '@core/services/novel-service';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const novels = await listNovelSummaries();
    return jsonOk({ novels });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      id: string;
      title: string;
      genre: string;
      protagonist: string;
      style: string;
      worldSetting?: string;
      targetWordCount?: number;
    };

    if (!body.id || !body.title || !body.genre || !body.protagonist || !body.style) {
      return jsonError('缺少必填字段');
    }

    const meta = await createNovel(body);
    return jsonOk({ meta }, 201);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }
}
