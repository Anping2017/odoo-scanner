// /app/api/test-picking-methods/route.ts
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

    // 1. 获取一个收货单进行测试
    const pickings = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.picking',
      method: 'search_read',
      args: [
        [['picking_type_code', '=', 'incoming'], ['state', 'not in', ['done', 'cancel']]],
        ['id', 'name', 'state', 'move_ids_without_package']
      ],
      kwargs: { 
        limit: 1,
        context: ctx 
      }
    }, cookieStr);

    if (pickings?.error || !pickings?.result?.[0]) {
      return NextResponse.json({ 
        error: '没有找到可测试的收货单',
        pickingsError: pickings?.error 
      });
    }

    const testPicking = pickings.result[0];
    console.log('测试收货单:', testPicking);

    // 2. 测试各种方法
    const methods = [
      'action_confirm',
      'action_assign', 
      'button_validate',
      'action_done',
      'do_unreserve'
    ];

    const results: any = {};
    
    for (const method of methods) {
      try {
        const result = await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.picking',
          method: method,
          args: [[testPicking.id]],
          kwargs: { context: ctx }
        }, cookieStr);
        
        results[method] = {
          success: !result?.error,
          error: result?.error,
          result: result?.result
        };
      } catch (e) {
        results[method] = {
          success: false,
          error: e?.message || 'Unknown error'
        };
      }
    }

    return NextResponse.json({
      testPicking: {
        id: testPicking.id,
        name: testPicking.name,
        state: testPicking.state,
        moveCount: testPicking.move_ids_without_package?.length || 0
      },
      methodResults: results,
      debug: {
        base,
        db,
        companyId,
        context: ctx
      }
    });

  } catch (e: any) {
    console.error('Error testing picking methods:', e);
    return NextResponse.json({ error: e?.message || '测试失败' }, { status: 500 });
  }
}
