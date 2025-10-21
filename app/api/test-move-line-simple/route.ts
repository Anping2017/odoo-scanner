// /app/api/test-move-line-simple/route.ts
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

    // 1. 测试stock.move.line的基本访问
    const fieldsTest = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.move.line',
      method: 'fields_get',
      args: [],
      kwargs: { context: ctx }
    }, cookieStr);

    // 2. 测试搜索现有记录 - 修复查询条件
    const searchTest = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.move.line',
      method: 'search_read',
      args: [
        [], // 不设任何条件
        ['id', 'quantity', 'lot_name', 'product_id']
      ],
      kwargs: { 
        context: ctx,
        limit: 3
      }
    }, cookieStr);

    // 3. 获取默认单位用于测试
    const defaultUom = await rpc(base, '/web/dataset/call_kw', {
      model: 'uom.uom',
      method: 'search_read',
      args: [
        [['name', '=', 'Units']], // 查找默认单位
        ['id', 'name']
      ],
      kwargs: { context: ctx, limit: 1 }
    }, cookieStr);

    const uomId = defaultUom?.result?.[0]?.id || 1; // 使用找到的单位ID或默认值1

    // 4. 获取默认位置用于测试
    const defaultLocation = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.location',
      method: 'search_read',
      args: [
        [['usage', '=', 'internal']], // 查找内部位置
        ['id', 'name', 'usage']
      ],
      kwargs: { context: ctx, limit: 1 }
    }, cookieStr);

    const locationId = defaultLocation?.result?.[0]?.id || 8; // 使用找到的位置ID或默认值8

    // 5. 获取一个产品用于测试
    const testProduct = await rpc(base, '/web/dataset/call_kw', {
      model: 'product.product',
      method: 'search_read',
      args: [
        [], // 不设任何条件，获取任何产品
        ['id', 'name', 'uom_id']
      ],
      kwargs: { context: ctx, limit: 1 }
    }, cookieStr);

    const productId = testProduct?.result?.[0]?.id || 1; // 使用找到的产品ID或默认值1
    const productUomId = testProduct?.result?.[0]?.uom_id?.[0] || uomId; // 使用产品的单位ID

    // 6. 测试创建 - 使用最小必需字段，包括所有必需字段
    const createTest = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.move.line',
      method: 'create',
      args: [{
        quantity: 1,
        lot_name: `TEST-${Date.now()}`,
        company_id: companyId, // 添加必需的公司ID
        product_id: productId, // 添加必需的产品ID
        product_uom_id: productUomId, // 使用产品的单位ID
        location_id: locationId, // 添加必需的位置ID
        location_dest_id: locationId // 添加必需的目标位置ID（使用相同位置）
      }],
      kwargs: { context: ctx }
    }, cookieStr);

    // 4. 如果创建成功，尝试删除
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
      fieldsTest: fieldsTest?.error ? fieldsTest.error : '成功',
      searchTest: searchTest?.error ? searchTest.error : { count: searchTest?.result?.length || 0 },
      searchTestDetails: searchTest?.error?.data || null,
      uomTest: {
        found: defaultUom?.result?.[0] || null,
        usedId: uomId
      },
      locationTest: {
        found: defaultLocation?.result?.[0] || null,
        usedId: locationId
      },
      productTest: {
        found: testProduct?.result?.[0] || null,
        usedId: productId,
        usedUomId: productUomId
      },
      createTest: createTest?.error ? createTest.error : { success: true, id: createTest?.result },
      createTestDetails: createTest?.error?.data || null,
      deleteResult: deleteResult,
      debug: {
        base,
        db,
        companyId,
        context: ctx
      }
    });

  } catch (e: any) {
    console.error('Error testing move line simple:', e);
    return NextResponse.json({ error: e?.message || '测试失败' }, { status: 500 });
  }
}
