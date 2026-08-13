import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('cashflow_token');
  const { pathname } = request.nextUrl;

  // Paths that do not require authentication
  const isPublicPath = pathname === '/login' || pathname === '/register';

  if (!token && !isPublicPath) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If user is authenticated and trying to access login/register, redirect to dashboard
  if (token && isPublicPath) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Match all paths except:
   * 1. /api routes
   * 2. /_next (Next.js internals)
   * 3. Static files (e.g. /favicon.ico, /images, /manifest.webmanifest, etc.)
   */
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest).*)']
};
