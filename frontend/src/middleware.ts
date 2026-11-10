import { NextRequest, NextResponse } from 'next/server';

const PROTECTED_PREFIXES = ['/patient', '/doctor', '/admin', '/reception'];

/**
 * Presence-only guard for dashboard routes. Role enforcement happens in the
 * backend on every API call; this just gives users a fast redirect to login.
 * The backend httpOnly cookies are set on the shared host, so they are visible here.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (!needsAuth) return NextResponse.next();

  const hasSession = request.cookies.has('mb_access') || request.cookies.has('mb_refresh');
  if (hasSession) return NextResponse.next();

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/patient/:path*', '/doctor/:path*', '/admin/:path*', '/reception/:path*'],
};
