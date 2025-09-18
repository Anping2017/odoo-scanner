// /app/api/test-pos-models/route.ts
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

    const models = [
      'pos.order.line',
      'pos.order',
      'sale.order.line',
      'sale.order',
      'account.move.line', // 发票行
      'stock.move' // 库存移动
    ];

    const results: any = {};

    for (const model of models) {
      try {
        // 测试模型是否可用
        const fieldsResult = await rpc(base, '/web/dataset/call_kw', {
          model: model,
          method: 'fields_get',
          args: [],
          kwargs: { context: ctx }
        }, cookieStr);

        if (fieldsResult?.error) {
          results[model] = {
            available: false,
            error: fieldsResult.error
          };
        } else {
          // 测试搜索
          const searchResult = await rpc(base, '/web/dataset/call_kw', {
            model: model,
            method: 'search',
            args: [[['id', '>', 0]]],
            kwargs: { limit: 5, context: ctx }
          }, cookieStr);

          results[model] = {
            available: true,
            error: null,
            fields: Object.keys(fieldsResult?.result || {}),
            searchResult: searchResult?.result?.length || 0,
            searchError: searchResult?.error
          };
        }
      } catch (e: any) {
        results[model] = {
          available: false,
          error: e?.message || 'Unknown error'
        };
      }
    }

    return NextResponse.json({
      modelTests: results,
      debug: {
        base,
        db,
        companyId,
        sessionLength: session?.length || 0,
        context: ctx
      }
    });

  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '测试失败' }, { status: 500 });
  }
}
