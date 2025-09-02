// /app/api/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { resolvePreset } from '@/lib/odooPresets';

type AuthBody = {
  login: string;
  password: string;
  companyId?: number;     // 可选：登录后立即切换公司
  remember?: boolean;     // 勾选“保持登录 30 天”
  baseUrl?: string;       // 可选兜底：手填 Odoo URL
  dbName?: string;        // 可选兜底：手填 Odoo DB
};

async function rpc(url: string, path: string, body: any, cookie?: string) {
  const res = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'call', params: body }),
  });

  const setCookie = res.headers.get('set-cookie') || '';
  const data = await res.json().catch(() => ({} as any));
  return { data, setCookie };
}

function extractSessionId(data: any, setCookie: string): string | undefined {
  if (data?.result?.session_id) return data.result.session_id;
  const m = /(?:^|;\s*)session_id=([^;]+)/i.exec(setCookie || '');
  return m?.[1];
}

export async function POST(req: NextRequest) {
  try {
    const { login, password, companyId, remember, baseUrl, dbName } = (await req.json()) as AuthBody;
    if (!login || !password) return NextResponse.json({ error: '缺少账号或密码' }, { status: 400 });

    // 解析预设：优先 x-forwarded-host（宝塔/Nginx 反代），然后 Host
    const hostHdr = req.headers.get('x-forwarded-host') || req.headers.get('host') || undefined;
    const preset = resolvePreset(hostHdr);

    const base = baseUrl || preset?.url;
    const db = dbName || preset?.db;
    if (!base || !db) {
      return NextResponse.json(
        { error: 'Unknown host preset：请在 body 里提供 baseUrl/dbName，或设置 ODOO_URL/ODOO_DB 环境变量。' },
        { status: 400 }
      );
    }

    // 1) 登录
    const { data: auth, setCookie } = await rpc(base, '/web/session/authenticate', { db, login, password });
    const session_id = extractSessionId(auth, setCookie);
    if (!session_id) return NextResponse.json({ error: '认证失败：账号或密码错误' }, { status: 401 });

    const cookieStr = setCookie || `session_id=${session_id}`;

    // 2) 切换公司（可选）
    if (companyId) {
      await fetch(`${base}/web/session/switch_company`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: cookieStr },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'call',
          params: { company_id: Number(companyId) },
        }),
      }).catch(() => {});
    }

    // 3) 设置前端需要的 cookie（保持 30 天）
    const res = NextResponse.json({ ok: true, base, db, companyId: companyId || null });

    const maxAge = remember ? 60 * 60 * 24 * 30 : undefined; // 30 天
    const common = { path: '/', secure: true, sameSite: 'lax' as const };

    res.cookies.set('od_session', session_id, { ...common, httpOnly: true, ...(maxAge ? { maxAge } : {}) });
    res.cookies.set('od_base', base, { ...common, httpOnly: false, ...(maxAge ? { maxAge } : {}) });
    res.cookies.set('od_db', db, { ...common, httpOnly: false, ...(maxAge ? { maxAge } : {}) });
    if (companyId) {
      res.cookies.set('od_company', String(companyId), { ...common, httpOnly: false, ...(maxAge ? { maxAge } : {}) });
      
    }
    if (preset?.defaultLocationId) {
      res.cookies.set('od_location', String(preset.defaultLocationId), { ...common, httpOnly: false, ...(maxAge ? { maxAge } : {}) });
    }

    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '登录失败' }, { status: 500 });
  }
}
