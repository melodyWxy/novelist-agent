/**
 * Agent Runtime
 *
 * 包含两层：
 * 1. AgentRuntime — 通用步骤执行器（日志、耗时），便于观察 Agent 链路
 * 2. NovelistAgentRuntime — 小说家领域门面，持有 LLM 并暴露高层任务
 */
import { loadLlmConfig } from '../config.js';
import { LlmClient } from '../llm/client.js';
import * as store from '../novel/store.js';
import * as pipeline from '../novel/pipeline.js';
import * as narrativePipeline from '../narrative/pipeline.js';
import { tickUniverse as runUniverseTick } from '../narrative/world-simulator.js';
import type { UniverseTickOptions, UniverseTickResult } from '../narrative/world-simulator.js';
import { runNarrativeCycle, pickCycleCollision } from '../narrative/pipeline-cycle.js';
import type { NarrativeCycleOptions, NarrativeCycleResult } from '../narrative/pipeline-cycle.js';
import type { InitNovelInput, NovelMeta, Outline, ReviewResult } from '../novel/types.js';
import type {
  WorldBible,
  WorldTimeline,
  HeroTimeline,
  Collision,
  EpisodePlan,
  DualLineReview,
} from '../narrative/types.js';

export interface AgentStepResult<T> {
  stepName: string;
  durationMs: number;
  output: T;
}

/** 通用步骤执行器：把 Agent 的每一步显式化，方便调试和学习 */
export class AgentRuntime {
  constructor(private readonly verbose = true) {}

  async runStep<T>(stepName: string, task: () => Promise<T>): Promise<AgentStepResult<T>> {
    const startedAt = Date.now();
    if (this.verbose) {
      console.log(`[agent] start: ${stepName}`);
    }

    try {
      const output = await task();
      const durationMs = Date.now() - startedAt;
      if (this.verbose) {
        console.log(`[agent] done: ${stepName} (${durationMs}ms)`);
      }
      return { stepName, durationMs, output };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      console.error(`[agent] failed: ${stepName} (${durationMs}ms)`);
      throw error;
    }
  }
}

export interface RuntimeOptions {
  dryRun?: boolean;
  verbose?: boolean;
}

/**
 * 小说家 Agent 门面：CLI、worker、测试脚本统一入口。
 *
 * 职责边界：
 * - 本类：作品存在性校验 + 步骤日志 + 委托 pipeline
 * - `novel/pipeline`：经典单线写章
 * - `narrative/pipeline`：双线宇宙 / 碰撞 / 事件包 / 写章
 * - `narrative/pipeline-cycle`：单体周期（遗留）；生产周期链见 `cycle-chain.ts` + worker
 */
export class NovelistAgentRuntime {
  private readonly llm: LlmClient;
  private readonly steps: AgentRuntime;
  readonly dryRun: boolean;

  constructor(options: RuntimeOptions = {}) {
    this.dryRun = options.dryRun ?? false;
    this.steps = new AgentRuntime(options.verbose ?? true);
    const config = loadLlmConfig(this.dryRun);
    this.llm = new LlmClient(config, this.dryRun);
  }

  async initNovel(input: InitNovelInput): Promise<NovelMeta> {
    return this.steps.runStep('init novel project', () => store.initNovel(input)).then((r) => r.output);
  }

  async planOutline(novelId: string, chapterCount = 10): Promise<Outline> {
    await this.assertNovelExists(novelId);
    return this.steps
      .runStep('plan outline', () => pipeline.planOutline(this.llm, novelId, chapterCount))
      .then((r) => r.output);
  }

  async writeChapter(
    novelId: string,
    chapterNumber: number,
    options?: { skipReview?: boolean; skipMemoryUpdate?: boolean; targetWords?: number }
  ) {
    await this.assertNovelExists(novelId);
    return this.steps
      .runStep(`write chapter ${chapterNumber}`, () =>
        pipeline.writeChapter(this.llm, novelId, chapterNumber, options)
      )
      .then((r) => r.output);
  }

  async reviewChapter(novelId: string, chapterNumber: number): Promise<ReviewResult> {
    await this.assertNovelExists(novelId);
    return this.steps
      .runStep(`review chapter ${chapterNumber}`, () =>
        pipeline.reviewChapter(this.llm, novelId, chapterNumber)
      )
      .then((r) => r.output);
  }

  async listNovels(): Promise<string[]> {
    return store.listNovels();
  }

  async getNovelSummary(novelId: string) {
    await this.assertNovelExists(novelId);
    return pipeline.getNovelSummary(novelId);
  }

  /** 双线叙事：生成世界 Bible + 世界线 + 主人公线 */
  async buildUniverse(
    novelId: string,
    options?: { worldEventCount?: number; heroEventCount?: number }
  ): Promise<{
    bible: WorldBible;
    world: WorldTimeline;
    support: import('../narrative/types.js').SupportTimeline;
    hero: HeroTimeline;
  }> {
    await this.assertNovelExists(novelId);
    return this.steps
      .runStep('build universe', () => narrativePipeline.buildUniverse(this.llm, novelId, options))
      .then((r) => r.output);
  }

  /** 双线叙事：发现碰撞候选 */
  async discoverCollisions(novelId: string, maxCollisions = 6): Promise<Collision[]> {
    await this.assertNovelExists(novelId);
    return this.steps
      .runStep('discover collisions', () =>
        narrativePipeline.discoverCollisions(this.llm, novelId, maxCollisions)
      )
      .then((r) => r.output);
  }

  /** 双线叙事：从碰撞生成章节事件包 */
  async planEpisode(novelId: string, collisionId: string): Promise<EpisodePlan> {
    await this.assertNovelExists(novelId);
    return this.steps
      .runStep('plan episode', () =>
        narrativePipeline.planEpisodeFromCollision(this.llm, novelId, collisionId)
      )
      .then((r) => r.output);
  }

  /** 双线叙事：从事件包写章节 */
  async writeEpisode(
    novelId: string,
    episodeNumber: number,
    options?: import('../narrative/types.js').WriteEpisodeOptions
  ) {
    await this.assertNovelExists(novelId);
    return this.steps
      .runStep(`write episode ${episodeNumber}`, () =>
        narrativePipeline.writeEpisodeChapter(this.llm, novelId, episodeNumber, options)
      )
      .then((r) => r.output);
  }

  async getUniverseSummary(novelId: string) {
    await this.assertNovelExists(novelId);
    return narrativePipeline.getUniverseSummary(novelId);
  }

  /** 双线叙事：世界模拟 Tick */
  async tickUniverse(novelId: string, options?: UniverseTickOptions): Promise<UniverseTickResult> {
    await this.assertNovelExists(novelId);
    return this.steps
      .runStep('universe tick', () => runUniverseTick(this.llm, novelId, options))
      .then((r) => r.output);
  }

  /** 周期链：选取碰撞点 */
  async pickCycleCollision(
    novelId: string,
    options?: {
      collisionId?: string;
      autoDiscoverCollisions?: boolean;
      maxCollisions?: number;
    }
  ): Promise<Collision> {
    await this.assertNovelExists(novelId);
    return this.steps
      .runStep('pick collision', () =>
        pickCycleCollision(
          this.llm,
          novelId,
          options?.collisionId,
          options?.autoDiscoverCollisions !== false,
          options?.maxCollisions ?? 6
        )
      )
      .then((r) => r.output);
  }

  /**
   * 单体叙事周期（单 job 跑完全流程）。
   * Web 生产路径请用 `startCycleChain` / `enqueueNarrativeCycle`，不要新增对此方法的依赖。
   */
  async runNarrativeCycle(
    novelId: string,
    options?: NarrativeCycleOptions
  ): Promise<NarrativeCycleResult> {
    await this.assertNovelExists(novelId);
    return this.steps
      .runStep('narrative cycle', () => runNarrativeCycle(this.llm, novelId, options))
      .then((r) => r.output);
  }

  private async assertNovelExists(novelId: string): Promise<void> {
    const exists = await store.novelExists(novelId);
    if (!exists) {
      throw new Error(`作品 "${novelId}" 不存在，请先运行 init-novel`);
    }
  }
}
