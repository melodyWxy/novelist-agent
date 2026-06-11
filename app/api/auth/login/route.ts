import { cookies } from 'next/headers';
import { jsonError, jsonOk } from '@/lib/api';
import {
  AUTH_COOKIE_NAME,
  createSessionToken,
  getAdminCredentials,
} from '@core/auth/session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { username?: string; password?: string };
    const admin = getAdminCredentials();
    if (body.username !== admin.username || body.password !== admin.password) {
      return jsonError('账号或密码错误', 401);
    }

    const token = createSessionToken(admin.username);
    const cookieStore = await cookies();
    cookieStore.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }
}
