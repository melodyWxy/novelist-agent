# 小说家 Agent（xiaoshuojia）

AI 自动化长篇小说的章节产出 Agent。支持 **双线叙事引擎**：世界线模拟 + 主人公线推进 + 碰撞生成章节事件包 → 正文写作。同时保留经典「章节大纲」模式与 **CLI** / **Next.js 多小说工作台**。

第一版不接番茄小说网、阅文起点等发布平台；发布与评论回复将在 Phase 3 作为独立模块接入。

## 快速开始

```bash
npm install
cp .env.example .env   # 填写 LLM_API_KEY（dry-run 可跳过）

# 离线测试 CLI 流水线（不消耗 API）
npm run dry-run

# 离线测试 worker 队列（写下一章）
npm run worker:dry-run

# 离线测试双线叙事全流程（宇宙→碰撞→事件包→章节）
npm run narrative:dry-run
```

### Web 工作台

需要两个终端：

```bash
# 终端 1：Web UI + API
npm run dev:web

# 终端 2：任务 worker（执行队列与定时调度）
npm run dev:worker
```

或一键启动：

```bash
npm run dev:all
```

浏览器打开 [http://localhost:3020](http://localhost:3020) ，进入作品详情后使用 **叙事宇宙** Tab：生成宇宙 → 发现碰撞 → 生成事件包 → 写出章节。经典大纲模式在详情页底部折叠区保留。

### CLI（保留）

```bash
npm run dev -- init-novel \
  --id xuanhuan-001 \
  --title "凡尘仙途" \
  --genre 玄幻 \
  --protagonist 林凡 \
  --style 热血爽文 \
  --world "末法时代，宗门林立"

npm run dev -- plan-outline --novel xuanhuan-001 --chapters 10
npm run dev -- write-chapter --novel xuanhuan-001 --chapter 1
npm run dev -- list
npm run dev -- show --novel xuanhuan-001
```

全局选项：`--dry-run`（模拟 LLM）、`--quiet`（减少步骤日志）

## 命令一览

| 命令 | 说明 |
| --- | --- |
| `npm run dev:web` | 启动 Next.js 开发服务器 |
| `npm run dev:worker` | 启动任务 worker |
| `npm run dev:all` | 同时启动 Web + worker |
| `npm run start:web` | 启动生产 Web 服务 |
| `npm run start:worker` | 启动生产任务 worker |
| `npm run build:web` | 构建 Web 应用 |
| `npm run dry-run` | CLI 离线流水线 |
| `npm run worker:dry-run` | worker 离线执行一条写下一章任务 |
| `npm run typecheck` | TypeScript 检查（核心 + Next） |

## Docker 部署

项目提供一个镜像、两个进程：

- `web`：Next.js UI + API，默认监听 `3020`
- `worker`：消费任务队列、执行定时调度和 LLM 生成

两者共享同一个持久化卷 `/app/data`，保证作品、章节、队列、定时任务在容器重建后仍保留。

```bash
cp .env.example .env
# 填写 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL
# 远端部署请务必修改 ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_SESSION_SECRET

docker compose up -d --build
docker compose logs -f web worker
```

远端访问：

```text
http://<server-ip>:3020
```

常用运维命令：

```bash
docker compose ps
docker compose restart web worker
docker compose down
```

如果要把已有本地 `data/` 带到远端，可以先在远端启动一次创建卷，再导入数据，或把 `docker-compose.yml` 的卷改成绑定目录：

```yaml
volumes:
  - ./data:/app/data
```

生产环境至少需要开放 `3020` 端口，并确保 `.env` 中的 LLM 配置可用。Web 默认启用单超管登录保护；未配置时本地默认账号为 `admin/admin123`，远端务必改掉。定时自动产出依赖 `worker` 服务，不能只启动 `web`。

## 数据目录

```text
data/
├── novels/<novelId>/
│   ├── novel.json
│   ├── world-bible.json
│   ├── power-system.json      # 战力体系：阶位、突破、能力边界
│   ├── character-assets.json  # 角色属性、能力、物品、伤势
│   ├── world-timeline.json
│   ├── hero-timeline.json
│   ├── collisions.json
│   ├── episodes/0001.json
│   ├── outline.json          # 经典模式
│   ├── state.json
│   ├── chapters/0001.md
│   └── reviews/0001.json
└── jobs/
    ├── queue.json      # 任务队列
    └── schedules.json  # 定时配置
```

可通过环境变量 `DATA_ROOT` 覆盖数据根目录（默认 `./data`）。

## 项目结构

```text
app/                    # Next.js App Router（页面 + API）
components/             # 客户端交互组件
src/
├── cli.ts
├── config.ts
├── agent/runtime.ts
├── narrative/{types,store,pipeline}.ts
├── services/{novel-service,narrative-service}.ts
├── jobs/{queue,worker,scheduler,types}.ts
├── llm/client.ts
├── novel/{types,store,pipeline}.ts
└── prompts/
scripts/worker.ts       # 独立 worker 入口
```

## 文档（中断后优先阅读）

| 文档 | 用途 |
| --- | --- |
| [docs/ITERATION_LOG.md](docs/ITERATION_LOG.md) | 迭代记录：做了什么、下一步 |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 开发文档：技术方案、恢复清单 |
| [docs/architecture.md](docs/architecture.md) | 架构原理：Agent 链路、记忆机制 |

## 路线图

- **Phase 1（当前）**：双线叙事引擎 MVP + 多小说工作台 + 本地调度
- **Phase 2**：长篇一致性（向量检索、多轮修订）
- **Phase 3**：番茄/起点发布与评论
