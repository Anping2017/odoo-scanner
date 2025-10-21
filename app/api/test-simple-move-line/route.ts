// /app/api/test-simple-move-line/route.ts
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

    // 1. 测试stock.move.line字段
    const fieldsTest = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.move.line',
      method: 'fields_get',
      args: [],
      kwargs: { context: ctx }
    }, cookieStr);

    // 2. 测试简单的移动行查询
    const simpleTest = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.move.line',
      method: 'search_read',
      args: [
        [['id', '>', 0]],
        ['id']
      ],
      kwargs: { 
        limit: 5,
        context: ctx 
      }
    }, cookieStr);

    // 3. 尝试最简单的创建
    const createTest = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.move.line',
      method: 'create',
      args: [{
        product_id: 1, // 假设产品ID为1
        qty_done: 1
      }],
      kwargs: { context: ctx }
    }, cookieStr);

    return NextResponse.json({
      fieldsTest: fieldsTest?.error ? fieldsTest.error : '成功',
      simpleTest: simpleTest?.error ? simpleTest.error : { count: simpleTest?.result?.length || 0 },
      createTest: createTest?.error ? createTest.error : { success: true, id: createTest?.result },
      createTestDetails: createTest?.error?.data || null,
      debug: {
        base,
        db,
        companyId,
        context: ctx
      }
    });

  } catch (e: any) {
    console.error('Error testing simple move line:', e);
    return NextResponse.json({ error: e?.message || '测试失败' }, { status: 500 });
  }
}
