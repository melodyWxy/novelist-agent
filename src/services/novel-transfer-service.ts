import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { ensureDir } from '../lib/atomic-fs.js';
import { getNovelDir, novelExists } from '../novel/store.js';
import { NovelMetaSchema } from '../novel/types.js';

const PACKAGE_VERSION = 1;

const NovelPackageFileSchema = z.object({
  path: z.string().min(1),
  encoding: z.literal('base64'),
  content: z.string(),
});

const NovelPackageSchema = z.object({
  type: z.literal('xiaoshuojia.novel-package'),
  version: z.literal(PACKAGE_VERSION),
  novelId: z.string().min(1),
  exportedAt: z.string().datetime(),
  files: z.array(NovelPackageFileSchema).min(1),
});

export type NovelPackage = z.infer<typeof NovelPackageSchema>;

function assertSafeNovelId(novelId: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(novelId)) {
    throw new Error('作品 ID 只能包含字母、数字、下划线和连字符');
  }
}

function assertSafeRelativePath(relativePath: string): void {
  if (
    relativePath.startsWith('/') ||
    relativePath.includes('\\') ||
    relativePath.split('/').some((part) => part === '..' || part === '')
  ) {
    throw new Error(`作品包包含非法路径：${relativePath}`);
  }
}

async function collectFiles(rootDir: string, currentDir = rootDir): Promise<NovelPackage['files']> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const files: NovelPackage['files'] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(rootDir, fullPath)));
      continue;
    }
    if (!entry.isFile()) continue;

    const relativePath = path.relative(rootDir, fullPath).split(path.sep).join('/');
    assertSafeRelativePath(relativePath);
    const content = await fs.readFile(fullPath);
    files.push({
      path: relativePath,
      encoding: 'base64',
      content: content.toString('base64'),
    });
  }

  return files;
}

export async function exportNovelPackage(novelId: string): Promise<NovelPackage> {
  assertSafeNovelId(novelId);
  if (!(await novelExists(novelId))) {
    throw new Error(`作品 "${novelId}" 不存在`);
  }

  const novelDir = getNovelDir(novelId);
  const files = await collectFiles(novelDir);
  const novelJson = files.find((file) => file.path === 'novel.json');
  if (!novelJson) throw new Error(`作品 "${novelId}" 缺少 novel.json`);

  const meta = NovelMetaSchema.parse(
    JSON.parse(Buffer.from(novelJson.content, 'base64').toString('utf-8'))
  );
  if (meta.id !== novelId) {
    throw new Error(`作品目录 ID 与 novel.json 不一致：${novelId} / ${meta.id}`);
  }

  return NovelPackageSchema.parse({
    type: 'xiaoshuojia.novel-package',
    version: PACKAGE_VERSION,
    novelId,
    exportedAt: new Date().toISOString(),
    files,
  });
}

export async function importNovelPackage(input: unknown): Promise<{ novelId: string; fileCount: number }> {
  const pkg = NovelPackageSchema.parse(input);
  assertSafeNovelId(pkg.novelId);

  for (const file of pkg.files) {
    assertSafeRelativePath(file.path);
  }

  const novelJson = pkg.files.find((file) => file.path === 'novel.json');
  if (!novelJson) throw new Error('作品包缺少 novel.json');

  const meta = NovelMetaSchema.parse(
    JSON.parse(Buffer.from(novelJson.content, 'base64').toString('utf-8'))
  );
  if (meta.id !== pkg.novelId) {
    throw new Error(`作品包 ID 与 novel.json 不一致：${pkg.novelId} / ${meta.id}`);
  }
  if (await novelExists(pkg.novelId)) {
    throw new Error(`作品 "${pkg.novelId}" 已存在；为避免覆盖，请先改 ID 或删除远端同名作品`);
  }

  const novelDir = getNovelDir(pkg.novelId);
  await ensureDir(novelDir);
  for (const file of pkg.files) {
    const targetPath = path.join(novelDir, file.path);
    const resolvedTarget = path.resolve(targetPath);
    const resolvedRoot = path.resolve(novelDir);
    if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`) && resolvedTarget !== resolvedRoot) {
      throw new Error(`作品包包含越界路径：${file.path}`);
    }
    await ensureDir(path.dirname(targetPath));
    await fs.writeFile(targetPath, Buffer.from(file.content, 'base64'));
  }

  return { novelId: pkg.novelId, fileCount: pkg.files.length };
}
