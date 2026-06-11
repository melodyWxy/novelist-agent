/**
 * 本地文件存储（Novel Project Store）
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { getNovelsRoot } from '../config.js';
import { ensureDir, writeJsonAtomic, readJsonFile } from '../lib/atomic-fs.js';
import {
  NovelMeta,
  NovelMetaSchema,
  Outline,
  OutlineSchema,
  StoryState,
  StoryStateSchema,
  ReviewResult,
  ReviewResultSchema,
  InitNovelInput,
} from './types.js';

export function getNovelDir(novelId: string): string {
  return path.join(getNovelsRoot(), novelId);
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

export async function novelExists(novelId: string): Promise<boolean> {
  try {
    await fs.access(path.join(getNovelDir(novelId), 'novel.json'));
    return true;
  } catch {
    return false;
  }
}

export async function initNovel(input: InitNovelInput): Promise<NovelMeta> {
  const novelDir = getNovelDir(input.id);
  if (await novelExists(input.id)) {
    throw new Error(`作品 "${input.id}" 已存在，请换用其他 ID`);
  }

  const now = new Date().toISOString();
  const meta: NovelMeta = {
    id: input.id,
    title: input.title,
    genre: input.genre,
    protagonist: input.protagonist,
    style: input.style,
    worldSetting: input.worldSetting,
    targetWordCount: input.targetWordCount,
    createdAt: now,
    updatedAt: now,
  };

  NovelMetaSchema.parse(meta);

  await ensureDir(path.join(novelDir, 'chapters'));
  await ensureDir(path.join(novelDir, 'reviews'));
  await ensureDir(path.join(novelDir, 'episodes'));

  const initialState: StoryState = {
    timeline: '故事尚未开始',
    lastChapterNumber: 0,
    characters: [
      {
        name: input.protagonist,
        role: '主角',
        traits: [],
        currentStatus: '初始状态，待第一章展开',
        relationships: {},
      },
    ],
    foreshadowing: [],
    openThreads: [],
    updatedAt: now,
  };

  await writeJsonAtomic(path.join(novelDir, 'novel.json'), meta);
  await writeJsonAtomic(path.join(novelDir, 'state.json'), initialState);

  return meta;
}

export async function loadNovelMeta(novelId: string): Promise<NovelMeta> {
  const data = await readJson<unknown>(path.join(getNovelDir(novelId), 'novel.json'));
  return NovelMetaSchema.parse(data);
}

export async function loadStoryState(novelId: string): Promise<StoryState> {
  const data = await readJson<unknown>(path.join(getNovelDir(novelId), 'state.json'));
  return StoryStateSchema.parse(data);
}

export async function saveStoryState(novelId: string, state: StoryState): Promise<void> {
  const parsed = StoryStateSchema.parse(state);
  await writeJsonAtomic(path.join(getNovelDir(novelId), 'state.json'), parsed);
}

export async function saveOutline(novelId: string, outline: Outline): Promise<void> {
  const parsed = OutlineSchema.parse(outline);
  await writeJsonAtomic(path.join(getNovelDir(novelId), 'outline.json'), parsed);
}

export async function loadOutline(novelId: string): Promise<Outline | null> {
  const filePath = path.join(getNovelDir(novelId), 'outline.json');
  try {
    const data = await readJson<unknown>(filePath);
    return OutlineSchema.parse(data);
  } catch {
    return null;
  }
}

export function chapterFilePath(novelId: string, chapterNumber: number): string {
  const padded = String(chapterNumber).padStart(4, '0');
  return path.join(getNovelDir(novelId), 'chapters', `${padded}.md`);
}

export async function saveChapter(
  novelId: string,
  chapterNumber: number,
  title: string,
  content: string
): Promise<void> {
  const filePath = chapterFilePath(novelId, chapterNumber);
  await ensureDir(path.dirname(filePath));
  const header = `# 第${chapterNumber}章 ${title}\n\n`;
  await fs.writeFile(filePath, header + content.trim() + '\n', 'utf-8');
}

export async function loadChapter(novelId: string, chapterNumber: number): Promise<string | null> {
  const filePath = chapterFilePath(novelId, chapterNumber);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const lines = raw.split('\n');
    const bodyStart = lines.findIndex((line, i) => i > 0 && line.trim() !== '');
    return lines.slice(bodyStart >= 0 ? bodyStart : 1).join('\n').trim();
  } catch {
    return null;
  }
}

export async function listChapterNumbers(novelId: string): Promise<number[]> {
  const dir = path.join(getNovelDir(novelId), 'chapters');
  try {
    const files = await fs.readdir(dir);
    return files
      .filter((f) => f.endsWith('.md'))
      .map((f) => parseInt(f.replace('.md', ''), 10))
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

export async function saveReview(novelId: string, review: ReviewResult): Promise<void> {
  const parsed = ReviewResultSchema.parse(review);
  const padded = String(review.chapterNumber).padStart(4, '0');
  await writeJsonAtomic(path.join(getNovelDir(novelId), 'reviews', `${padded}.json`), parsed);
}

export async function loadReview(novelId: string, chapterNumber: number): Promise<ReviewResult | null> {
  const padded = String(chapterNumber).padStart(4, '0');
  const filePath = path.join(getNovelDir(novelId), 'reviews', `${padded}.json`);
  try {
    const data = await readJson<unknown>(filePath);
    return ReviewResultSchema.parse(data);
  } catch {
    return null;
  }
}

export async function listReviews(novelId: string): Promise<ReviewResult[]> {
  const dir = path.join(getNovelDir(novelId), 'reviews');
  try {
    const files = await fs.readdir(dir);
    const reviews: ReviewResult[] = [];
    for (const f of files.filter((name) => name.endsWith('.json')).sort()) {
      const data = await readJson<unknown>(path.join(dir, f));
      if (data) reviews.push(ReviewResultSchema.parse(data));
    }
    return reviews.sort((a, b) => a.chapterNumber - b.chapterNumber);
  } catch {
    return [];
  }
}

export async function listNovels(): Promise<string[]> {
  const root = getNovelsRoot();
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const ids: string[] = [];
    for (const e of entries) {
      if (e.isDirectory() && (await novelExists(e.name))) {
        ids.push(e.name);
      }
    }
    return ids;
  } catch {
    return [];
  }
}
