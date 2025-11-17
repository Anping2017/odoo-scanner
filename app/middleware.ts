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

  if (pathname.startsWith('/scan') || pathname.startsWith('/device-inventory') || pathname.startsWith('/parts-inventory') || pathname.startsWith('/parts-inventory-history') || pathname.startsWith('/inventory-history') || pathname.startsWith('/products')) {
    if (!authed) {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  // 回收页面不需要认证，允许直接访问
  if (pathname.startsWith('/recycle')) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/scan', '/device-inventory', '/parts-inventory', '/parts-inventory-history', '/inventory-history', '/products', '/receiving/:path*', '/recycle'],
};
