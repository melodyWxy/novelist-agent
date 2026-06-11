import { jsonError, jsonOk, parseBody } from '@/lib/api';
import { applyAssistantProposal } from '@core/services/assistant-service';
import { AssistantProposalSchema } from '@core/assistant/types';

export const runtime = 'nodejs';

interface ApplyBody {
  proposal: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ novelId: string }> }
) {
  try {
    const { novelId } = await params;
    const body = await parseBody<ApplyBody>(request);
    const proposal = AssistantProposalSchema.parse(body.proposal);
    const result = await applyAssistantProposal(novelId, proposal);
    return jsonOk({ result });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }
}
