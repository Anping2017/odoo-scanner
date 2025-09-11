// /app/api/auth/check/route.ts
import { cookies, headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { resolvePreset } from '@/lib/odooPresets';

// 强制动态渲染
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const ck = cookies();
    const host = headers().get('host') || undefined;
    const preset = resolvePreset(host);

    const base = ck.get('od_base')?.value || preset?.url;
    const session = ck.get('od_session')?.value;
    const companyId = Number(ck.get('od_company')?.value || 0) || undefined;
    const db = ck.get('od_db')?.value || preset?.db;
    const locationId = ck.get('od_location')?.value;

    // 检查cookie是否存在
    const cookieStatus = {
      od_session: !!session,
      od_base: !!base,
      od_db: !!db,
      od_company: !!companyId,
      od_location: !!locationId,
    };

    // 检查session是否有效
    let sessionValid = false;
    if (base && session) {
      try {
        const res = await fetch(`${base}/web/session/get_session_info`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: `session_id=${session}` },
          body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'call', params: {} }),
        });
        const data = await res.json().catch(() => ({}));
        sessionValid = !!data?.result?.uid;
      } catch (e) {
        console.warn('Session validation failed:', e);
      }
    }

    return NextResponse.json({
      cookieStatus,
      sessionValid,
      values: {
        base,
        db,
        companyId,
        locationId,
        sessionLength: session?.length || 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '检查失败' }, { status: 500 });
  }
}
