import { cookies } from 'next/headers';
import { jsonOk } from '@/lib/api';
import { AUTH_COOKIE_NAME } from '@core/auth/session';

export const runtime = 'nodejs';

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
  return jsonOk({ ok: true });
}
