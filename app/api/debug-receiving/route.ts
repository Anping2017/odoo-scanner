// /app/api/debug-receiving/route.ts
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

    // 1. 测试仓库查询
    const warehouses = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.warehouse',
      method: 'search_read',
      args: [
        [['name', 'ilike', 'receive']],
        ['id', 'name', 'code']
      ],
      kwargs: { 
        context: ctx 
      }
    }, cookieStr);

    // 2. 测试所有仓库
    const allWarehouses = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.warehouse',
      method: 'search_read',
      args: [
        [['id', '>', 0]],
        ['id', 'name', 'code']
      ],
      kwargs: { 
        limit: 10,
        context: ctx 
      }
    }, cookieStr);

    // 3. 测试库存移动查询
    const stockMoves = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.move',
      method: 'search_read',
      args: [
        [
          ['state', 'not in', ['done', 'cancel']],
          ['product_qty', '>', 0]
        ],
        ['id', 'product_id', 'product_qty', 'quantity_done', 'state', 'picking_id', 'warehouse_id']
      ],
      kwargs: { 
        limit: 10,
        order: 'create_date desc',
        context: ctx 
      }
    }, cookieStr);

    // 4. 测试收货单查询
    const pickings = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.picking',
      method: 'search_read',
      args: [
        [
          ['state', 'not in', ['done', 'cancel']],
          ['picking_type_code', '=', 'incoming']
        ],
        ['id', 'name', 'origin', 'state', 'partner_id', 'date', 'move_ids_without_package']
      ],
      kwargs: { 
        limit: 10,
        order: 'create_date desc',
        context: ctx 
      }
    }, cookieStr);

    // 5. 测试移动行查询 - 如果有收货单的话
    let movesTest = { error: null, count: 0, data: [] };
    if (pickings?.result && pickings.result.length > 0) {
      const firstPicking = pickings.result[0];
      const moveIds = firstPicking.move_ids_without_package || [];
      
      if (moveIds.length > 0) {
        movesTest = await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.move',
          method: 'search_read',
          args: [
            [['id', 'in', moveIds]],
            ['id', 'product_id', 'product_qty', 'quantity_done', 'state', 'picking_id']
          ],
          kwargs: { 
            context: ctx 
          }
        }, cookieStr);
      }
    }

    return NextResponse.json({
      debug: {
        companyId,
        base,
        db,
        sessionLength: session?.length || 0
      },
      tests: {
        receiveWarehouses: {
          error: warehouses?.error,
          count: warehouses?.result?.length || 0,
          data: warehouses?.result || []
        },
        allWarehouses: {
          error: allWarehouses?.error,
          count: allWarehouses?.result?.length || 0,
          data: allWarehouses?.result || []
        },
        stockMoves: {
          error: stockMoves?.error,
          count: stockMoves?.result?.length || 0,
          data: stockMoves?.result || []
        },
        pickings: {
          error: pickings?.error,
          count: pickings?.result?.length || 0,
          data: pickings?.result || []
        }
      }
    });

  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '调试失败' }, { status: 500 });
  }
}
