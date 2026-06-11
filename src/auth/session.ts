import { createHmac, timingSafeEqual } from 'node:crypto';

export const AUTH_COOKIE_NAME = 'xiaoshuojia_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.LLM_API_KEY ||
    'xiaoshuojia-dev-session-secret'
  );
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function sign(payload: string): string {
  return base64Url(createHmac('sha256', getSecret()).update(payload).digest());
}

export function getAdminCredentials(): { username: string; password: string } {
  return {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123',
  };
}

export function createSessionToken(username: string, now = Date.now()): string {
  const payload = base64Url(JSON.stringify({ username, exp: now + SESSION_TTL_MS }));
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token?: string | null): boolean {
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return false;

  try {
    const json = Buffer.from(payload.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString(
      'utf-8'
    );
    const parsed = JSON.parse(json) as { exp?: number };
    return typeof parsed.exp === 'number' && parsed.exp > Date.now();
  } catch {
    return false;
  }
}
