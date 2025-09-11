// /app/api/test-lot-access/route.ts
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

    // 测试1: 检查Lot模型是否存在
    const fieldsTest = await fetch(`${base}/web/dataset/call_kw`, {
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

    const fieldsResult = await fieldsTest.json().catch(() => ({}));

    // 测试2: 尝试获取一个Lot记录
    const lotTest = await fetch(`${base}/web/dataset/call_kw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: cookieStr },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'call',
        params: {
          model: 'stock.production.lot',
          method: 'search',
          args: [[['id', '>', 0]]],
          kwargs: { limit: 1, context: ctx }
        }
      }),
    });

    const lotResult = await lotTest.json().catch(() => ({}));

    // 测试3: 尝试读取Lot记录
    let lotReadResult = null;
    if (lotResult?.result?.[0]) {
      const lotReadTest = await fetch(`${base}/web/dataset/call_kw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: cookieStr },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'call',
          params: {
            model: 'stock.production.lot',
            method: 'read',
            args: [[lotResult.result[0]], ['id', 'name', 'product_id']],
            kwargs: { context: ctx }
          }
        }),
      });

      lotReadResult = await lotReadTest.json().catch(() => ({}));
    }

    return NextResponse.json({
      fieldsAvailable: !fieldsResult?.error,
      fieldsError: fieldsResult?.error || null,
      availableFields: Object.keys(fieldsResult?.result || {}),
      lotSearchAvailable: !lotResult?.error,
      lotSearchError: lotResult?.error || null,
      lotSearchResult: lotResult?.result || [],
      lotReadAvailable: !lotReadResult?.error,
      lotReadError: lotReadResult?.error || null,
      lotReadResult: lotReadResult?.result || [],
      debug: {
        base,
        db,
        companyId,
        sessionLength: session?.length || 0,
        context: ctx
      }
    });
  } catch (e: any) {
    console.error('Test lot access error:', e);
    return NextResponse.json({ error: e?.message || '测试失败' }, { status: 500 });
  }
}
