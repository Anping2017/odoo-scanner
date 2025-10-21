// /app/api/check-login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCookie } from '@/app/api/_odoo';

export const dynamic = 'force-dynamic';

// 检查登录状态
export async function GET(req: NextRequest) {
  try {
    const cookie = req.headers.get('cookie') || '';
    const od_base = getCookie(req, 'od_base');
    const od_db = getCookie(req, 'od_db');
    const od_session = getCookie(req, 'od_session');

    const loginStatus = {
      hasCookie: !!cookie,
      od_base: od_base || 'missing',
      od_db: od_db || 'missing',
      od_session: od_session ? 'present' : 'missing',
      cookieString: cookie
    };

    console.log('Login check:', loginStatus);

    if (!od_base || !od_db || !od_session) {
      return NextResponse.json({ 
        loggedIn: false,
        message: 'Not logged in - missing authentication cookies',
        details: loginStatus,
        suggestion: 'Please login at /login page first'
      }, { status: 401 });
    }

    return NextResponse.json({ 
      loggedIn: true,
      message: 'Successfully logged in',
      details: loginStatus
    });

  } catch (e: any) {
    console.error('Login check failed:', e);
    return NextResponse.json({ 
      loggedIn: false,
      error: e?.message || 'Login check failed',
      details: {
        message: e?.message,
        stack: e?.stack
      }
    }, { status: 500 });
  }
}
