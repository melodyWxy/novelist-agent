'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        const fd = new FormData(e.currentTarget);
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: String(fd.get('username') ?? ''),
            password: String(fd.get('password') ?? ''),
          }),
        });
        const data = await res.json();
        setLoading(false);
        if (!res.ok) {
          setError(data.error ?? '登录失败');
          return;
        }
        router.replace('/');
        router.refresh();
      }}
    >
      <label>账号</label>
      <input name="username" autoComplete="username" defaultValue="admin" required />
      <label>密码</label>
      <input name="password" type="password" autoComplete="current-password" required />
      {error && <p className="alert alert-danger">{error}</p>}
      <button className="btn" type="submit" disabled={loading}>
        {loading ? '登录中...' : '登录'}
      </button>
    </form>
  );
}
