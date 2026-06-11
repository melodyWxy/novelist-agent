/**
 * LLM 客户端封装
 *
 * Agent 研发原理：
 * - 使用 OpenAI Chat Completions API 格式，兼容多数国内/国外网关
 * - Agent 的「思考」本质上是：构造 messages -> 调用 LLM -> 解析响应
 * - 两种输出模式：
 *   1. chat()：自由文本，用于章节正文生成
 *   2. chatJson()：要求 JSON 输出，用于大纲、审稿、记忆更新等结构化任务
 * - temperature 控制随机性：写作偏高(0.7-0.9)，审稿/记忆偏低(0.3-0.5)
 */
import { z } from 'zod';
import type { LlmConfig } from '../config.js';

/** OpenAI Chat API 消息格式 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  /** 单次请求超时（毫秒）；默认用 LLM_TIMEOUT_MS */
  timeoutMs?: number;
  /** 结构化输出（JSON 等）：关闭 MiniMax thinking，减少推理标签污染正文 */
  structured?: boolean;
}

/** 结构化 JSON 默认输出上限（世界 Bible 等大对象易超 8k） */
export const DEFAULT_STRUCTURED_MAX_TOKENS = 16_384;
const MAX_STRUCTURED_MAX_TOKENS = 32_768;

/** 宇宙构建 / 碰撞发现等较慢的多步 LLM 调用 */
export const UNIVERSE_LLM_OPTIONS: ChatOptions = {
  maxTokens: DEFAULT_STRUCTURED_MAX_TOKENS,
  timeoutMs: 300_000,
};

export const TEXT_OUTPUT_TRUNCATED_ERROR = 'LLM 文本输出被截断';

export class LlmClient {
  private readonly config: LlmConfig;
  private readonly dryRun: boolean;

  constructor(config: LlmConfig, dryRun = false) {
    this.config = config;
    this.dryRun = dryRun;
  }

  /**
   * 发送 Chat Completion 请求，返回纯文本
   */
  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    if (this.dryRun) {
      return this.mockTextResponse(messages);
    }

    const maxAttempts = 2;
    let maxTokens = options.maxTokens;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.chatOnce(messages, {
          ...options,
          maxTokens,
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (!this.isRetryableTextOutputError(error) || attempt === maxAttempts - 1) {
          throw lastError;
        }
        const currentMax = maxTokens ?? (options.structured ? DEFAULT_STRUCTURED_MAX_TOKENS : 4096);
        maxTokens = Math.min(currentMax * 2, MAX_STRUCTURED_MAX_TOKENS);
      }
    }

    throw lastError ?? new Error('chat 失败');
  }

  private async chatOnce(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {

    const base = this.config.LLM_BASE_URL.replace(/\/$/, '').replace(/\/chat\/completions$/, '');
    const url = `${base}/chat/completions`;
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? this.config.LLM_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.LLM_API_KEY}`,
        },
        body: JSON.stringify(this.buildRequestBody(messages, options)),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`LLM API 错误 ${response.status}: ${errText}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{
          finish_reason?: string | null;
          message?: { content?: string | null; reasoning_content?: string | null };
        }>;
      };

      const choice = data.choices?.[0];
      const message = choice?.message;
      const content = this.normalizeMessageContent(message?.content, message?.reasoning_content);
      if (!content) {
        throw new Error('LLM 返回空内容');
      }
      if (choice?.finish_reason === 'length') {
        throw new Error(`${TEXT_OUTPUT_TRUNCATED_ERROR}: finish_reason=length`);
      }
      return content;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 要求 LLM 返回 JSON，并用 Zod Schema 校验
   *
   * 原理：在 system prompt 中强调「只输出 JSON」，然后 strip markdown code fence 再 parse
   */
  async chatJson<S extends z.ZodTypeAny>(
    messages: ChatMessage[],
    schema: S,
    options: ChatOptions = {}
  ): Promise<z.output<S>> {
    const maxAttempts = 2;
    let maxTokens = options.maxTokens ?? DEFAULT_STRUCTURED_MAX_TOKENS;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.chatJsonOnce(messages, schema, {
          ...options,
          maxTokens,
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const retryable = this.isRetryableStructuredOutputError(error);
        if (!retryable || attempt === maxAttempts - 1) {
          throw lastError;
        }
        maxTokens = Math.min(maxTokens * 2, MAX_STRUCTURED_MAX_TOKENS);
      }
    }

    throw lastError ?? new Error('chatJson 失败');
  }

  private async chatJsonOnce<S extends z.ZodTypeAny>(
    messages: ChatMessage[],
    schema: S,
    options: ChatOptions = {}
  ): Promise<z.output<S>> {
    const jsonMessages: ChatMessage[] = [
      ...messages,
      {
        role: 'user',
        content: '请严格只输出合法 JSON，不要包含 markdown 代码块或其他说明文字。',
      },
    ];

    const raw = this.dryRun
      ? this.mockJsonResponse(messages)
      : await this.chat(jsonMessages, {
          ...options,
          temperature: options.temperature ?? 0.4,
          structured: true,
        });

    const cleaned = this.extractJson(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`LLM 返回的不是合法 JSON:\n${raw.slice(0, 500)}`);
    }

    return schema.parse(parsed) as z.output<S>;
  }

  private isRetryableStructuredOutputError(error: unknown): boolean {
    if (error instanceof z.ZodError) return true;
    if (!(error instanceof Error)) return false;
    return (
      error.message.includes('不是合法 JSON') ||
      error.message.includes('Unexpected end of JSON') ||
      error.message.includes('Unterminated string')
    );
  }

  private isRetryableTextOutputError(error: unknown): boolean {
    return error instanceof Error && error.message.includes(TEXT_OUTPUT_TRUNCATED_ERROR);
  }

  private isMiniMaxModel(): boolean {
    return /minimax/i.test(this.config.LLM_MODEL);
  }

  private buildRequestBody(messages: ChatMessage[], options: ChatOptions): Record<string, unknown> {
    const maxOut =
      options.maxTokens ?? (options.structured ? DEFAULT_STRUCTURED_MAX_TOKENS : 4096);
    const body: Record<string, unknown> = {
      model: this.config.LLM_MODEL,
      messages,
      temperature: options.temperature ?? this.config.LLM_TEMPERATURE,
      max_tokens: maxOut,
    };
    if (this.isMiniMaxModel()) {
      body.max_completion_tokens = maxOut;
      // MiniMax-M3 默认开启 thinking，低 max_tokens 时正文常被截断为空；写作与 JSON 均关闭 thinking
      body.thinking = { type: 'disabled' };
      if (options.structured) {
        body.reasoning_split = true;
      }
    }
    return body;
  }

  private normalizeMessageContent(
    content?: string | null,
    reasoningContent?: string | null
  ): string {
    const main = this.stripThinkingBlocks((content ?? '').trim());
    if (main) return main;
    return this.stripThinkingBlocks((reasoningContent ?? '').trim());
  }

  private stripThinkingBlocks(text: string): string {
    if (!text) return text;
    return text
      .replace(/<think[^>]*>[\s\S]*?<\/think>/gi, '')
      .replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, '')
      .trim();
  }

  /** 从响应中提取 JSON（处理 thinking 标签、markdown 代码块） */
  private extractJson(text: string): string {
    let cleaned = this.stripThinkingBlocks(text);

    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      return fenceMatch[1].trim();
    }

    const objectStart = cleaned.indexOf('{');
    const arrayStart = cleaned.indexOf('[');
    const start =
      objectStart === -1
        ? arrayStart
        : arrayStart === -1
          ? objectStart
          : Math.min(objectStart, arrayStart);
    if (start === -1) {
      return cleaned;
    }

    const opener = cleaned[start];
    const closer = opener === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === opener) depth++;
      if (ch === closer) {
        depth--;
        if (depth === 0) {
          return cleaned.slice(start, i + 1);
        }
      }
    }

    return cleaned.slice(start).trim();
  }

  /** dry-run 模式：根据最后一条 user 消息类型返回模拟文本 */
  private mockTextResponse(messages: ChatMessage[]): string {
    const combined = messages.map((m) => m.content).join('\n');

    if (combined.includes('隐线泄露修复师') || combined.includes('待修复正文')) {
      return (
        '【DRY-RUN 泄露修复后正文】\n\n' +
        '林凡踏入黑石谷，林间靴印整齐得不像猎户所留。远处金属碰撞声被风撕碎，他心头一紧，却说不清为何。\n\n' +
        '药农递来的包裹上有被搜查的痕迹，林凡攥紧令牌残片，转身没入暮色。'
      );
    }

    if (combined.includes('隐线织入师') || combined.includes('织入隐线暗示后的完整章节')) {
      return (
        '【DRY-RUN 织入后正文】\n\n' +
        '林凡踏入黑石谷，林间靴印整齐得不像猎户所留。远处金属碰撞声被风撕碎，他心头一紧。\n\n' +
        '暗部生化计划仍在暗处推进。药农递来的包裹上有被搜查的痕迹，林凡攥紧令牌残片，转身没入暮色。'
      );
    }

    if (combined.includes('明线草稿师') || combined.includes('明线草稿（第一阶段')) {
      return (
        '【DRY-RUN 明线草稿】\n\n' +
        '林凡为寻寒髓草踏入黑石谷，途中遭遇武装封锁。他救下一名药农，从对方手中接过一枚残破令牌，带伤脱身。'
      );
    }

    if (combined.includes('章节正文') || combined.includes('撰写') || combined.includes('事件包')) {
      return (
        '【DRY-RUN 单阶段正文】\n\n' +
        '晨曦微露，山门之外已有弟子往来。林凡站在崖边，望着远处云海翻涌，心中却另有盘算。\n\n' +
        '这一日，注定不会平静。'
      );
    }
    return '【DRY-RUN】模拟 LLM 文本响应';
  }

  /** dry-run 模式：返回模拟 JSON */
  private mockJsonResponse(messages: ChatMessage[]): string {
    const combined = messages.map((m) => m.content).join('\n');

    if (combined.includes('世界 Bible') || combined.includes('世界观架构师')) {
      return JSON.stringify({
        era: '【DRY-RUN】末法修行纪元',
        geography: ['玄胤国', '黑石谷', '青云宗'],
        powerSystem: '炼气筑基体系',
        coreConflicts: ['各国暗中研发生化改造兵器', '宗门与皇权博弈'],
        factions: [
          { id: 'f1', name: '玄胤国', type: '国家', goals: ['研发生化改造人兵器'], resources: ['军队', '暗部'], relationships: { f2: '敌对' } },
          { id: 'f2', name: '青云宗', type: '宗门', goals: ['守护秘境'], resources: ['弟子', '灵药'], relationships: {} },
        ],
        supportCharacters: [
          { id: 's1', name: '苏青', role: '药商', goals: ['垄断寒髓草货源'], factionId: 'f2', traits: ['精明'] },
          { id: 's2', name: '韩默', role: '暗部接头人', goals: ['完成采集任务'], factionId: 'f1', traits: ['冷酷'] },
        ],
      });
    }

    if (combined.includes('碰撞引擎设计师')) {
      return JSON.stringify({
        collisions: [
          {
            title: '采药撞见暗部清场',
            collisionType: 'location',
            worldEventIds: ['w1'],
            heroEventIds: ['h1'],
            day: 16,
            location: '黑石谷',
            rationale: '主角采药与暗部收集材料同地同时',
            surfaceConflict: '主角采药被神秘部队阻拦',
            hiddenCausality: '部队在收集生化改造材料',
            readerRevealLevel: 'hint',
            heroRevealLevel: 'hint',
            risks: ['信息暴露不宜过早'],
            disclosureRisk: 'low',
            surfaceStrength: 'high',
            causalTightness: 'high',
            required: false,
          },
        ],
      });
    }

    if (combined.includes('配角隐线编剧') || combined.includes('配角隐线推进器')) {
      const rangeMatch = combined.match(/生成第 (\d+)～(\d+) 天/);
      const toOnlyMatch = combined.match(/(?:至第|推进到第) (\d+) 天/);
      const toDay = rangeMatch
        ? parseInt(rangeMatch[2], 10)
        : toOnlyMatch
          ? parseInt(toOnlyMatch[1], 10)
          : 16;
      const fromDay = rangeMatch ? parseInt(rangeMatch[1], 10) : toDay - 1;
      return JSON.stringify({
        events: [
          {
            characterId: 's1',
            day: fromDay,
            title: '囤积药材',
            intent: '趁封锁前低价收走城中寒髓草',
            location: '城中',
            protagonistAwareness: 'rumor',
            worldEventIds: [],
          },
          {
            characterId: 's2',
            day: toDay,
            title: '夜间清场',
            intent: '驱赶猎户并封锁谷道',
            location: '黑石谷',
            protagonistAwareness: 'none',
            worldEventIds: [],
          },
        ],
        resolvedEventIds: [],
      });
    }

    if (combined.includes('世界模拟器')) {
      const rangeMatch = combined.match(/生成第 (\d+)～(\d+) 天/);
      const dayMatch = combined.match(/至第 (\d+) 天/);
      const toDay = rangeMatch
        ? parseInt(rangeMatch[2], 10)
        : dayMatch
          ? parseInt(dayMatch[1], 10)
          : 18;
      const fromDay = rangeMatch ? parseInt(rangeMatch[1], 10) : toDay - 1;
      return JSON.stringify({
        events: [
          {
            day: fromDay,
            title: '暗部推进采集',
            description: '玄胤国暗部在黑石谷深处架设临时营地',
            location: '黑石谷',
            factionIds: ['f1'],
            visibility: 'secret',
            consequences: ['封锁范围扩大'],
          },
          {
            day: toDay,
            title: '兽潮余波',
            description: '外围猎户报告异常兽吼，药材采集受阻',
            location: '黑石谷外围',
            factionIds: ['f1'],
            visibility: 'rumor',
            consequences: ['寒髓草价格飙升'],
          },
        ],
        resolvedEventIds: [],
      });
    }

    if (combined.includes('主人公线推进器')) {
      const rangeMatch = combined.match(/生成第 (\d+)～(\d+) 天/);
      const toOnlyMatch = combined.match(/至第 (\d+) 天/);
      const toDay = rangeMatch
        ? parseInt(rangeMatch[2], 10)
        : toOnlyMatch
          ? parseInt(toOnlyMatch[1], 10)
          : 18;
      const fromDay = rangeMatch ? parseInt(rangeMatch[1], 10) : toDay - 1;
      return JSON.stringify({
        protagonistGoal: '三日内找到寒髓草治病',
        crisis: '封锁加剧，时间更紧',
        events: [
          {
            day: fromDay,
            title: '打听封锁',
            intent: '向药商打听黑石谷异动',
            location: '城中',
            constraints: ['资金紧张'],
            emotionalState: '焦虑',
            knownWorldFacts: ['药价上涨', '谷外围危险'],
          },
          {
            day: toDay,
            title: '再入黑石谷',
            intent: '趁夜色潜入采集寒髓草',
            location: '黑石谷',
            constraints: ['修为低', '封锁严密'],
            emotionalState: '决绝',
            knownWorldFacts: ['传闻有武装封锁'],
          },
        ],
      });
    }

    if (combined.includes('世界线编剧')) {
      return JSON.stringify({
        events: [
          { day: 12, title: '暗部入谷', description: '玄胤国暗部进入黑石谷收集妖兽脊髓', location: '黑石谷', factionIds: ['f1'], visibility: 'secret', consequences: ['外围封锁'] },
          { day: 15, title: '兽潮异常', description: '黑石谷外围出现兽潮，药材断供', location: '黑石谷外围', factionIds: ['f1'], visibility: 'rumor', consequences: ['药价上涨'] },
        ],
      });
    }

    if (combined.includes('双线状态更新器')) {
      return JSON.stringify({
        worldTimeline: { currentDay: 16, eventUpdates: [], newEvents: [] },
        heroTimeline: { protagonistGoal: '继续追查暗部', crisis: '被追杀', eventUpdates: [], newEvents: [] },
        storyState: {
          timeline: '第16天黄昏',
          lastChapterSummary: '主角采药撞见暗部，救下药农',
          characters: [{ name: '林凡', role: '主角', traits: ['坚韧'], currentStatus: '受伤脱身', relationships: {} }],
          foreshadowing: [{ id: 'f1', description: '生化改造阴谋', introducedInChapter: 1, resolved: false }],
          openThreads: ['暗部身份', '寒髓草下落'],
        },
      });
    }

    if (combined.includes('主人公线编剧')) {
      return JSON.stringify({
        protagonistGoal: '三日内找到寒髓草治病',
        crisis: '病情恶化',
        events: [
          { day: 14, title: '病情恶化', intent: '寻找救命药材', location: '城中', constraints: ['缺钱', '时间紧'], emotionalState: '焦虑', knownWorldFacts: ['药价上涨'] },
          { day: 16, title: '入谷采药', intent: '进入黑石谷采寒髓草', location: '黑石谷', constraints: ['修为低'], emotionalState: '决绝', knownWorldFacts: ['谷外围危险'] },
        ],
      });
    }

    if (combined.includes('章节事件包编剧')) {
      return JSON.stringify({
        title: '谷中遭遇',
        timeWindow: '第16天 黄昏',
        day: 16,
        location: '黑石谷',
        worldEventsInPlay: ['暗部入谷'],
        heroIntent: '采集寒髓草',
        collisionType: 'location',
        surfaceConflict: '采药途中遭遇封锁',
        hiddenCausality: '暗部生化计划',
        sceneBeats: [
          { line: 'hero', beat: '林凡入谷采药' },
          { line: 'shadow-hint', beat: '林间出现规整的脚印与非天然切痕' },
          { line: 'hero', beat: '遭遇封锁与阻拦' },
          { line: 'shadow-hint', beat: '远处传来压抑的金属碰撞声' },
          { line: 'hero', beat: '救下药农脱身' },
        ],
        shadowHints: [
          '地面有不符合猎户习惯的靴印阵列',
          '空气中残留刺鼻药味与焦糊气息',
          '失踪药农留下的包裹有被搜查痕迹',
        ],
        readerGains: ['察觉有阴谋'],
        heroGains: ['获得令牌残片', '确认黑石谷内有武装封锁'],
        foreshadowing: ['生化改造'],
        worldStateChanges: ['暗部行动暴露风险上升'],
        heroStateChanges: ['与暗部结怨'],
      });
    }

    if (combined.includes('双线一致性审稿')) {
      return JSON.stringify({
        chapterNumber: 1,
        passed: true,
        score: 88,
        worldCausalityOk: true,
        heroKnowledgeOk: true,
        collisionNatural: true,
        stateChanged: true,
        hiddenLineLeak: false,
        leakedTerms: [],
        issues: [],
        summary: '【DRY-RUN】双线碰撞自然，主角视野合理，无隐线泄露',
        reviewedAt: new Date().toISOString(),
      });
    }

    if (combined.includes('大纲') || combined.includes('outline')) {
      return JSON.stringify({
        premise: '【DRY-RUN】少年林凡踏上修行之路，揭开身世之谜',
        themes: ['成长', '复仇', '友情'],
        arcs: [{ name: '初入宗门', description: '主角入门，建立人际关系', chapterRange: [1, 10] }],
        chapters: [
          { chapterNumber: 1, title: '山门初遇', summary: '林凡抵达山门，遭遇第一次考验', keyEvents: ['抵达', '考验'] },
          { chapterNumber: 2, title: '拜师之礼', summary: '通过考验，正式入门', keyEvents: ['拜师'] },
        ],
        generatedAt: new Date().toISOString(),
      });
    }

    if (combined.includes('审稿') || combined.includes('review')) {
      return JSON.stringify({
        chapterNumber: 1,
        passed: true,
        score: 85,
        issues: [],
        summary: '【DRY-RUN】章节连贯性良好，人物动机清晰',
        reviewedAt: new Date().toISOString(),
      });
    }

    if (
      combined.includes('记忆') ||
      combined.includes('memory') ||
      (combined.includes('状态更新') && !combined.includes('双线状态更新器')) ||
      combined.includes('剧情档案') ||
      combined.includes('更新后的故事状态')
    ) {
      return JSON.stringify({
        timeline: '入门第一天，清晨',
        lastChapterSummary: '林凡抵达山门，通过初步考验',
        characters: [
          {
            name: '林凡',
            role: '主角',
            traits: ['坚韧', '聪慧'],
            currentStatus: '刚通过山门考验，等待拜师',
            relationships: {},
          },
        ],
        foreshadowing: [{ id: 'f1', description: '林凡身世之谜', introducedInChapter: 1, resolved: false }],
        openThreads: ['拜师结果', '身世线索'],
      });
    }

    return JSON.stringify({ mock: true });
  }
}
