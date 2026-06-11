/**
 * 环境配置模块
 *
 * 注意：不在模块顶层调用 dotenv.config()，避免 Next.js 构建时副作用。
 * CLI / worker 入口应显式调用 bootstrapEnv()。
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { z } from 'zod';

const require = createRequire(import.meta.url);

let envBootstrapped = false;

/** 在 CLI、worker 入口调用；Next 依赖自身 .env 加载机制 */
export async function bootstrapEnv(): Promise<void> {
  if (envBootstrapped) return;
  const dotenv = await import('dotenv');
  dotenv.config({ override: true });
  envBootstrapped = true;
}

/** CLI / worker 同步入口使用 */
export function bootstrapEnvSync(): void {
  if (envBootstrapped) return;
  require('dotenv').config({ override: true });
  envBootstrapped = true;
}

const envSchema = z.object({
  LLM_API_KEY: z.string().min(1, 'LLM_API_KEY 不能为空'),
  LLM_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  LLM_MODEL: z.string().default('gpt-4o-mini'),
  LLM_TIMEOUT_MS: z.coerce.number().positive().default(120_000),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(1),
});

export type LlmConfig = z.infer<typeof envSchema>;

export function loadLlmConfig(dryRun = false): LlmConfig {
  if (dryRun) {
    return {
      LLM_API_KEY: 'dry-run-key',
      LLM_BASE_URL: 'https://api.openai.com/v1',
      LLM_MODEL: 'gpt-4o-mini',
      LLM_TIMEOUT_MS: 120_000,
      LLM_TEMPERATURE: 1,
    };
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`环境配置错误:\n${msg}\n请复制 .env.example 为 .env 并填写 LLM_API_KEY`);
  }
  return parsed.data;
}

/** 数据根目录绝对路径，可通过 DATA_ROOT 环境变量覆盖 */
export function getDataRoot(): string {
  const root = process.env.DATA_ROOT;
  if (root) {
    return path.isAbsolute(root) ? root : path.join(process.cwd(), root);
  }
  return path.join(process.cwd(), 'data');
}

/** 小说作品目录相对 data 根的路径名 */
export const NOVELS_DIR = 'novels';

/** @deprecated 使用 getNovelsRoot() */
export const DATA_ROOT = 'data/novels';

export function getNovelsRoot(): string {
  return path.join(getDataRoot(), NOVELS_DIR);
}

export function getJobsRoot(): string {
  return path.join(getDataRoot(), 'jobs');
}
