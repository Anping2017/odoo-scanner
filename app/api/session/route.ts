// app/api/session/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { rpc } from '../_odoo';

function getCookie(req: NextRequest, name: string) {
  const cookie = req.headers.get('cookie') || '';
  const m = cookie.match(new RegExp(`${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : '';
}

const ALLOWED = (process.env.ODOO_ALLOWED_BASES || '')
  .split(',').map(s => s.trim()).filter(Boolean);

function isAllowedBase(u: string) {
  try {
    const url = new URL(u);
    return /^https?:$/.test(url.protocol) && ALLOWED.includes(`${url.protocol}//${url.host}`);
  } catch { return false; }
}

export async function GET(req: NextRequest) {
  try {
    const sessionId = getCookie(req, 'od_session');
    const base = getCookie(req, 'od_base');
    if (!sessionId || !base || !isAllowedBase(base)) {
      return NextResponse.json({ authenticated: false });
    }
    // 调 Odoo 获取会话信息
    const info = await rpc('/web/session/get_session_info', {}, sessionId, base);
    const uid = info?.uid ?? info?.user_context?.uid ?? null;
    if (uid) {
      return NextResponse.json({ authenticated: true, uid });
    }
    return NextResponse.json({ authenticated: false });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
