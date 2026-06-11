/**
 * AI 助手栏 — 预览提案生成与安全应用
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { LlmClient, UNIVERSE_LLM_OPTIONS } from '../llm/client.js';
import { loadLlmConfig } from '../config.js';
import { buildAssistantPrompt } from '../prompts/assistant.js';
import {
  AssistantProposalOutputSchema,
  type AssistantPreviewInput,
  type AssistantProposal,
  type AssistantApplyResult,
  type ContentEdit,
  type AgentAction,
  AgentActionTypeSchema,
  ContentEditTargetSchema,
} from '../assistant/types.js';
import { getUniverseDetail } from './narrative-service.js';
import {
  enqueueBuildUniverse,
  enqueueDiscoverCollisions,
  enqueuePlanEpisode,
  enqueueWriteEpisode,
  enqueueUniverseTick,
  enqueueNarrativeCycle,
  stopNovelProduction,
} from './narrative-service.js';
import { enqueueNarrativeCycleRetry } from '../jobs/queue.js';
import { upsertSchedule } from '../jobs/queue.js';
import { applyTimelinePatch, applyCollisionPatch } from '../narrative/timeline-editor.js';
import * as narrativeStore from '../narrative/store.js';
import * as novelStore from '../novel/store.js';
import { saveChapterContent } from './novel-service.js';
import {
  WorldBibleSchema,
  PowerSystemFileSchema,
  CharacterAssetsFileSchema,
  StoryArcsFileSchema,
  EpisodePlanSchema,
  type TimelinePatch,
  type CollisionPatch,
} from '../narrative/types.js';

const MAX_CONTEXT_CHARS = 48_000;

async function appendAssistantAuditLog(
  novelId: string,
  entry: Record<string, unknown>
): Promise<void> {
  const filePath = path.join(novelStore.getNovelDir(novelId), 'assistant-log.jsonl');
  await fs.appendFile(
    filePath,
    `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`,
    'utf-8'
  );
}

function truncateJson(obj: unknown, maxChars = MAX_CONTEXT_CHARS): string {
  const full = JSON.stringify(obj, null, 2);
  if (full.length <= maxChars) return full;
  return `${full.slice(0, maxChars)}\n…（上下文已截断）`;
}

async function buildContext(
  novelId: string,
  scope: AssistantPreviewInput['scope'],
  chapterNumber?: number
): Promise<Record<string, unknown>> {
  const detail = await getUniverseDetail(novelId);
  const base = {
    novel: {
      id: detail.meta.id,
      title: detail.meta.title,
      protagonist: detail.meta.protagonist,
      genre: detail.meta.genre,
      lastChapterNumber: detail.state.lastChapterNumber,
    },
    hasUniverse: detail.hasUniverse,
    candidateCollisions: detail.candidateCollisions,
    worldDay: detail.world?.currentDay ?? 0,
  };

  switch (scope) {
    case 'overview':
      return {
        ...base,
        bible: detail.bible
          ? {
              era: detail.bible.era,
              factions: detail.bible.factions,
              supportCharacters: detail.bible.supportCharacters,
              coreConflicts: detail.bible.coreConflicts,
            }
          : null,
        simState: detail.simState,
        cycleLog: detail.cycleLog
          ? {
              lastRunAt: detail.cycleLog.lastRunAt,
              lastStatus: detail.cycleLog.lastStatus,
              consecutiveFailures: detail.cycleLog.consecutiveFailures,
            }
          : null,
        activeCycleRun: detail.activeCycleRun,
        chapterNumbers: detail.chapterNumbers,
        episodesSummary: detail.episodes.map((e) => ({
          episodeNumber: e.episodeNumber,
          title: e.title,
          status: e.status,
          chapterNumber: e.chapterNumber,
        })),
      };
    case 'timeline':
      return {
        ...base,
        world: detail.world,
        hero: detail.hero,
        support: detail.support,
        collisions: detail.collisions.filter((c) => c.status === 'candidate').slice(0, 8),
      };
    case 'world':
      return { ...base, world: detail.world };
    case 'support':
      return {
        ...base,
        support: detail.support,
        supportCharacters: detail.bible?.supportCharacters ?? [],
      };
    case 'hero':
      return { ...base, hero: detail.hero };
    case 'power':
      return {
        ...base,
        powerSystem: detail.powerSystem,
        characterAssets: detail.characterAssets,
        storyArcs: detail.storyArcs,
      };
    case 'collisions':
      return {
        ...base,
        collisions: detail.collisions,
        nextRecommendedCollision: detail.nextRecommendedCollision,
      };
    case 'episodes':
      return {
        ...base,
        episodes: detail.episodes,
        chapterNumbers: detail.chapterNumbers,
      };
    case 'chapter': {
      if (!chapterNumber) throw new Error('章节助手需要 chapterNumber');
      const chapter = await novelStore.loadChapter(novelId, chapterNumber);
      const review = await novelStore.loadReview(novelId, chapterNumber);
      const episodes = detail.episodes.filter((e) => e.chapterNumber === chapterNumber);
      const episode = episodes[0] ?? null;
      let title = episode?.title ?? `第${chapterNumber}章`;
      return {
        ...base,
        chapterNumber,
        title,
        contentExcerpt: chapter ? chapter.slice(0, 12_000) : null,
        contentLength: chapter?.length ?? 0,
        review,
        episode,
      };
    }
    default:
      return base;
  }
}

export async function previewAssistantProposal(
  input: AssistantPreviewInput
): Promise<AssistantProposal> {
  const { novelId, scope, instruction, chapterNumber } = input;
  if (!instruction.trim()) throw new Error('请输入指令');

  const context = await buildContext(novelId, scope, chapterNumber);
  const contextJson = truncateJson(context);
  const llm = new LlmClient(loadLlmConfig());
  const messages = buildAssistantPrompt(scope, instruction.trim(), contextJson);
  const output = await llm.chatJson(messages, AssistantProposalOutputSchema, {
    ...UNIVERSE_LLM_OPTIONS,
    temperature: 0.35,
    maxTokens: 8192,
  });

  const proposal = {
    ...output,
    proposalId: randomUUID(),
    scope,
    createdAt: new Date().toISOString(),
  };

  await appendAssistantAuditLog(novelId, {
    event: 'preview',
    scope,
    chapterNumber,
    instruction: instruction.trim(),
    proposal,
  });

  return proposal;
}

function assertTimelinePatch(data: unknown): TimelinePatch {
  if (!data || typeof data !== 'object' || !('op' in data)) {
    throw new Error('timeline_patch.data 缺少 op');
  }
  return data as TimelinePatch;
}

function assertCollisionPatch(data: unknown): CollisionPatch {
  if (!data || typeof data !== 'object' || !('op' in data) || !('collisionId' in data)) {
    throw new Error('collision_patch.data 格式无效');
  }
  return data as CollisionPatch;
}

async function applyContentEdit(novelId: string, edit: ContentEdit): Promise<void> {
  const target = ContentEditTargetSchema.parse(edit.target);

  switch (target) {
    case 'world_bible': {
      const parsed = WorldBibleSchema.parse(edit.data);
      await narrativeStore.saveWorldBible(novelId, parsed);
      return;
    }
    case 'timeline_patch': {
      await applyTimelinePatch(novelId, assertTimelinePatch(edit.data));
      return;
    }
    case 'collision_patch': {
      await applyCollisionPatch(novelId, assertCollisionPatch(edit.data));
      return;
    }
    case 'power_system': {
      const existing = await narrativeStore.loadPowerSystem(novelId);
      const now = new Date().toISOString();
      const parsed = PowerSystemFileSchema.parse({
        ...(existing ?? {}),
        ...(edit.data as object),
        generatedAt: existing?.generatedAt ?? now,
        updatedAt: now,
      });
      await narrativeStore.savePowerSystem(novelId, parsed);
      return;
    }
    case 'character_assets': {
      const existing = await narrativeStore.loadCharacterAssets(novelId);
      const now = new Date().toISOString();
      const parsed = CharacterAssetsFileSchema.parse({
        ...(existing ?? {}),
        ...(edit.data as object),
        updatedAt: now,
      });
      await narrativeStore.saveCharacterAssets(novelId, parsed);
      return;
    }
    case 'story_arcs': {
      const existing = await narrativeStore.loadStoryArcs(novelId);
      const now = new Date().toISOString();
      const parsed = StoryArcsFileSchema.parse({
        ...(existing ?? {}),
        ...(edit.data as object),
        updatedAt: now,
      });
      await narrativeStore.saveStoryArcs(novelId, parsed);
      return;
    }
    case 'episode': {
      const raw = edit.data as Record<string, unknown>;
      const episodeNumber = raw.episodeNumber;
      if (typeof episodeNumber !== 'number') throw new Error('episode.data 缺少 episodeNumber');
      const existing = await narrativeStore.loadEpisode(novelId, episodeNumber);
      const now = new Date().toISOString();
      const merged = {
        ...(existing ?? {}),
        ...raw,
        episodeNumber,
        generatedAt: existing?.generatedAt ?? now,
      };
      const parsed = EpisodePlanSchema.parse(merged);
      await narrativeStore.saveEpisode(novelId, parsed);
      return;
    }
    case 'chapter': {
      const raw = edit.data as { chapterNumber?: number; title?: string; content?: string };
      if (typeof raw.chapterNumber !== 'number' || typeof raw.content !== 'string') {
        throw new Error('chapter.data 需要 chapterNumber 与 content');
      }
      await saveChapterContent(novelId, raw.chapterNumber, raw.content, raw.title);
      return;
    }
    default:
      throw new Error(`不支持的内容修改类型: ${target}`);
  }
}

async function applyAgentAction(
  novelId: string,
  action: AgentAction
): Promise<{ jobId?: string; jobType?: string; detail: string }> {
  const type = AgentActionTypeSchema.parse(action.action);
  const p = action.params ?? {};

  switch (type) {
    case 'build_universe': {
      const job = await enqueueBuildUniverse(novelId, {
        worldEventCount: typeof p.worldEventCount === 'number' ? p.worldEventCount : undefined,
        heroEventCount: typeof p.heroEventCount === 'number' ? p.heroEventCount : undefined,
      });
      return { jobId: job.id, jobType: job.type, detail: '已入队生成叙事宇宙' };
    }
    case 'discover_collisions': {
      const job = await enqueueDiscoverCollisions(
        novelId,
        typeof p.maxCollisions === 'number' ? p.maxCollisions : 6
      );
      return { jobId: job.id, jobType: job.type, detail: '已入队发现碰撞' };
    }
    case 'universe_tick': {
      const job = await enqueueUniverseTick(novelId, {
        tickDays: typeof p.tickDays === 'number' ? p.tickDays : undefined,
        autoDiscoverCollisions:
          typeof p.autoDiscoverCollisions === 'boolean' ? p.autoDiscoverCollisions : undefined,
        maxCollisions: typeof p.maxCollisions === 'number' ? p.maxCollisions : undefined,
      });
      return { jobId: job.id, jobType: job.type, detail: '已入队世界 Tick' };
    }
    case 'plan_episode': {
      const collisionId = String(p.collisionId ?? '');
      if (!collisionId) throw new Error('plan_episode 需要 collisionId');
      const job = await enqueuePlanEpisode(novelId, collisionId);
      return { jobId: job.id, jobType: job.type, detail: `已入队规划事件包（碰撞 ${collisionId}）` };
    }
    case 'write_episode': {
      const episodeNumber = p.episodeNumber;
      if (typeof episodeNumber !== 'number') throw new Error('write_episode 需要 episodeNumber');
      const job = await enqueueWriteEpisode(
        novelId,
        episodeNumber,
        typeof p.targetWords === 'number' ? p.targetWords : undefined
      );
      return { jobId: job.id, jobType: job.type, detail: `已入队写作第 ${episodeNumber} 个事件包` };
    }
    case 'narrative_cycle': {
      const job = await enqueueNarrativeCycle(novelId, {
        tickDays: typeof p.tickDays === 'number' ? p.tickDays : undefined,
        autoDiscoverCollisions:
          typeof p.autoDiscoverCollisions === 'boolean' ? p.autoDiscoverCollisions : undefined,
        maxCollisions: typeof p.maxCollisions === 'number' ? p.maxCollisions : undefined,
        collisionId: typeof p.collisionId === 'string' ? p.collisionId : undefined,
        episodeNumber: typeof p.episodeNumber === 'number' ? p.episodeNumber : undefined,
        targetWords: typeof p.targetWords === 'number' ? p.targetWords : undefined,
        skipWrite: typeof p.skipWrite === 'boolean' ? p.skipWrite : undefined,
      });
      return { jobId: job.id, jobType: job.type, detail: '已入队叙事周期' };
    }
    case 'cycle_retry': {
      const job = await enqueueNarrativeCycleRetry(novelId);
      return { jobId: job.id, jobType: job.type, detail: '已入队周期重试' };
    }
    case 'stop_production': {
      const result = await stopNovelProduction(novelId);
      return {
        detail: `已停止产出：取消排队 ${result.cancelledPendingJobs}，执行中 ${result.cancelledRunningJobs}${result.runningJobNote ? `；${result.runningJobNote}` : ''}`,
      };
    }
    case 'enable_schedule': {
      const schedule = await upsertSchedule(novelId, {
        enabled: typeof p.enabled === 'boolean' ? p.enabled : true,
        cron: typeof p.cron === 'string' ? p.cron : undefined,
        mode:
          p.mode === 'classic' || p.mode === 'narrative' || p.mode === 'narrative-auto'
            ? p.mode
            : undefined,
        tickDays: typeof p.tickDays === 'number' ? p.tickDays : undefined,
        targetWords: typeof p.targetWords === 'number' ? p.targetWords : undefined,
        maxCollisions: typeof p.maxCollisions === 'number' ? p.maxCollisions : undefined,
        autoDiscoverCollisions:
          typeof p.autoDiscoverCollisions === 'boolean' ? p.autoDiscoverCollisions : undefined,
      });
      return {
        detail: schedule.enabled
          ? `已启用调度（${schedule.mode}，cron ${schedule.cron}）`
          : '调度已关闭',
      };
    }
    default:
      throw new Error(`不支持的 Agent 操作: ${type}`);
  }
}

export async function applyAssistantProposal(
  novelId: string,
  proposal: AssistantProposal
): Promise<AssistantApplyResult> {
  if (proposal.scope && proposal.proposalId) {
    // structural validation only
  }

  if (proposal.scope === 'chapter') {
    const invalidEdit = proposal.contentEdits.find((edit) => edit.target !== 'chapter');
    if (invalidEdit) {
      throw new Error(
        `章节助手只能直接写回章节正文；收到不安全修改目标 ${invalidEdit.target}。请重新生成预览。`
      );
    }
  }

  const appliedEdits: string[] = [];
  const enqueuedJobs: AssistantApplyResult['enqueuedJobs'] = [];
  const agentResults: AssistantApplyResult['agentResults'] = [];

  for (const edit of proposal.contentEdits) {
    await applyContentEdit(novelId, edit);
    appliedEdits.push(edit.label);
  }

  for (const action of proposal.agentActions) {
    const result = await applyAgentAction(novelId, action);
    agentResults.push({
      action: action.action,
      label: action.label,
      detail: result.detail,
    });
    if (result.jobId && result.jobType) {
      enqueuedJobs.push({ id: result.jobId, type: result.jobType, label: action.label });
    }
  }

  const result = { appliedEdits, enqueuedJobs, agentResults };

  await appendAssistantAuditLog(novelId, {
    event: 'apply',
    scope: proposal.scope,
    proposalId: proposal.proposalId,
    proposalSummary: proposal.summary,
    contentEdits: proposal.contentEdits.map((edit) => ({
      target: edit.target,
      label: edit.label,
      summary: edit.summary,
    })),
    agentActions: proposal.agentActions.map((action) => ({
      action: action.action,
      label: action.label,
      summary: action.summary,
    })),
    result,
  });

  return result;
}
