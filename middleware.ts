import { NextResponse, type NextRequest } from 'next/server';

const COOKIE_NAME = 'xiaoshuojia_session';

function base64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64Url(signature);
}

function decodePayload(payload: string): { exp?: number } | null {
  try {
    const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const json = atob(padded.replaceAll('-', '+').replaceAll('_', '/'));
    return JSON.parse(json) as { exp?: number };
  } catch {
    return null;
  }
}

async function verify(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const secret =
    process.env.ADMIN_SESSION_SECRET ||
    process.env.LLM_API_KEY ||
    'xiaoshuojia-dev-session-secret';
  if ((await hmac(payload, secret)) !== signature) return false;
  const parsed = decodePayload(payload);
  return typeof parsed?.exp === 'number' && parsed.exp > Date.now();
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  if (await verify(request.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
