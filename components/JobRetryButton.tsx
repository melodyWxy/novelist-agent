'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function JobRetryButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onRetry() {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/retry`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '重试失败');
      router.refresh();
      alert('已入队重试任务');
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className="btn btn-secondary"
      style={{ fontSize: '0.75rem' }}
      disabled={loading}
      onClick={onRetry}
    >
      {loading ? '…' : '重试'}
    </button>
  );
}
