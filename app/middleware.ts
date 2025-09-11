// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const hasSession = !!req.cookies.get('od_session')?.value;
  const hasBase    = !!req.cookies.get('od_base')?.value;
  const hasDb      = !!req.cookies.get('od_db')?.value;
  const authed     = hasSession && hasBase && hasDb;

  if (pathname === '/') {
    if (authed) {
      const url = req.nextUrl.clone();
      url.pathname = '/scan';
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith('/scan')) {
    if (!authed) {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/scan'],
};
