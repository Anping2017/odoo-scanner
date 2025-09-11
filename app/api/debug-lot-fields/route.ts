// /app/api/debug-lot-fields/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { resolvePreset } from '@/lib/odooPresets';

// 强制动态渲染
export const dynamic = 'force-dynamic';

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

    // 获取Lot字段信息
    const fieldsInfo = await fetch(`${base}/web/dataset/call_kw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: cookieStr },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'call',
        params: {
          model: 'stock.production.lot',
          method: 'fields_get',
          args: [],
          kwargs: { context: ctx }
        }
      }),
    });

    const fieldsResult = await fieldsInfo.json().catch(() => ({}));

    // 获取前几个Lot记录
    const lotsData = await fetch(`${base}/web/dataset/call_kw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: cookieStr },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'call',
        params: {
          model: 'stock.production.lot',
          method: 'search_read',
          args: [[['id', '>', 0]], []],
          kwargs: { limit: 5, context: ctx }
        }
      }),
    });

    const lotsResult = await lotsData.json().catch(() => ({}));

    return NextResponse.json({
      availableFields: Object.keys(fieldsResult?.result || {}),
      fieldDetails: fieldsResult?.result || {},
      sampleLots: lotsResult?.result || [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '调试失败' }, { status: 500 });
  }
}
