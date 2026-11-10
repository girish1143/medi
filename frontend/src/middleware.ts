import { NextResponse, type NextRequest } from 'next/server';

const ACCESS_COOKIE_NAME = 'hlp_access_token';
const REFRESH_COOKIE_NAME = 'hlp_refresh_token';

/**
 * Lightweight edge gate checking cookie presence before protected SSR routes execute.
 * All authoritative JWT verification, session revocation, RBAC, and ABAC enforcement
 * runs in Express backend and Server Component checks (`getServerActor` / `requireAdminPageAccess`).
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasToken = Boolean(
    req.cookies.get(ACCESS_COOKIE_NAME)?.value || req.cookies.get(REFRESH_COOKIE_NAME)?.value,
  );

  if (!hasToken) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/patient/:path*', '/doctor/:path*', '/hospital/:path*'],
};
