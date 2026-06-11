import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, verifySessionToken } from '@core/auth/session';
import { LoginForm } from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const cookieStore = await cookies();
  if (verifySessionToken(cookieStore.get(AUTH_COOKIE_NAME)?.value)) {
    redirect('/');
  }

  return (
    <div className="login-page">
      <div className="card login-card">
        <p className="muted">远端部署保护</p>
        <h2>超管登录</h2>
        <p className="muted">使用 `.env` 中的 ADMIN_USERNAME / ADMIN_PASSWORD 登录。</p>
        <LoginForm />
      </div>
    </div>
  );
}
