# 小说家 Agent 开发文档

本文档记录技术方案、目录约定与研发上下文，便于中断后快速恢复。

**最后更新**：2026-06-10  
**当前阶段**：双线叙事引擎 MVP + 多小说工作台  
**状态**：`npm run narrative:dry-run` 可离线验证双线全流程；真实 LLM 需配置 `.env`

---

## 1. 项目目标

构建名为「小说家」的 Node.js Agent，核心能力是 AI 自动化产出长篇小说章节。支持多部小说并行管理、页面操作与定时自动生成。远期目标包括番茄小说、阅文起点等平台的自动发布与评论回复；**当前不接发布平台**。

## 2. 技术方案摘要

| 维度 | 选型 | 说明 |
|------|------|------|
| 运行时 | Node.js ≥ 18 + TypeScript | CLI + Next.js 服务端 |
| Web | Next.js 15 App Router | 页面 + API Routes（`runtime = 'nodejs'`） |
| 执行方式 | CLI + 独立 worker 进程 | 长任务不入 API 请求 |
| LLM | OpenAI-compatible API | `fetch` 直调 `/chat/completions` |
| 配置 | `dotenv` + `.env` | CLI/worker 显式 `bootstrapEnvSync()` |
| 校验 | Zod | 领域模型 + LLM JSON 输出 |
| 调度 | `node-cron` + JSON 队列 | `data/jobs/queue.json`、`schedules.json` |
| 存储 | 本地文件系统 | `DATA_ROOT` 默认 `./data` |

### 架构分层

```
Next Web UI (app/)
  → API Routes (app/api/)
    → Novel Service (src/services/novel-service.ts)
    → Job Queue (src/jobs/queue.ts)

Scheduler Worker (scripts/worker.ts)
  → runSchedulerTick() → enqueue
  → processOneJob() → NovelistAgentRuntime
    → Pipeline → LLM / Store / Prompts

CLI (src/cli.ts) ──→ NovelistAgentRuntime（与 Web 共用核心）
```

### 双线叙事流水线（推荐）

1. **buildUniverse**：World Bible（含配角档案）→ 世界线事件 → 配角隐线种子 → 主人公线行动
2. **discoverCollisions**：扫描双线交叉，生成碰撞候选（按明线强度排序，过滤高隐线暴露风险）
3. **planEpisode**：选中碰撞 → 章节事件包 `episodes/NNNN.json`（sceneBeats 分 hero/shadow-hint + shadowHints）
4. **writeEpisode**（默认双阶段）：
   - 阶段一 **明线草稿**：只写主人公线 POV
   - 阶段二 **隐线织入**：将 shadowHints 嵌入草稿
   - **泄露修复循环**：程序检测禁词 → 局部重写（默认最多 2 次）
   - 双线审稿 → 双状态更新（heroGains POV 闸门）
   - 选项：`twoStage: false` 回退单阶段；`maxLeakRetries` 控制修复次数

**三线叙事原则**：
- 世界线 = 势力级隐线（幕后大势）
- 配角隐线 = 人物级隐线（配角独立目标，主角通常不知）
- 主人公线 = 明线（读者跟随主角视野）

`hiddenCausality` 不得出现在正文；`knownWorldFacts` 只能来自 `heroGains`；配角秘密经 `protagonistAwareness: rumor|partial` 才可渗入主角 tick，不得直灌确证事实。

### MVP2 可编辑时间轴

- `PATCH /api/novels/:id/timeline`：编辑世界/配角/主角事件、势力与配角目标、锁定事件、同日内排序
- 同日内 `sortOrder`：`moveWorldEvent` / `moveSupportEvent` / `moveHeroEvent`（`day` + 可选 `beforeEventId`）
- 配角操作：`updateSupportEvent`、`addSupportEvent`、`updateSupportCharacterGoals`
- `PATCH /api/novels/:id/collisions`：标记必须发生、拒绝候选
- 锁定事件：AI 状态更新跳过，作者仍可手动编辑
- 重新发现碰撞时保留 `required` / 已接受 / 已使用的碰撞
- 写章后事件包保存 `writingDrafts`（明线草稿、织入稿）

```bash
npm run timeline-edit-test
```

### MVP3 世界模拟 Tick

- `tickUniverse`：世界线 → 配角隐线 → 主人公线，可选刷新碰撞池
- 配角数据：`data/novels/:id/support-timeline.json`；Bible 字段 `supportCharacters[]`
- Job：`universe-tick`（payload：`tickDays`、`autoDiscoverCollisions`、`maxCollisions`）
- 记录：`data/novels/:id/universe-sim.json`（上次 tick 统计、累计次数）
- API：`POST /api/novels/:id/tick` 手动入队
- 调度：`Schedule.mode = narrative` 时 cron 命中入队 `universe-tick`（`tickDays` 默认 1）
- 尊重 `locked` 事件；碰撞合并保留 `required` / 已接受项

```bash
npm run universe-tick-test
npm run support-tick-test
```

### MVP4 叙事周期（tick → plan → write）

**周期链（默认）** — 一键产出 / `narrative-auto` 调度使用：

1. `universe-tick`
2. `cycle-pick-collision`
3. `plan-episode`
4. `write-episode`

各 job 通过 `payload.cycleRunId` 关联；进行中的链写入 `cycle-run.json`；终态（成功/用尽重试）归档至 `cycle-run-history.json`（最多 50 条）并清除当前文件；失败仅重试当前阶段（最多 3 次）。

**单 job 模式（dry-run）** — `runNarrativeCycle` / `narrative-cycle` job 仍保留用于脚本回归。
- 失败时写入 `narrative-cycle.json`：`lastStatus`、`failedStage`、`resume`（断点续跑）
- 自动重试：worker 失败后最多再入队 2 次（共 3 次 attempt），续跑时跳过已完成阶段
- **指数退避**：重试 job 带 `runAt`；默认 `30s × 2^(attempt-2)`，上限 15 分钟，含随机抖动；`claimNextPendingJob` 跳过未到期的 pending
- 手动重试：`POST /api/jobs/:jobId/retry` 同样写入 `runAt`（非立即执行）
- 记录：`narrative-cycle.json`
- API：`POST /api/novels/:id/cycle` 一键入队
- 调度：`Schedule.mode = narrative-auto` 时 cron 命中执行完整周期

```bash
npm run narrative-cycle-test
npm run narrative-cycle-retry-test
npm run retry-backoff-test
npm run cycle-run-archive-test
```

### 时间轴可视化

- 工作台 **时间轴** Tab：双轨泳道（世界线隐线 / 主人公线明线）
- 横轴按故事内天数展开；「今」标记 `currentDay`；有碰撞候选的日期显示「碰」
- 拖拽事件卡片到其他日期列 → `moveWorldEvent` / `moveHeroEvent` 改天或同日内排序
- 拖到某日另一张卡片上 → 插入到该卡片之前（`beforeEventId`）
- 锁定事件不可拖；同日内按 `sortOrder` 展示
- 世界事件按 `visibility` 区分样式：secret 虚线 / rumor 黄 / public 绿
- 碰撞池为空时概览 Tab 显示告警，并禁用「一键产出章节」

### 经典章节流水线（write-chapter，保留）

1. 加载 `novel.json`、`state.json`、`outline.json`
2. 构造 chapter-write Prompt
3. LLM 生成正文 → 审稿 → 记忆更新

### 任务队列

| Job 类型 | 说明 |
|----------|------|
| `plan-outline` | 生成大纲 |
| `write-next-chapter` | 写 `lastChapterNumber + 1` |
| `write-chapter` | 写指定章 |
| `review-chapter` | 单独审稿 |
| `build-universe` | 生成叙事宇宙 |
| `discover-collisions` | 发现碰撞候选 |
| `plan-episode` / `write-episode` | 事件包与写章 |
| `universe-tick` | 推进世界模拟 N 天 |
| `narrative-cycle` | tick + 选碰撞 + 写章 |

- 单 worker 串行；同一 `novelId` 同时只允许一个 `running` 任务（互斥锁）
- API 仅入队，不阻塞等待 LLM

## 3. 目录结构

```
xiaoshuojia/
├── app/                       # Next.js 页面与 API
│   ├── page.tsx               # 作品列表
│   ├── novels/                # 新建 / 详情 / 章节阅读
│   ├── jobs/page.tsx          # 任务队列
│   └── api/                   # REST 入队与读取
├── components/                # 客户端操作组件
├── lib/api.ts                 # API 响应辅助
├── scripts/worker.ts          # worker 入口
├── src/
│   ├── cli.ts
│   ├── config.ts              # getDataRoot / bootstrapEnv
│   ├── agent/runtime.ts
│   ├── services/novel-service.ts
│   ├── jobs/{queue,worker,scheduler,types}.ts
│   ├── lib/atomic-fs.ts
│   ├── llm/client.ts
│   ├── novel/{types,store,pipeline}.ts
│   └── prompts/
├── data/
│   ├── novels/<id>/
│   └── jobs/
├── docs/
├── tsconfig.json              # Next / 全项目类型检查
├── tsconfig.src.json          # CLI 编译（rootDir: src）
└── package.json
```

## 4. 环境搭建

```bash
cd /Users/xinyu.wang06/codelib/agents/xiaoshuojia
npm install
cp .env.example .env   # 填写 LLM_API_KEY（dry-run 可跳过）
```

### 常用命令

```bash
npm run typecheck       # src + Next 类型检查
npm run dry-run         # CLI 离线流水线
npm run worker:dry-run  # worker 离线执行一条写下一章
npm run dev:web         # http://localhost:3000
npm run dev:worker      # 任务轮询 + 调度
npm run dev:all         # Web + worker 并行
npm run build:web       # Next 生产构建
npm run build           # 编译 CLI 到 dist/
```

### Web 使用流程

1. `npm run dev:all`
2. 打开首页，查看 `test-xiaoshuo`（dry-run 生成）或新建作品
3. 在详情页点击「生成大纲」「写下一章」→ 任务入队
4. worker 进程执行后刷新页面查看章节
5. 配置 cron（如 `0 9 * * *`）并启用定时 → worker 每分钟扫描入队

## 5. 配置说明

`.env` 字段见 `.env.example`。

| 变量 | 说明 |
|------|------|
| `LLM_API_KEY` | API 密钥（dry-run 不需要） |
| `LLM_BASE_URL` | 兼容 OpenAI 的网关 |
| `LLM_MODEL` | 模型名 |
| `DATA_ROOT` | 可选，数据根目录（默认 `./data`） |

## 6. 恢复研发检查清单

中断后回来，按此顺序：

1. `git status` / 读 [ITERATION_LOG.md](./ITERATION_LOG.md) 最新一条
2. `npm install`
3. `npm run typecheck`
4. `npm run dry-run` && `npm run worker:dry-run`
5. `npm run dev:all`，浏览器验证列表与详情页
6. 配置 `.env` 后真实写一章

测试作品：`test-xiaoshuo` → `data/novels/test-xiaoshuo/`

## 7. 已知问题与注意事项

- **worker 必须独立运行**：Next API 不能长时间阻塞等 LLM
- **serverless 部署**：本地 JSON 存储不适合无状态部署，需持久卷或数据库
- **无鉴权**：仅适合本地开发；暴露公网需加访问控制
- **cron 匹配**：`scheduler.ts` 为简化实现，复杂 cron 表达式可能需增强
- **ESM `.js` 扩展名**：`src/` 内 import 带 `.js`；Next 通过 `extensionAlias` 解析

## 8. 相关文档

- [architecture.md](./architecture.md) — Agent 原理、记忆、Pipeline
- [ITERATION_LOG.md](./ITERATION_LOG.md) — 迭代记录
- [../README.md](../README.md) — 快速上手
