'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

export function NovelImportForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  async function importNovel() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      alert('请先选择本地导出的作品包');
      return;
    }

    setImporting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/novels/import', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '导入失败');

      alert(`导入成功：${data.novelId}`);
      if (fileRef.current) fileRef.current.value = '';
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="actions" style={{ marginTop: '1rem' }}>
      <input ref={fileRef} type="file" accept=".json,application/json" />
      <button className="btn btn-secondary" disabled={importing} onClick={importNovel}>
        {importing ? '导入中...' : '导入作品包'}
      </button>
    </div>
  );
}
