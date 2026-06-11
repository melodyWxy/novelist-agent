import { jsonError, jsonOk, parseBody } from '@/lib/api';
import { previewAssistantProposal } from '@core/services/assistant-service';
import { AssistantScopeSchema } from '@core/assistant/types';

export const runtime = 'nodejs';

interface PreviewBody {
  instruction: string;
  scope: string;
  chapterNumber?: number;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ novelId: string }> }
) {
  try {
    const { novelId } = await params;
    const body = await parseBody<PreviewBody>(request);
    const scope = AssistantScopeSchema.parse(body.scope);
    const proposal = await previewAssistantProposal({
      novelId,
      scope,
      instruction: body.instruction ?? '',
      chapterNumber: body.chapterNumber,
    });
    return jsonOk({ proposal });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }
}
