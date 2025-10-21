// /app/api/test-move-line-create/route.ts
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

    // 1. 获取一个产品用于测试 - 使用更宽松的条件
    const testProduct = await rpc(base, '/web/dataset/call_kw', {
      model: 'product.product',
      method: 'search_read',
      args: [
        [], // 不设任何条件，获取任何产品
        ['id', 'name', 'tracking', 'type'],
        { limit: 1 }
      ],
      kwargs: { context: ctx }
    }, cookieStr);

    // 如果还是没有找到，尝试查找任何记录
    if (testProduct?.error || !testProduct?.result?.[0]) {
      const anyProduct = await rpc(base, '/web/dataset/call_kw', {
        model: 'product.product',
        method: 'search_read',
        args: [
          [], // 不设任何条件
          ['id', 'name', 'tracking', 'type'],
          { limit: 5 } // 获取更多记录
        ],
        kwargs: { context: ctx }
      }, cookieStr);
      
      if (anyProduct?.result?.[0]) {
        return NextResponse.json({
          error: '找到了产品但查询有问题',
          foundProducts: anyProduct.result,
          productError: testProduct?.error,
          message: '请检查产品查询条件'
        });
      }
    }

    if (testProduct?.error || !testProduct?.result?.[0]) {
      return NextResponse.json({ 
        error: '没有找到测试产品',
        productError: testProduct?.error
      });
    }

    const product = testProduct.result[0];

    // 2. 获取一个移动行用于测试
    const testMove = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.move',
      method: 'search_read',
      args: [
        [['product_id', '=', product.id]], // 使用找到的产品
        ['id', 'product_qty', 'quantity', 'product_id', 'state'],
        { limit: 1 }
      ],
      kwargs: { context: ctx }
    }, cookieStr);

    if (testMove?.error || !testMove?.result?.[0]) {
      return NextResponse.json({ 
        error: '没有找到测试移动行',
        moveError: testMove?.error,
        product: product
      });
    }

    const move = testMove.result[0];

    // 3. 测试创建stock.move.line - 使用正确的字段
    const createTest = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.move.line',
      method: 'create',
      args: [{
        move_id: move.id,
        product_id: product.id,
        quantity: 1, // 使用正确的字段名
        lot_name: `TEST-${Date.now()}`, // 测试批次名称
        lot_id: false
      }],
      kwargs: { context: ctx }
    }, cookieStr);

    // 4. 如果创建成功，尝试删除测试记录
    let deleteResult = null;
    if (createTest?.result) {
      try {
        deleteResult = await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.move.line',
          method: 'unlink',
          args: [[createTest.result]],
          kwargs: { context: ctx }
        }, cookieStr);
      } catch (e) {
        console.log('删除测试记录失败:', e);
      }
    }

    return NextResponse.json({
      testProduct: product,
      testMove: move,
      createTest: createTest,
      createTestError: createTest?.error,
      deleteResult: deleteResult,
      debug: {
        base,
        db,
        companyId,
        context: ctx
      }
    });

  } catch (e: any) {
    console.error('Error testing move line create:', e);
    return NextResponse.json({ error: e?.message || '测试失败' }, { status: 500 });
  }
}
