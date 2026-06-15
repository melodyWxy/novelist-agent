import { z } from 'zod';

export const JobTypeSchema = z.enum([
  'plan-outline',
  'write-next-chapter',
  'write-chapter',
  'review-chapter',
  'build-universe',
  'discover-collisions',
  'plan-episode',
  'write-episode',
  'universe-tick',
  'narrative-cycle',
  'cycle-pick-collision',
]);
export type JobType = z.infer<typeof JobTypeSchema>;

export const JobStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobPayloadSchema = z.object({
  chapterNumber: z.number().int().positive().optional(),
  chapterCount: z.number().int().positive().optional(),
  targetWords: z.number().int().positive().optional(),
  skipReview: z.boolean().optional(),
  collisionId: z.string().optional(),
  heroEventId: z.string().optional(),
  episodeNumber: z.number().int().positive().optional(),
  worldEventCount: z.number().int().positive().optional(),
  heroEventCount: z.number().int().positive().optional(),
  maxCollisions: z.number().int().positive().optional(),
  /** 0 表示跳过 tick（断点续跑） */
  tickDays: z.number().int().nonnegative().optional(),
  autoDiscoverCollisions: z.boolean().optional(),
  skipWrite: z.boolean().optional(),
  /** 周期链 ID，关联 tick → 选碰撞 → 事件包 → 写章 */
  cycleRunId: z.string().optional(),
});

export type JobPayload = z.infer<typeof JobPayloadSchema>;

export const JobSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  type: JobTypeSchema,
  payload: JobPayloadSchema.default({}),
  status: JobStatusSchema,
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
  error: z.string().optional(),
  resultSummary: z.string().optional(),
  attempt: z.number().int().positive().default(1),
  maxAttempts: z.number().int().positive().default(1),
  parentJobId: z.string().optional(),
  /** 最早可执行时间；无则立即可被 worker 领取 */
  runAt: z.string().datetime().optional(),
});

export type Job = z.infer<typeof JobSchema>;

export const ScheduleModeSchema = z.enum(['classic', 'narrative', 'narrative-auto']);
export type ScheduleMode = z.infer<typeof ScheduleModeSchema>;

export const ScheduleSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  enabled: z.boolean().default(true),
  cron: z.string().default('0 9 * * *'),
  targetWords: z.number().int().positive().default(3500),
  maxChapters: z.number().int().positive().optional(),
  /** classic=按大纲写章；narrative=定时推进世界模拟 */
  mode: ScheduleModeSchema.default('classic'),
  tickDays: z.number().int().positive().default(1),
  autoDiscoverCollisions: z.boolean().default(true),
  maxCollisions: z.number().int().positive().default(6),
  /** 上次命中 cron 并尝试触发的时间，防止同一分钟被轮询器重复触发 */
  lastTriggeredAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
});

export type Schedule = z.infer<typeof ScheduleSchema>;

export const QueueFileSchema = z.object({
  jobs: z.array(JobSchema),
});

export const SchedulesFileSchema = z.object({
  schedules: z.array(ScheduleSchema),
});
