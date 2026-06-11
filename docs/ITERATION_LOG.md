# 小说家 Agent 迭代记录

按时间记录每次迭代的决策、完成项与下一步，便于中断后接续研发。

---

## 迭代 0 — 项目启动与方案定稿（2026-06-10）

### 背景

从零在 `xiaoshuojia` 目录实现「小说家」Agent。用户为前端 Agent 研发工程师，要求：

- Node.js 实现
- 代码注释丰富，便于理解 Agent 研发链路
- MVP 聚焦**小说内容产出**，暂不接番茄/起点发布

### 方案决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 框架 | 轻量 CLI（非 NestJS） | 快速验证核心链路，降低首版复杂度 |
| MVP 范围 | 仅内容产出闭环 | 发布集成依赖风控/登录，后置 |
| 存储 | 本地 JSON + Markdown | 易调试、易学习、零依赖 |
| LLM | OpenAI-compatible | 兼容多厂商网关 |

### 产出

- [x] 项目脚手架（`package.json`、`tsconfig`、`.env.example`）
- [x] 领域模型与 Zod Schema（`src/novel/types.ts`）
- [x] 本地存储（`src/novel/store.ts`）
- [x] LLM 客户端 + dry-run mock（`src/llm/client.ts`）
- [x] 四类 Prompt（outline / chapter-write / chapter-review / memory-update）
- [x] Pipeline + Runtime（`pipeline.ts`、`runtime.ts`）
- [x] CLI 六命令（init / plan / write / review / list / show）
- [x] `docs/architecture.md`、`README.md`

### 验证

- `npm run typecheck` — 通过
- `npm run dry-run` — 写作链路中 memory mock 关键词未命中，待修复

---

## 迭代 1 — 修复 dry-run + 研发文档（2026-06-10）

### 目标

- 修复 dry-run 全流程
- 新增 `DEVELOPMENT.md`、`ITERATION_LOG.md`，支持中断恢复

### 变更

- [x] `LlmClient.mockJsonResponse`：增加 `剧情档案` / `更新后的故事状态` 关键词，修复 memory-update 步骤
- [x] 新增 `docs/DEVELOPMENT.md`（技术方案、目录、恢复清单）
- [x] 新增 `docs/ITERATION_LOG.md`（本文件）
- [x] `npm run typecheck` 通过
- [x] `npm run dry-run` 全绿（init → outline → write-chapter）
- [x] README 合并去重，补充文档链接

### 下一步（Phase 1 收尾 → Phase 2）

1. 用真实 API 跑通一部短篇（3–5 章），人工检查连贯性
2. 根据审稿 issues 调 Prompt（文风、节奏、伏笔密度）
3. Phase 2 候选：审稿不通过自动重写、向量检索长程记忆
4. Phase 3 候选：`src/platforms/` 番茄/起点发布骨架

---

## 迭代 2 — 多小说工作台 + Scheduler（2026-06-10）

### 目标

将 CLI MVP 升级为 Next.js 全栈工作台：多小说管理、页面操作、API 入队、本地任务队列与定时自动生成章节。

### 变更

- [x] Next.js 脚手架：`app/`、`components/`、`next.config.mjs`、深色工作台 UI
- [x] 配置重构：`bootstrapEnvSync()`、`getDataRoot()` / `getJobsRoot()`，去除顶层 dotenv 副作用
- [x] 存储：`atomic-fs` 原子写 JSON；`listChapterNumbers()`
- [x] 服务层 `novel-service.ts` + API Routes（novels / outline / chapters / jobs / schedules）
- [x] 任务系统：`queue.ts`、`worker.ts`、`scheduler.ts`；`novelId` 互斥锁
- [x] 页面：首页列表、新建、详情+操作、章节阅读、任务队列
- [x] `scripts/worker.ts` 独立进程；`npm run dev:all`
- [x] 双 tsconfig：`tsconfig.json`（Next）、`tsconfig.src.json`（CLI 编译）
- [x] 文档更新：README、DEVELOPMENT.md

### 验证

- `npm run typecheck` — 通过
- `npm run dry-run` — 通过（init 已存在时跳过）
- `npm run worker:dry-run` — 通过（自动入队并写第 2 章）
- `npm run build:web` — 通过

### 下一步

1. 真实 API 连续写 3–5 章，验证 Web + worker 联调
2. 增强 cron 解析或改用成熟调度库
3. 任务失败重试、页面一键重试
4. Phase 2：长程记忆与自动修订

---

## 迭代 3 — 双线叙事引擎 MVP（2026-06-10）

### 目标

从「章节大纲驱动写作」升级为「世界线 × 主人公线碰撞 → 事件包 → 章节正文」。

### 变更

- [x] 领域模型 `src/narrative/types.ts`：WorldBible、WorldTimeline、HeroTimeline、Collision、EpisodePlan
- [x] 存储 `src/narrative/store.ts`：world-bible、world-timeline、hero-timeline、collisions、episodes
- [x] Pipeline：buildUniverse、discoverCollisions、planEpisodeFromCollision、writeEpisodeChapter
- [x] Prompts：world-builder、hero-planner、collision-designer、episode-planner、episode-write、dual-line-review
- [x] Runtime + Job 类型：build-universe、discover-collisions、plan-episode、write-episode
- [x] API：universe / collisions / episodes
- [x] UI：NarrativeWorkbench 五 Tab（概览/世界线/主人公线/碰撞工坊/章节产出）
- [x] `npm run narrative:dry-run` 全流程验证

### 验证

- `npm run typecheck`
- `npm run narrative:dry-run`

### 下一步

1. MVP2：可编辑时间轴、锁定关键事件
2. MVP3：worker tick 自动推进世界模拟

---

## 迭代 4 — 明线/隐线产出优化（2026-06-10）

### 目标

世界线=隐线、主人公线=明线：写作时不直述幕后，碰撞按风险排序，状态更新守 POV。

### 变更

- [x] `sceneBeats` 分 `hero` / `shadow-hint`，事件包新增 `shadowHints`
- [x] `src/narrative/disclosure.ts`：禁词提取、泄露检测、碰撞排序、heroGains POV 闸门
- [x] 碰撞评分 `disclosureRisk` / `surfaceStrength` / `causalTightness`
- [x] 审稿 `hiddenLineLeak` + 程序禁词检测
- [x] **双阶段写作**：`episode-surface-write` → `episode-shadow-weave`
- [x] **泄露自动修复**：`episode-leak-rewrite`，默认最多 2 次局部重写
- [x] 写章返回 `writingMeta`（双阶段/泄露修复次数）

### 验证

- `npm run typecheck`
- `npm run narrative:dry-run`（双阶段 + 泄露修复 1 次）

---

## 迭代 5 — MVP2 可编辑时间轴（2026-06-10）

### 目标

作者可控制世界因果：编辑时间轴、锁定关键事件、标记必须碰撞、审阅写作中间稿。

### 变更

- [x] `locked` 世界/主角事件字段，AI 状态更新跳过锁定项
- [x] `required` 碰撞字段，重新发现时合并保留
- [x] `src/narrative/timeline-editor.ts` + `PATCH timeline` / `PATCH collisions`
- [x] 工作台：编辑天数、锁定、添加事件、势力目标、碰撞必须/拒绝
- [x] 事件包 `writingDrafts` 持久化明线/织入中间稿
- [x] `npm run timeline-edit-test`

### 验证

- `npm run typecheck`
- `npm run timeline-edit-test`
- `npm run narrative:dry-run`

### 下一步

1. ~~MVP3：worker tick 自动推进世界模拟~~（见迭代 6）
2. 时间轴可视化（拖拽排序）

---

## 迭代 6 — MVP3 世界模拟 Tick（2026-06-10）

### 目标

Worker 定时或手动推进世界状态：势力行动、主角行动、碰撞池持续更新。

### 变更

- [x] `src/narrative/world-simulator.ts` + prompts（世界模拟器、主人公线推进器）
- [x] Job `universe-tick` + worker 分支 + `runtime.tickUniverse`
- [x] `universe-sim.json` 记录 tick 统计
- [x] `Schedule.mode`：`classic` | `narrative`，narrative 模式 cron 入队 tick
- [x] `POST /api/novels/:id/tick` + 工作台「推进世界 N 天」与叙事调度配置
- [x] dry-run mock + `npm run universe-tick-test`

### 验证

- `npm run typecheck`
- `npm run universe-tick-test`
- `npm run narrative:dry-run`（回归）
- `npm run timeline-edit-test`（回归）

### 下一步

1. ~~从碰撞一键写章的批量调度（tick → plan → write 链）~~（见迭代 7）
2. 时间轴可视化（拖拽排序）

---

## 迭代 7 — MVP4 叙事周期链（2026-06-10）

### 目标

一键完成「推进世界 → 选碰撞 → 写章」，支持定时自动产出。

### 变更

- [x] `src/narrative/pipeline-cycle.ts` + `pickBestCollision`
- [x] Job `narrative-cycle` + `narrative-cycle.json` 运行记录
- [x] `Schedule.mode = narrative-auto` 定时完整周期
- [x] `POST /api/novels/:id/cycle` + 工作台「一键产出章节」
- [x] `npm run narrative-cycle-test`

### 验证

- `npm run typecheck`
- `npm run narrative-cycle-test`
- `npm run universe-tick-test`（回归）
- `npm run narrative:dry-run`（回归）

### 下一步

1. ~~时间轴可视化（拖拽排序）~~（见迭代 8）
2. ~~同日内 sortOrder + 碰撞耗尽告警~~（见迭代 9）
3. 周期失败重试

---

## 迭代 8 — 时间轴可视化（2026-06-10）

### 目标

作者可直观看到明线/隐线按天分布，并通过拖拽调整事件天数。

### 变更

- [x] `components/TimelineVisualizer.tsx` 双轨泳道 + 横向滚动
- [x] HTML5 拖拽改天，复用 `PATCH timeline`
- [x] 工作台新增 **时间轴** Tab；碰撞日、当前日标记
- [x] 样式：`app/globals.css` timeline 主题

### 验证

- `npm run typecheck`
- `npm run build:web`
- 浏览器：作品详情 → 时间轴 → 拖拽事件改天

### 下一步

1. ~~同日内事件排序（`sortOrder` 字段）~~（见迭代 9）
2. ~~碰撞耗尽告警~~（见迭代 9）
3. 周期失败重试

---

## 迭代 9 — 同日内排序 + 碰撞耗尽告警（2026-06-10）

### 目标

作者可在同一天内调整事件先后；碰撞池为空时给出明确提示，避免盲目点「一键产出」。

### 变更

- [x] `WorldEvent` / `HeroEvent` 增加 `sortOrder`；`timeline-sort.ts` 归一化与移动逻辑
- [x] `PATCH timeline` 新增 `moveWorldEvent` / `moveHeroEvent`
- [x] `TimelineVisualizer`：按 `sortOrder` 排序；拖到卡片上 = 插入其前
- [x] `NarrativeWorkbench`：时间轴拖拽走 move op；概览碰撞池空告警 + 禁用一键产出
- [x] `scripts/timeline-edit-test.ts` 覆盖同日内重排

### 验证

- `npm run typecheck`
- `npm run timeline-edit-test`
- `npm run build:web`

### 下一步

1. ~~周期失败重试~~（见迭代 10）

---

## 迭代 10 — 周期失败重试与断点续跑（2026-06-10）

### 目标

`narrative-cycle` 在 tick / 选碰撞 / 生成事件包 / 写章任一阶段失败后，能记录断点并自动或手动续跑，避免重复 tick。

### 变更

- [x] `NarrativeCycleLog` 增加 `lastStatus`、`failedStage`、`resume` 等字段
- [x] `cycle-retry.ts`：分阶段失败记录与 resume 构建
- [x] `pipeline-cycle.ts`：分阶段 try/catch；支持 `episodeNumber` 跳过 plan
- [x] Job 增加 `attempt` / `maxAttempts` / `parentJobId`；周期默认最多 3 次
- [x] worker 失败后自动入队续跑；`retryJob` / `enqueueNarrativeCycleRetry`
- [x] API：`POST /api/jobs/:jobId/retry`、`POST /api/novels/:id/cycle/retry`
- [x] 工作台失败告警 +「续跑失败周期」；任务队列页重试按钮
- [x] `npm run narrative-cycle-retry-test`

### 验证

- `npm run typecheck`
- `npm run narrative-cycle-retry-test`
- `npm run narrative-cycle-test`（回归）
- `npm run build:web`

### 下一步

1. ~~周期各阶段独立 job 化~~（见迭代 11）
2. 指数退避延迟重试

---

## 迭代 11 — 周期各阶段独立 job 化（2026-06-10）

### 目标

将 monolithic `narrative-cycle` 拆为 4 个可独立重试的 job 链，并在工作台展示阶段进度。

### 变更

- [x] 新 job：`cycle-pick-collision`；payload 增加 `cycleRunId`
- [x] `cycle-run.json` + `CycleRun` 阶段状态（tick / collision / plan / write）
- [x] `cycle-chain.ts`：启动链、阶段推进、失败续跑
- [x] worker 完成后自动入队下一阶段；失败仅重试当前阶段
- [x] `POST /cycle`、调度器 `narrative-auto` 改为启动周期链
- [x] 工作台 `CycleProgress` 组件展示 4 步进度
- [x] `npm run narrative-cycle-chain-test`

### 验证

- `npm run typecheck`
- `npm run narrative-cycle-chain-test`
- `npm run narrative-cycle-retry-test`（回归）
- `npm run build:web`

### 下一步

1. ~~配角隐线（迭代 12）~~
2. 指数退避延迟重试
3. 周期链历史记录（多轮 cycle-run 归档）

---

## 迭代 12 — 配角隐线（2026-06-10）

### 目标

在世界线（势力级隐线）与主人公线（明线）之外，增加配角独立隐线：随世界 Tick 自然演化，主角通常感知不到，仅通过 `protagonistAwareness` 渗透涟漪。

### 变更

- [x] `SupportCharacter` / `SupportEvent` / `SupportTimeline` 数据模型 + `support-timeline.json`
- [x] World Bible 生成 3～5 名配角档案；`buildUniverse` 种子配角隐线
- [x] Tick 顺序：世界线 → **配角隐线** → 主人公线
- [x] `hero-tick` 接收 rumor/partial 配角涟漪；碰撞扫描含 `supportEventIds`
- [x] 时间轴 UI 第三泳道（配角隐线，只读）
- [x] `npm run support-tick-test`

### 验证

- `npm run typecheck`
- `npm run support-tick-test`
- `npm run universe-tick-test`（回归）

### 下一步

1. ~~配角隐线手动编辑 / 拖拽排序~~（迭代 13）
2. 指数退避延迟重试
3. 周期链历史归档

---

## 迭代 13 — 配角隐线可编辑（2026-06-10）

### 目标

配角隐线与世界线、主人公线对齐：支持 PATCH 编辑、表格管理、时间轴拖拽与同日内排序。

### 变更

- [x] `TimelinePatch`：`updateSupportEvent` / `moveSupportEvent` / `addSupportEvent` / `updateSupportCharacterGoals`
- [x] `timeline-editor.ts` 实现配角 CRUD 与移动
- [x] `TimelineVisualizer` 配角轨可拖拽
- [x] 工作台新 Tab「配角隐线」：目标编辑、感知程度、锁定、添加事件
- [x] `timeline-edit-test` 扩展配角用例

### 验证

- `npm run typecheck`
- `npm run timeline-edit-test`

### 下一步

1. ~~指数退避延迟重试~~（见迭代 14）
2. 周期链历史归档

### 恢复提示

```bash
cd /Users/xinyu.wang06/codelib/agents/xiaoshuojia
npm run typecheck && npm run support-tick-test && npm run universe-tick-test
npm run dev:all   # 浏览器 http://localhost:3000
```

测试作品：`test-xiaoshuo` → `data/novels/test-xiaoshuo/`

---

## 迭代 14 — 指数退避延迟重试（2026-06-10）

### 目标

任务失败自动/手动重试不再立即入队，按 attempt 指数退避，worker 仅在 `runAt` 到期后领取。

### 变更

- [x] `src/jobs/retry-backoff.ts`：`computeRetryDelayMs` / `computeRetryRunAt` / `isJobDue`
- [x] `Job.runAt` 可选字段；`enqueueJob` / `retryJob` 写入退避时间
- [x] `selectNextPendingJob` + `claimNextPendingJob` 跳过未到期 pending
- [x] `worker` 单体周期与 `cycle-chain` 阶段失败重试均带 `runAt`
- [x] 任务队列页显示「计划执行」
- [x] `scripts/retry-backoff-test.ts`

### 验证

- `npm run typecheck`
- `npm run retry-backoff-test`
- `npm run narrative-cycle-retry-test`

### 下一步

1. ~~周期链历史归档~~（见迭代 15）

### 恢复提示

```bash
cd /Users/xinyu.wang06/codelib/agents/xiaoshuojia
npm run typecheck && npm run retry-backoff-test && npm run narrative-cycle-retry-test
```

---

## 迭代 15 — 周期链历史归档（2026-06-10）

### 目标

多轮周期链的 `CycleRun` 在终态后写入历史文件，避免 `cycle-run.json` 被旧记录占用；工作台可浏览最近几轮。

### 变更

- [x] `cycle-run-history.json` + `CycleRunHistory` 类型（最新在前，上限 50）
- [x] `archiveTerminalCycleRun` / `appendCycleRunHistory`（`store.ts`）
- [x] 成功完成、重试用尽、新链启动前、手动续跑前自动归档
- [x] 重试入队时将 `run.status` 恢复为 `running`
- [x] 工作台 `CycleRunHistoryList` 展示最近 8 轮
- [x] `scripts/cycle-run-archive-test.ts`；更新 `narrative-cycle-chain-test`

### 验证

- `npm run typecheck`
- `npm run cycle-run-archive-test`
- `npm run narrative-cycle-chain-test`

### 恢复提示

```bash
cd /Users/xinyu.wang06/codelib/agents/xiaoshuojia
npm run typecheck && npm run cycle-run-archive-test && npm run narrative-cycle-chain-test
```

---

## 模板：后续迭代请复制此节

```markdown
## 迭代 N — 标题（YYYY-MM-DD）

### 目标
-

### 变更
- [ ]

### 验证
-

### 下一步
1.

### 备注
-
```
