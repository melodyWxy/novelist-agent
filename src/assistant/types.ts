/**
 * AI 助手栏 — 结构化提案类型与白名单能力定义
 */
import { z } from 'zod';

export const AssistantScopeSchema = z.enum([
  'overview',
  'timeline',
  'world',
  'support',
  'hero',
  'power',
  'collisions',
  'episodes',
  'chapter',
]);

export type AssistantScope = z.infer<typeof AssistantScopeSchema>;

export const ContentEditTargetSchema = z.enum([
  'world_bible',
  'timeline_patch',
  'collision_patch',
  'power_system',
  'character_assets',
  'story_arcs',
  'episode',
  'chapter',
]);

export type ContentEditTarget = z.infer<typeof ContentEditTargetSchema>;

export const AgentActionTypeSchema = z.enum([
  'build_universe',
  'discover_collisions',
  'universe_tick',
  'plan_episode',
  'write_episode',
  'narrative_cycle',
  'cycle_retry',
  'stop_production',
  'enable_schedule',
]);

export type AgentActionType = z.infer<typeof AgentActionTypeSchema>;

export const ContentEditSchema = z.object({
  target: ContentEditTargetSchema,
  label: z.string(),
  summary: z.string(),
  data: z.unknown(),
});

export type ContentEdit = z.infer<typeof ContentEditSchema>;

export const AgentActionSchema = z.object({
  action: AgentActionTypeSchema,
  label: z.string(),
  summary: z.string(),
  params: z.record(z.unknown()).optional(),
});

export type AgentAction = z.infer<typeof AgentActionSchema>;

/** LLM 直接输出的提案结构（proposalId 由服务端生成） */
export const AssistantProposalOutputSchema = z.object({
  summary: z.string(),
  risks: z.array(z.string()).default([]),
  contentEdits: z.array(ContentEditSchema).default([]),
  agentActions: z.array(AgentActionSchema).default([]),
});

export type AssistantProposalOutput = z.infer<typeof AssistantProposalOutputSchema>;

export const AssistantProposalSchema = AssistantProposalOutputSchema.extend({
  proposalId: z.string(),
  scope: AssistantScopeSchema,
  createdAt: z.string().datetime(),
});

export type AssistantProposal = z.infer<typeof AssistantProposalSchema>;

export interface AssistantPreviewInput {
  novelId: string;
  scope: AssistantScope;
  instruction: string;
  chapterNumber?: number;
}

export interface AssistantApplyResult {
  appliedEdits: string[];
  enqueuedJobs: Array<{ id: string; type: string; label: string }>;
  agentResults: Array<{ action: AgentActionType; label: string; detail: string }>;
}
