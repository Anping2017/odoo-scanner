import { NextRequest, NextResponse } from 'next/server';
import { resolvePreset } from '@/lib/odooPresets';

async function rpc(url: string, path: string, body: any, cookie: string) {
  const res = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'call', params: body }),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return data;
}

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code')?.trim();
    if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });

    // 使用 req.cookies 而不是 cookies()
    const ck = req.cookies;
    
    // 使用 req.headers 而不是 headers()
    const hostHdr = req.headers.get('x-forwarded-host') || req.headers.get('host') || undefined;
    const preset = resolvePreset(hostHdr);

    const base = ck.get('od_base')?.value || preset?.url || req.nextUrl.searchParams.get('baseUrl') || undefined;
    const db = ck.get('od_db')?.value || preset?.db || req.nextUrl.searchParams.get('dbName') || undefined;
    const session = ck.get('od_session')?.value;
    const companyId = Number(ck.get('od_company')?.value || 0) || undefined;

    if (!base || !db || !session) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const cookieStr = `session_id=${session}`;

    const ctx: any = {};
    if (companyId) { 
      ctx.company_id = companyId; 
      ctx.allowed_company_ids = [companyId]; 
    }

    const data = await rpc(
      base,
      '/web/dataset/call_kw',
      {
        model: 'product.product',
        method: 'search_read',
        args: [
          [
            '|', // OR 条件
            ['barcode', '=', code],
            ['default_code', '=', code],
          ],
          ['id', 'name', 'barcode', 'default_code', 'qty_available', 'free_qty'],
        ],
        kwargs: { limit: 1, context: ctx },
      },
      cookieStr
    );

    const product = data?.result?.[0] || null;
    return NextResponse.json({ product, companyId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '查询失败' }, { status: 500 });
  }
}