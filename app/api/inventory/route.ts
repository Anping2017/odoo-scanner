// app/api/inventory/route.ts
import { cookies, headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server'; // 添加这行导入
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
// —— POST: 盘点（调整到 new_qty），自动选库位 ——
// —— POST: 盘点（调整到 new_qty），自动选库位 ——
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

    // ① 确定要用的库位
    let locId: number | undefined = Number(location_id || 0) || Number(ck.get('od_location')?.value || 0) || undefined;
    if (!locId) {
      locId = await getDefaultLocationForCompany(base, cookieStr, companyId);
    }
    if (!locId) return NextResponse.json({ error: '缺少 location_id' }, { status: 400 });

    // view 库位保护：必要时下钻到 internal
    locId = await resolveEffectiveLocation(base, cookieStr, locId);

    // ② 保存本次自动判定的库位
    const resp = NextResponse.json({ ok: true, location_id: locId, method: 'pending' });
    resp.cookies.set('od_location', String(locId), { path: '/', maxAge: 60 * 60 * 24 * 30 });

    // ③ 方法1：尝试使用 stock.inventory 模型（更现代的方法）
    try {
      console.log('尝试使用 stock.inventory 方法');
      
      // 首先创建一个库存调整记录
      const inventory = await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.inventory',
        method: 'create',
        args: [[{
          name: `库存调整 - 产品 ${product_id} - ${new Date().toLocaleString()}`,
          location_ids: [[6, 0, [locId]]],
          state: 'draft',
          line_ids: []
        }]],
        kwargs: { context: ctx },
      }, cookieStr);

      if (!inventory?.result) {
        throw new Error('无法创建库存调整记录');
      }

      const inventoryId = inventory.result;
      console.log('库存调整ID:', inventoryId);

      // 添加调整行
      const line = await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.inventory.line',
        method: 'create',
        args: [[{
          inventory_id: inventoryId,
          product_id: product_id,
          location_id: locId,
          product_qty: new_qty
        }]],
        kwargs: { context: ctx },
      }, cookieStr);

      console.log('调整行ID:', line?.result);

      // 验证调整
      const validate = await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.inventory',
        method: 'action_validate',
        args: [[inventoryId]],
        kwargs: { context: ctx },
      }, cookieStr);

      console.log('验证结果:', validate);

      return NextResponse.json({ 
        ok: true, 
        method: 'stock.inventory', 
        location_id: locId,
        inventory_id: inventoryId
      });

    } catch (inventoryError) {
      console.log('stock.inventory 方法失败，尝试备选方案:', inventoryError);

      // ④ 方法2：备选方案 - 使用 quant 的替代方法
      try {
        console.log('尝试备选方案：直接操作 quant');
        
        // 首先确保 quant 记录存在
        const found = await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.quant',
          method: 'search',
          args: [[['product_id', '=', product_id], ['location_id', '=', locId]]],
          kwargs: { limit: 1, context: ctx },
        }, cookieStr);

        let quantId: number | null = Array.isArray(found?.result) && found.result.length ? found.result[0] : null;

        if (!quantId) {
          // 创建 quant 记录
          const created = await rpc(base, '/web/dataset/call_kw', {
            model: 'stock.quant',
            method: 'create',
            args: [[{ 
              product_id, 
              location_id: locId,
              quantity: 0,
              reserved_quantity: 0
            }]],
            kwargs: { context: ctx },
          }, cookieStr);
          quantId = created?.result;
        }

        if (!quantId) {
          throw new Error('无法创建或找到 quant 记录');
        }

        // 直接更新数量（强制方式）
        const update = await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.quant',
          method: 'write',
          args: [[quantId], { quantity: new_qty }],
          kwargs: { context: ctx },
        }, cookieStr);

        console.log('直接更新结果:', update);

        return NextResponse.json({ 
          ok: true, 
          method: 'direct.quant.update', 
          location_id: locId,
          quant_id: quantId
        });

      } catch (quantError) {
        console.log('所有方法都失败:', quantError);
        
        // ⑤ 最后尝试：使用 stock.move 创建库存移动
        try {
          console.log('尝试最后方案：创建库存移动');
          
          // 创建一个库存移动来调整数量
          const move = await rpc(base, '/web/dataset/call_kw', {
            model: 'stock.move',
            method: 'create',
            args: [[{
              name: `库存调整 - 产品 ${product_id}`,
              product_id: product_id,
              location_id: locId,      // 从虚拟库位
              location_dest_id: locId, // 到目标库位
              product_uom_qty: Math.abs(new_qty),
              state: 'done',
              move_type: 'direct'
            }]],
            kwargs: { context: ctx },
          }, cookieStr);

          console.log('库存移动创建结果:', move);

          return NextResponse.json({ 
            ok: true, 
            method: 'stock.move', 
            location_id: locId,
            move_id: move?.result
          });

        } catch (moveError) {
          console.log('所有库存调整方法都失败');
          return NextResponse.json({ 
            error: '无法调整库存，请检查权限和模块配置',
            details: {
              inventoryError: String(inventoryError),
              quantError: String(quantError),
              moveError: String(moveError)
            }
          }, { status: 500 });
        }
      }
    }
  } catch (e: any) {
    console.log('POST 请求整体错误:', e);
    return NextResponse.json({ 
      error: e?.message || '库存更新失败',
      stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
    }, { status: 500 });
  }
}