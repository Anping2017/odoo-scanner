// /app/api/debug-moves/route.ts
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

    // 1. 获取收货单
    const pickings = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.picking',
      method: 'search_read',
      args: [
        [
          ['state', 'not in', ['done', 'cancel']],
          ['picking_type_code', '=', 'incoming']
        ],
        ['id', 'name', 'origin', 'state', 'move_ids_without_package']
      ],
      kwargs: { 
        limit: 5,
        context: ctx 
      }
    }, cookieStr);

    if (pickings?.error) {
      throw new Error(`收货单查询失败: ${pickings.error.message}`);
    }

    const pickingList = pickings?.result || [];
    console.log('找到收货单数量:', pickingList.length);

    // 2. 测试移动行查询
    const allMoveIds = pickingList.flatMap((p: any) => p.move_ids_without_package || []);
    console.log('所有移动行ID:', allMoveIds);

    let movesResult = { error: null, count: 0, data: [] };
    if (allMoveIds.length > 0) {
      // 先测试不添加状态过滤
      movesResult = await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.move',
        method: 'search_read',
        args: [
          [['id', 'in', allMoveIds]],
          ['id', 'product_id', 'product_qty', 'state', 'picking_id']
        ],
        kwargs: { 
          context: ctx 
        }
      }, cookieStr);
      
      console.log('移动行查询结果:', movesResult);
      
      // 如果查询失败，尝试查询所有移动行
      if (movesResult.error || movesResult.data?.length === 0) {
        console.log('尝试查询所有移动行...');
        const allMoves = await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.move',
          method: 'search_read',
          args: [
            [['id', 'in', allMoveIds]],
            ['id', 'product_id', 'product_qty', 'state', 'picking_id']
          ],
          kwargs: { 
            context: ctx 
          }
        }, cookieStr);
        console.log('所有移动行查询结果:', allMoves);
        
        // 尝试最简单的查询
        const simpleMoves = await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.move',
          method: 'search_read',
          args: [
            [['id', 'in', allMoveIds]],
            ['id']
          ],
          kwargs: { 
            context: ctx 
          }
        }, cookieStr);
        console.log('简单移动行查询结果:', simpleMoves);
      }
    }

    // 3. 测试产品查询
    const productIds = [...new Set(movesResult.data?.map((m: any) => m.product_id[0]) || [])];
    let productsResult = { error: null, count: 0, data: [] };
    if (productIds.length > 0) {
      productsResult = await rpc(base, '/web/dataset/call_kw', {
        model: 'product.product',
        method: 'search_read',
        args: [
          [['id', 'in', productIds]],
          ['id', 'name', 'default_code', 'barcode']
        ],
        kwargs: {
          context: ctx
        }
      }, cookieStr);
    }

    return NextResponse.json({
      debug: {
        companyId,
        pickingCount: pickingList.length,
        moveIdsCount: allMoveIds.length,
        productIdsCount: productIds.length,
        moveIds: allMoveIds, // 显示具体的移动行ID
        pickingDetails: pickingList.map((p: any) => ({
          id: p.id,
          name: p.name,
          origin: p.origin,
          state: p.state,
          moveIds: p.move_ids_without_package || []
        }))
      },
      results: {
        pickings: {
          count: pickingList.length,
          data: pickingList.map((p: any) => ({
            id: p.id,
            name: p.name,
            origin: p.origin,
            state: p.state,
            moveIds: p.move_ids_without_package || []
          }))
        },
        moves: {
          error: movesResult.error,
          count: movesResult.data?.length || 0,
          data: movesResult.data || []
        },
        products: {
          error: productsResult.error,
          count: productsResult.data?.length || 0,
          data: productsResult.data || []
        }
      }
    });

  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '移动行调试失败' }, { status: 500 });
  }
}
