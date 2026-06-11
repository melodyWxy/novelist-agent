#!/usr/bin/env node
/**
 * 小说家 Agent CLI 入口
 *
 * 使用 Commander 解析子命令，将用户意图路由到 NovelistAgentRuntime。
 * `--dry-run` 全局选项：不调用真实 LLM，用于离线验证完整流水线。
 */
import { Command } from 'commander';
import { bootstrapEnvSync } from './config.js';
import { NovelistAgentRuntime } from './agent/runtime.js';

bootstrapEnvSync();

const program = new Command();

program
  .name('xiaoshuojia')
  .description('小说家 Agent - AI 自动化长篇小说的章节产出')
  .version('0.2.0')
  .option('--dry-run', '离线模式，使用模拟 LLM 响应', false)
  .option('--quiet', '减少 Agent 步骤日志', false);

function createRuntime(cmd: Command): NovelistAgentRuntime {
  const root = cmd.parent ?? cmd;
  const opts = root.opts();
  return new NovelistAgentRuntime({ dryRun: Boolean(opts.dryRun), verbose: !opts.quiet });
}

program
  .command('init-novel')
  .description('创建新作品工程')
  .requiredOption('--id <id>', '作品 ID（英文/拼音，用作目录名）')
  .requiredOption('--title <title>', '书名')
  .requiredOption('--genre <genre>', '题材')
  .requiredOption('--protagonist <name>', '主角名')
  .requiredOption('--style <style>', '文风')
  .option('--world <text>', '世界观设定')
  .option('--words <number>', '目标总字数', (v) => parseInt(v, 10))
  .action(async (opts, cmd) => {
    const runtime = createRuntime(cmd);

    const meta = await runtime.initNovel({
      id: opts.id,
      title: opts.title,
      genre: opts.genre,
      protagonist: opts.protagonist,
      style: opts.style,
      worldSetting: opts.world,
      targetWordCount: opts.words,
    });

    console.log('✅ 作品创建成功');
    console.log(`   ID: ${meta.id}`);
    console.log(`   书名: ${meta.title}`);
    console.log(`   目录: data/novels/${meta.id}/`);
    console.log(`\n下一步: npm run dev -- plan-outline --novel ${meta.id}`);
  });

program
  .command('plan-outline')
  .description('根据作品设定生成章节大纲')
  .requiredOption('--novel <id>', '作品 ID')
  .option('--chapters <n>', '生成章节数', (v) => parseInt(v, 10), 10)
  .action(async (opts, cmd) => {
    const runtime = createRuntime(cmd);

    console.log(`📋 正在为「${opts.novel}」生成 ${opts.chapters} 章大纲...`);
    const outline = await runtime.planOutline(opts.novel, opts.chapters);

    console.log('✅ 大纲生成完成');
    console.log(`   前提: ${outline.premise}`);
    console.log(`   章节数: ${outline.chapters.length}`);
    outline.chapters.slice(0, 5).forEach((ch) => {
      console.log(`   - 第${ch.chapterNumber}章 ${ch.title}: ${ch.summary.slice(0, 40)}...`);
    });
    if (outline.chapters.length > 5) {
      console.log(`   ... 共 ${outline.chapters.length} 章`);
    }
    console.log(`\n下一步: npm run dev -- write-chapter --novel ${opts.novel} --chapter 1`);
  });

program
  .command('write-chapter')
  .description('生成指定章节（含审稿与记忆更新）')
  .requiredOption('--novel <id>', '作品 ID')
  .requiredOption('--chapter <n>', '章节号', (v) => parseInt(v, 10))
  .option('--words <n>', '目标字数', (v) => parseInt(v, 10))
  .option('--skip-review', '跳过审稿步骤')
  .option('--skip-memory', '跳过记忆更新')
  .action(async (opts, cmd) => {
    const runtime = createRuntime(cmd);

    console.log(`✍️  正在撰写第 ${opts.chapter} 章...`);
    const result = await runtime.writeChapter(opts.novel, opts.chapter, {
      targetWords: opts.words,
      skipReview: opts.skipReview,
      skipMemoryUpdate: opts.skipMemory,
    });

    console.log('✅ 章节写作完成');
    console.log(`   标题: 第${opts.chapter}章 ${result.title}`);
    console.log(`   字数: ${result.wordCount}`);
    console.log(
      `   路径: data/novels/${opts.novel}/chapters/${String(opts.chapter).padStart(4, '0')}.md`
    );

    if (result.review) {
      const icon = result.review.passed ? '✅' : '⚠️';
      console.log(`\n${icon} 审稿: ${result.review.summary} (score: ${result.review.score ?? 'N/A'})`);
      result.review.issues.forEach((issue) => {
        console.log(`   [${issue.severity}] ${issue.category}: ${issue.description}`);
      });
    }

    if (result.state) {
      console.log(`\n📝 记忆已更新: ${result.state.timeline}`);
    }
  });

program
  .command('review-chapter')
  .description('对已有章节进行审稿')
  .requiredOption('--novel <id>', '作品 ID')
  .requiredOption('--chapter <n>', '章节号', (v) => parseInt(v, 10))
  .action(async (opts, cmd) => {
    const runtime = createRuntime(cmd);

    console.log(`🔍 正在审稿第 ${opts.chapter} 章...`);
    const review = await runtime.reviewChapter(opts.novel, opts.chapter);

    const icon = review.passed ? '✅' : '⚠️';
    console.log(`${icon} 审稿完成`);
    console.log(`   通过: ${review.passed}`);
    console.log(`   评分: ${review.score ?? 'N/A'}`);
    console.log(`   总结: ${review.summary}`);
    review.issues.forEach((issue) => {
      console.log(`   [${issue.severity}] ${issue.category}: ${issue.description}`);
      if (issue.suggestion) {
        console.log(`      建议: ${issue.suggestion}`);
      }
    });
  });

program
  .command('list')
  .description('列出所有作品')
  .action(async (_opts, cmd) => {
    const runtime = createRuntime(cmd);
    const novels = await runtime.listNovels();

    if (novels.length === 0) {
      console.log('暂无作品。使用 init-novel 创建第一部作品。');
      return;
    }

    console.log('📚 作品列表:');
    for (const id of novels) {
      const summary = await runtime.getNovelSummary(id);
      console.log(`   - ${id}: ${summary.meta.title}（${summary.meta.genre}）`);
      console.log(
        `     已规划 ${summary.chapterCount} 章，写到第 ${summary.state.lastChapterNumber} 章`
      );
    }
  });

program
  .command('show')
  .description('查看作品详情')
  .requiredOption('--novel <id>', '作品 ID')
  .action(async (opts, cmd) => {
    const runtime = createRuntime(cmd);
    const { meta, state, outline } = await runtime.getNovelSummary(opts.novel);

    console.log(`📖 ${meta.title}`);
    console.log(`   题材: ${meta.genre} | 文风: ${meta.style}`);
    console.log(`   主角: ${meta.protagonist}`);
    if (meta.worldSetting) console.log(`   世界观: ${meta.worldSetting}`);
    console.log(`   时间线: ${state.timeline}`);
    console.log(`   已写: 第 ${state.lastChapterNumber} 章`);
    if (outline) {
      console.log(`   大纲: ${outline.premise}`);
      console.log(`   规划章节: ${outline.chapters.length}`);
    }
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`执行失败：${message}`);
  process.exitCode = 1;
});
