// /app/api/simple-sales/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { resolvePreset } from '@/lib/odooPresets';

export const dynamic = 'force-dynamic';

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
    const ck = req.cookies;
    const hostHdr = req.headers.get('x-forwarded-host') || req.headers.get('host') || undefined;
    const preset = resolvePreset(hostHdr);

    const base = ck.get('od_base')?.value || preset?.url;
    const db = ck.get('od_db')?.value || preset?.db;
    const session = ck.get('od_session')?.value;
    const companyId = Number(ck.get('od_company')?.value || 0) || undefined;

    if (!base || !db || !session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const cookieStr = `session_id=${session}`;
    const ctx: any = {};
    if (companyId) { 
      ctx.company_id = companyId; 
      ctx.allowed_company_ids = [companyId]; 
    }

    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('product_id');

    if (!productId) {
      return NextResponse.json({ error: '缺少产品ID' }, { status: 400 });
    }

    // 最简单的POS查询
    const posData = await rpc(base, '/web/dataset/call_kw', {
      model: 'pos.order.line',
      method: 'search_read',
      args: [
        [['product_id', '=', parseInt(productId)]],
        ['id', 'qty', 'price_unit', 'price_subtotal']
      ],
      kwargs: { 
        limit: 10,
        context: ctx 
      }
    }, cookieStr);

    return NextResponse.json({
      success: true,
      productId,
      posData: {
        error: posData?.error,
        count: posData?.result?.length || 0,
        result: posData?.result
      }
    });

  } catch (e: any) {
    return NextResponse.json({ 
      success: false,
      error: e?.message || '查询失败',
      stack: e?.stack 
    }, { status: 500 });
  }
}
