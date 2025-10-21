// /app/api/test-move-line-quantity/route.ts
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

    // 1. 获取一个测试收货单 - 使用更宽松的条件
    const testPicking = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.picking',
      method: 'search_read',
      args: [
        [['picking_type_code', '=', 'incoming']], // 只要求是入库类型
        ['id', 'name', 'state', 'move_ids_without_package'],
        { limit: 1 }
      ],
      kwargs: { context: ctx }
    }, cookieStr);

    // 如果还是没有找到，尝试任何类型的收货单
    if (testPicking?.error || !testPicking?.result?.[0]) {
      const anyPicking = await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.picking',
        method: 'search_read',
        args: [
          [], // 不设任何条件
          ['id', 'name', 'state', 'move_ids_without_package', 'picking_type_code'],
          { limit: 1 }
        ],
        kwargs: { context: ctx }
      }, cookieStr);
      
      if (anyPicking?.result?.[0]) {
        return NextResponse.json({
          error: '找到了收货单但类型不匹配',
          foundPicking: anyPicking.result[0],
          message: '请确保有入库类型的收货单用于测试'
        });
      }
    }

    if (testPicking?.error || !testPicking?.result?.[0]) {
      return NextResponse.json({ 
        error: '没有找到测试收货单',
        testPickingError: testPicking?.error
      });
    }

    const picking = testPicking.result[0];
    const moveIds = picking.move_ids_without_package;

    if (!moveIds || moveIds.length === 0) {
      return NextResponse.json({ 
        error: '收货单没有移动行',
        picking: picking
      });
    }

    // 2. 获取第一个移动行
    const firstMove = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.move',
      method: 'read',
      args: [moveIds[0], ['id', 'product_qty', 'quantity', 'product_id', 'state']],
      kwargs: { context: ctx }
    }, cookieStr);

    if (firstMove?.error || !firstMove?.result?.[0]) {
      return NextResponse.json({ 
        error: '无法读取移动行',
        moveError: firstMove?.error
      });
    }

    const move = firstMove.result[0];

    // 3. 检查产品是否需要跟踪
    const productData = await rpc(base, '/web/dataset/call_kw', {
      model: 'product.product',
      method: 'read',
      args: [move.product_id[0], ['tracking', 'name']],
      kwargs: { context: ctx }
    }, cookieStr);

    const tracking = productData?.result?.[0]?.tracking || 'none';

    // 4. 测试直接设置quantity
    const testQuantityUpdate = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.move',
      method: 'write',
      args: [
        [move.id],
        { quantity: move.product_qty }
      ],
      kwargs: { context: ctx }
    }, cookieStr);

    // 5. 重新读取移动行状态
    const updatedMove = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.move',
      method: 'read',
      args: [move.id, ['id', 'product_qty', 'quantity', 'state']],
      kwargs: { context: ctx }
    }, cookieStr);

    // 6. 如果产品需要跟踪，尝试创建stock.move.line
    let moveLineTest = null;
    if (tracking !== 'none') {
      moveLineTest = await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.move.line',
        method: 'create',
        args: [{
          move_id: move.id,
          product_id: move.product_id[0],
          quantity: move.product_qty,
          lot_name: tracking === 'serial' ? `SN-${Date.now()}` : `LOT-${Date.now()}`,
          lot_id: false
        }],
        kwargs: { context: ctx }
      }, cookieStr);
    }

    return NextResponse.json({
      testPicking: {
        id: picking.id,
        name: picking.name,
        state: picking.state,
        moveCount: moveIds.length
      },
      originalMove: move,
      productTracking: {
        tracking: tracking,
        productName: productData?.result?.[0]?.name
      },
      quantityUpdate: testQuantityUpdate,
      updatedMove: updatedMove?.result?.[0],
      moveLineTest: moveLineTest,
      moveLineTestError: moveLineTest?.error,
      debug: {
        base,
        db,
        companyId,
        context: ctx
      }
    });

  } catch (e: any) {
    console.error('Error testing move line quantity:', e);
    return NextResponse.json({ error: e?.message || '测试失败' }, { status: 500 });
  }
}
