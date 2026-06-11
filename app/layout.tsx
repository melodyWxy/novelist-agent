import type { Metadata } from 'next';
import Link from 'next/link';
import { HelpButton } from '@/components/HelpButton';
import { LogoutButton } from '@/components/LogoutButton';
import './globals.css';

export const metadata: Metadata = {
  title: '小说家 · 叙事宇宙',
  description: '双线叙事引擎 — 世界线×主人公线碰撞生成章节',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <header>
          <h1>
            <Link href="/">叙事宇宙工作台</Link>
          </h1>
          <nav className="actions">
            <Link href="/" className="btn btn-secondary">
              作品列表
            </Link>
            <Link href="/novels/new" className="btn btn-secondary">
              新建作品
            </Link>
            <Link href="/jobs" className="btn btn-secondary">
              任务队列
            </Link>
            <HelpButton />
            <LogoutButton />
          </nav>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
