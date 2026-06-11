'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const STYLE_PRESETS = [
  '明快细腻、有趣好读、爽点清楚',
  '热血爽文、节奏明快',
  '慢热群像、史诗感、人物驱动',
  '细腻沉浸、悬疑推进',
  '偏诙谐、轻松吐槽、节奏明快',
];

export default function NewNovelPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    id: '',
    title: '',
    genre: '玄幻',
    protagonist: '',
    style: '明快细腻、有趣好读、爽点清楚',
    worldSetting: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/novels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '创建失败');
      router.push(`/novels/${data.meta.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h2>新建作品</h2>
      <form onSubmit={handleSubmit}>
        <label>作品 ID（英文/拼音，目录名）</label>
        <input
          required
          value={form.id}
          onChange={(e) => setForm({ ...form, id: e.target.value })}
          placeholder="xuanhuan-001"
        />
        <label>书名</label>
        <input
          required
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <label>题材</label>
        <input
          required
          value={form.genre}
          onChange={(e) => setForm({ ...form, genre: e.target.value })}
        />
        <label>主角</label>
        <input
          required
          value={form.protagonist}
          onChange={(e) => setForm({ ...form, protagonist: e.target.value })}
        />
        <label>文风</label>
        <div className="preset-row" aria-label="文风快捷选项">
          {STYLE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`preset-chip${form.style === preset ? ' preset-chip-active' : ''}`}
              onClick={() => setForm({ ...form, style: preset })}
            >
              {preset}
            </button>
          ))}
        </div>
        <input
          required
          value={form.style}
          onChange={(e) => setForm({ ...form, style: e.target.value })}
        />
        <label>世界观（可选）</label>
        <textarea
          rows={3}
          value={form.worldSetting}
          onChange={(e) => setForm({ ...form, worldSetting: e.target.value })}
        />
        <button type="submit" className="btn" disabled={loading}>
          {loading ? '创建中...' : '创建'}
        </button>
      </form>
    </div>
  );
}
