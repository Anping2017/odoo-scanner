// app/api/inventory/route.ts
import { cookies, headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { resolvePreset } from '@/lib/odooPresets';

// 通用 RPC 封装
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

// 如果传入的是 view 类型库位，向下找一个 internal 子库位
async function resolveEffectiveLocation(base: string, cookieStr: string, locId: number): Promise<number> {
  const read = await rpc(base, '/web/dataset/call_kw', {
    model: 'stock.location',
    method: 'read',
    args: [[locId], ['id', 'usage']],
    kwargs: {},
  }, cookieStr);

  const loc = Array.isArray(read?.result) && read.result[0];
  if (!loc) throw new Error(`Location ${locId} not found`);
  if (loc.usage !== 'view') return locId;

  const child = await rpc(base, '/web/dataset/call_kw', {
    model: 'stock.location',
    method: 'search',
    args: [[['location_id', '=', locId], ['usage', '=', 'internal']]],
    kwargs: { limit: 1 },
  }, cookieStr);

  if (Array.isArray(child?.result) && child.result.length) return child.result[0];
  throw new Error(`Location ${locId} is 'view' and has no internal child. Please choose an Internal location (e.g. WH/Stock).`);
}

// ✅ 依据"当前公司"自动找默认库位（该公司的 WH/Stock）
async function getDefaultLocationForCompany(base: string, cookieStr: string, companyId?: number): Promise<number | undefined> {
  // 尝试：拿该公司的仓库 -> lot_stock_id
  if (companyId) {
    const whIds = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.warehouse',
      method: 'search',
      args: [[['company_id', '=', companyId]]],
      kwargs: { limit: 1 },
    }, cookieStr);
    const wid = whIds?.result?.[0];
    if (wid) {
      const wh = await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.warehouse',
        method: 'read',
        args: [[wid], ['lot_stock_id']],
        kwargs: {},
      }, cookieStr);
      const lot = wh?.result?.[0]?.lot_stock_id?.[0];
      if (lot) return lot;
    }
  }

  // 兜底：随公司范围找任意一个 internal 库位
  const domain: any[] = [['usage', '=', 'internal']];
  if (companyId) domain.push(['company_id', '=', companyId]);
  const locIds = await rpc(base, '/web/dataset/call_kw', {
    model: 'stock.location',
    method: 'search',
    args: [domain],
    kwargs: { limit: 1 },
  }, cookieStr);
  return locIds?.result?.[0];
}

// —— GET: 最近库存变动（简版历史）——
export async function GET(req: NextRequest) {
  try {
    const pid = Number(req.nextUrl.searchParams.get('product_id') || 0);
    const limit = Number(req.nextUrl.searchParams.get('limit') || 10);

    const ck = cookies();
    const host = headers().get('host') || undefined;
    const preset = resolvePreset(host);

    const base = ck.get('od_base')?.value || preset?.url;
    const session = ck.get('od_session')?.value;
    const companyId = Number(ck.get('od_company')?.value || 0) || undefined;
    if (!base || !session) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (!pid) return NextResponse.json({ error: 'product_id required' }, { status: 400 });

    const cookieStr = `session_id=${session}`;
    const context: any = {};
    if (companyId) { context.company_id = companyId; context.allowed_company_ids = [companyId]; }

    // 用 stock.move 读近几条完成的移动作为历史
    const moveIds = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.move',
      method: 'search',
      args: [[
        ['product_id', '=', pid],
        ['state', '=', 'done'],
      ]],
      kwargs: { limit, order: 'date desc', context },
    }, cookieStr);

    if (!Array.isArray(moveIds?.result) || !moveIds.result.length) {
      return NextResponse.json({ history: [] });
    }

    const moves = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.move',
      method: 'read',
      args: [moveIds.result, ['id', 'date', 'product_uom_qty', 'product_uom', 'location_id', 'location_dest_id', 'reference', 'create_uid', 'write_uid']],
      kwargs: { context },
    }, cookieStr);

    const out = (moves?.result || []).map((m: any) => ({
      id: m.id,
      date: m.date,
      qty_done: m.product_uom_qty,
      uom: m.product_uom?.[1],
      from: m.location_id?.[1],
      to: m.location_dest_id?.[1],
      ref: m.reference,
      created_by: m.create_uid?.[1],
      updated_by: m.write_uid?.[1],
    }));

    return NextResponse.json({ history: out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '查询历史失败' }, { status: 500 });
  }
}

// —— POST: 通过创建库存移动来调整库存 ——
export async function POST(req: NextRequest) {
  try {
    const { product_id, new_qty, location_id } = await req.json();

    const ck = cookies();
    const host = headers().get('host') || undefined;
    const preset = resolvePreset(host);

    const base = ck.get('od_base')?.value || preset?.url;
    const session = ck.get('od_session')?.value;
    const companyId = Number(ck.get('od_company')?.value || 0) || undefined;

    if (!base || !session) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (!product_id || typeof new_qty !== 'number' || Number.isNaN(new_qty)) {
      return NextResponse.json({ error: '缺少 product_id 或 new_qty' }, { status: 400 });
    }

    const cookieStr = `session_id=${session}`;
    const ctx: any = {};
    if (companyId) { ctx.company_id = companyId; ctx.allowed_company_ids = [companyId]; }

    // 1. 确定要调整的库位
    let locId: number | undefined = Number(location_id || 0) || Number(ck.get('od_location')?.value || 0) || undefined;
    if (!locId) {
      locId = await getDefaultLocationForCompany(base, cookieStr, companyId);
    }
    if (!locId) return NextResponse.json({ error: '缺少 location_id' }, { status: 400 });

    // 确保不是view类型库位
    locId = await resolveEffectiveLocation(base, cookieStr, locId);

    // 2. 获取产品当前的库存数量（在手数量）
    const productRead = await rpc(base, '/web/dataset/call_kw', {
      model: 'product.product',
      method: 'read',
      args: [[product_id], ['qty_available']],
      kwargs: { context: ctx },
    }, cookieStr);

    const currentQty = productRead?.result?.[0]?.qty_available || 0;
    const quantityToAdjust = new_qty - currentQty;

    // 如果数量没有变化，直接返回成功
    if (quantityToAdjust === 0) {
      return NextResponse.json({ ok: true, method: 'no.change', location_id: locId, note: '库存数量无变化' });
    }

    // 3. 确定源位置和目标位置
    // 库存调整的本质是：从一个虚拟库存调整位置 移动到你指定的库位（如果增加库存）
    //                 或：从你指定的库位 移动到另一个虚拟库存调整位置（如果减少库存）
    // 首先需要找到这个虚拟的库存调整位置
    const inventoryAdjustLocationSearch = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.location',
      method: 'search',
      args: [[['usage', '=', 'inventory'], ['scrap_location', '=', false]]],
      kwargs: { limit: 1, context: ctx },
    }, cookieStr);

    let inventoryAdjustLocationId = inventoryAdjustLocationSearch?.result?.[0];
    // 如果找不到标准的库存调整位置，可以尝试查找其他类型的调整位置，或者使用一个已知的虚拟位置
    // 这里需要根据你的Odoo实际配置进行调整，以下是一个备选方案
    if (!inventoryAdjustLocationId) {
      // 尝试查找名为 'Inventory Adjustment' 或类似名称的位置
      const inventoryLocationSearch = await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.location',
        method: 'search',
        args: [[['name', 'ilike', 'inventory'], ['usage', '=', 'inventory']]],
        kwargs: { limit: 1, context: ctx },
      }, cookieStr);
      inventoryAdjustLocationId = inventoryLocationSearch?.result?.[0];
    }

    if (!inventoryAdjustLocationId) {
      return NextResponse.json({ error: '未找到库存调整位置，请检查Odoo配置' }, { status: 500 });
    }

    let sourceLocationId, destLocationId;

    if (quantityToAdjust > 0) {
      // 增加库存：从库存调整位置移动到目标库位
      sourceLocationId = inventoryAdjustLocationId;
      destLocationId = locId;
    } else {
      // 减少库存：从目标库位移动到库存调整位置
      sourceLocationId = locId;
      destLocationId = inventoryAdjustLocationId;
    }

    // 4. 创建库存移动
    const moveCreate = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.move',
      method: 'create',
      args: [{
        name: `库存调整: ${quantityToAdjust > 0 ? '增加' : '减少'} ${Math.abs(quantityToAdjust)}`,
        product_id: product_id,
        product_uom_qty: Math.abs(quantityToAdjust),
        location_id: sourceLocationId,
        location_dest_id: destLocationId,
        state: 'draft', // 先创建为草稿
      }],
      kwargs: { context: ctx },
    }, cookieStr);

    const moveId = moveCreate?.result;

    if (!moveId) {
      return NextResponse.json({ error: '创建库存移动失败' }, { status: 500 });
    }

    // 5. 确认并验证移动
    const moveConfirm = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.move',
      method: 'action_confirm',
      args: [[moveId]],
      kwargs: { context: ctx },
    }, cookieStr);

    // 6. 强制分配库存（即使库存不足也允许移动）
    const moveForceAssign = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.move',
      method: 'action_assign',
      args: [[moveId]],
      kwargs: { context: ctx },
    }, cookieStr);

    // 7. 标记移动为完成
    const moveDone = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.move',
      method: '_action_done',
      args: [[moveId]],
      kwargs: { context: ctx },
    }, cookieStr);

    // 8. 返回成功响应
    const resp = NextResponse.json({ 
      ok: true, 
      method: 'stock.move', 
      location_id: locId,
      move_id: moveId,
      previous_qty: currentQty,
      new_qty: new_qty,
      adjusted_by: quantityToAdjust
    });
    
    // 保存本次使用的库位到cookie
    resp.cookies.set('od_location', String(locId), { path: '/', maxAge: 60 * 60 * 24 * 30 });
    
    return resp;

  } catch (e: any) {
    console.error('库存移动创建失败:', e);
    return NextResponse.json({ 
      error: e?.message || '库存更新失败' 
    }, { status: 500 });
  }
}
}