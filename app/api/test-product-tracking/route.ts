// /app/api/test-product-tracking/route.ts
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
    const moveIds = testPicking.move_ids_without_package || [];

    if (moveIds.length === 0) {
      return NextResponse.json({ 
        error: '收货单没有移动行',
        picking: testPicking
      });
    }

    // 2. 获取移动行和产品信息
    const movesData = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.move',
      method: 'search_read',
      args: [
        [['id', 'in', moveIds]],
        ['id', 'product_id', 'product_qty']
      ],
      kwargs: { context: ctx }
    }, cookieStr);

    if (movesData?.error) {
      return NextResponse.json({ 
        error: '移动行查询失败',
        movesError: movesData.error
      });
    }

    // 3. 检查每个产品的跟踪设置
    const productIds = movesData.result.map((move: any) => move.product_id[0]);
    const productsData = await rpc(base, '/web/dataset/call_kw', {
      model: 'product.product',
      method: 'search_read',
      args: [
        [['id', 'in', productIds]],
        ['id', 'name', 'tracking']
      ],
      kwargs: { context: ctx }
    }, cookieStr);

    if (productsData?.error) {
      return NextResponse.json({ 
        error: '产品查询失败',
        productsError: productsData.error
      });
    }

    // 4. 整理结果
    const productsWithTracking = productsData.result.map((product: any) => ({
      id: product.id,
      name: product.name,
      tracking: product.tracking,
      needsLotSerial: product.tracking !== 'none'
    }));

    return NextResponse.json({
      testPicking: {
        id: testPicking.id,
        name: testPicking.name,
        state: testPicking.state,
        moveCount: moveIds.length
      },
      products: productsWithTracking,
      summary: {
        totalProducts: productsWithTracking.length,
        needsTracking: productsWithTracking.filter((p: any) => p.needsLotSerial).length,
        noTracking: productsWithTracking.filter((p: any) => !p.needsLotSerial).length
      },
      debug: {
        base,
        db,
        companyId,
        context: ctx
      }
    });

  } catch (e: any) {
    console.error('Error testing product tracking:', e);
    return NextResponse.json({ error: e?.message || '测试失败' }, { status: 500 });
  }
}
