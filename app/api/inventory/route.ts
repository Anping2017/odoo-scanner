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

// ✅ 依据“当前公司”自动找默认库位（该公司的 WH/Stock）
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
// 优先用 quant.apply；若当前 quant 数量为 0（首次入库），则直接创建一笔入库/内部移动
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
    if (!locId) return NextResponse.json({ error: '缺少 location_id（已尝试自动匹配但未找到，请选择具体库位）' }, { status: 400 });

    // view 库位保护
    locId = await resolveEffectiveLocation(base, cookieStr, locId);

    // ② 保存本次库位（短期 cookie）
    const resp = NextResponse.json({ ok: true, location_id: locId, method: 'pending' });
    resp.cookies.set('od_location', String(locId), { path: '/', maxAge: 60 * 60 * 24 * 30 });

    // ③ 查/建 quant
    const found = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.quant',
      method: 'search',
      args: [[['product_id', '=', product_id], ['location_id', '=', locId]]],
      kwargs: { limit: 1, context: ctx },
    }, cookieStr);

    let quantId: number | null = Array.isArray(found?.result) && found.result.length ? found.result[0] : null;

    if (!quantId) {
      const created = await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.quant',
        method: 'create',
        args: [[{ product_id, location_id: locId }]],
        kwargs: { context: ctx },
      }, cookieStr);
      quantId = created?.result ?? null;
    }

    // ④ 读取当前库存（quant.quantity）
    const qread = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.quant',
      method: 'read',
      args: [[quantId], ['quantity']],
      kwargs: { context: ctx },
    }, cookieStr);
    const currentQty = qread?.result?.[0]?.quantity || 0;

    // 如果当前为 0 —— 使用「标准入库/内部移动」流程来创建真实的库存变动（更可靠）
    if (currentQty === 0) {
      // 读取 product 的默认单位（uom_id）
      const pread = await rpc(base, '/web/dataset/call_kw', {
        model: 'product.product',
        method: 'read',
        args: [[product_id], ['uom_id']],
        kwargs: { context: ctx },
      }, cookieStr);
      const uomId = pread?.result?.[0]?.uom_id?.[0] || 1;

      // 1) 尝试找 incoming picking type，否则找 internal
      const ptypeSearch = await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.picking.type',
        method: 'search',
        args: [[['code', '=', 'incoming']]], // 优先 incoming
        kwargs: { limit: 1, context: ctx },
      }, cookieStr);

      let pickingTypeId = Array.isArray(ptypeSearch?.result) && ptypeSearch.result.length ? ptypeSearch.result[0] : null;

      if (!pickingTypeId) {
        const ptypeInternal = await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.picking.type',
          method: 'search',
          args: [[['code', '=', 'internal']]],
          kwargs: { limit: 1, context: ctx },
        }, cookieStr);
        pickingTypeId = Array.isArray(ptypeInternal?.result) && ptypeInternal.result.length ? ptypeInternal.result[0] : null;
      }

      // 2) 找入库来源库位（supplier）作为来源：如果没有 supplier 库位就用 locId 作为来源（兜底）
      const srcLocSearch = await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.location',
        method: 'search',
        args: [[['usage', '=', 'supplier']]],
        kwargs: { limit: 1, context: ctx },
      }, cookieStr);
      const srcLocId = Array.isArray(srcLocSearch?.result) && srcLocSearch.result.length ? srcLocSearch.result[0] : locId;

      // 3) 创建 picking（入库/内部）
      if (!pickingTypeId) {
        // 找不到任何 picking type，则回退到 quant.apply 方案（后面会兜底 legacy）
        // 继续走 quant.diff + apply below
      } else {
        const pickingCreate = await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.picking',
          method: 'create',
          args: [[{
            picking_type_id: pickingTypeId,
            location_id: srcLocId,
            location_dest_id: locId,
            // optional: add a name/partner if you want
            // partner_id: false,
          }]],
          kwargs: { context: ctx },
        }, cookieStr);
        const pickingId = pickingCreate?.result ?? null;
        if (!pickingId) {
          // 创建失败，退回到 quant.apply 方案（后面兜底）
        } else {
          // 4) 创建 move
          const moveCreate = await rpc(base, '/web/dataset/call_kw', {
            model: 'stock.move',
            method: 'create',
            args: [[{
              picking_id: pickingId,
              name: 'Initial stock via API',
              product_id,
              product_uom_qty: new_qty,
              product_uom: uomId,
              location_id: srcLocId,
              location_dest_id: locId,
            }]],
            kwargs: { context: ctx },
          }, cookieStr);
          const moveId = moveCreate?.result ?? null;

          if (!moveId) {
            // move 创建失败，尝试删除 picking（不强制），然后回退到 quant.apply 方案
          } else {
            // 5) 确认 -> 分配 -> 验证（尽量走标准动作）
            try {
              // confirm
              await rpc(base, '/web/dataset/call_kw', {
                model: 'stock.picking',
                method: 'action_confirm',
                args: [[pickingId]],
                kwargs: { context: ctx },
              }, cookieStr);

              // try assign (may be action_assign or _action_assign depending on Odoo)
              await rpc(base, '/web/dataset/call_kw', {
                model: 'stock.picking',
                method: 'action_assign',
                args: [[pickingId]],
                kwargs: { context: ctx },
              }, cookieStr);

              // write done quantities on move.lines if necessary (many DBs will auto-create lines)
              // Attempt to validate (button_validate)
              await rpc(base, '/web/dataset/call_kw', {
                model: 'stock.picking',
                method: 'button_validate',
                args: [[pickingId]],
                kwargs: { context: ctx },
              }, cookieStr);

              return NextResponse.json({ ok: true, method: 'picking.in', picking_id: pickingId, location_id: locId });
            } catch (err) {
              // 入库流程失败 —— 回退到后续 quant.apply 流程（下面）
            }
          }
        }
      }
      // 如果上述入库流程任一步失败，则继续走 quant.diff + action_apply_inventory 的兜底流程（下方）
    }

    // ⑤ 通用：设置差异并尝试 action_apply_inventory（quant 方式的兜底方案）
    const qread2 = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.quant',
      method: 'read',
      args: [[quantId], ['quantity']],
      kwargs: { context: ctx },
    }, cookieStr);
    const currentQty2 = qread2?.result?.[0]?.quantity || 0;
    const diff = new_qty - currentQty2;

    // 写入差异
    await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.quant',
      method: 'write',
      args: [[quantId], { inventory_diff_quantity: diff }],
      kwargs: { context: ctx },
    }, cookieStr);

    // 尝试应用库存调整
    try {
      await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.quant',
        method: 'action_apply_inventory',
        args: [[quantId]],
        kwargs: { context: ctx },
      }, cookieStr);

      return NextResponse.json({ ok: true, method: 'quant.apply', location_id: locId });
    } catch {
      // 兜底 legacy：老向导（stock.change.product.qty）
      try {
        const wiz = await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.change.product.qty',
          method: 'create',
          args: [[{ product_id, new_quantity: new_qty, location_id: locId }]],
          kwargs: { context: ctx },
        }, cookieStr);

        await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.change.product.qty',
          method: 'change_product_qty',
          args: [[wiz?.result]],
          kwargs: { context: ctx },
        }, cookieStr);

        return NextResponse.json({ ok: true, method: 'legacy.wizard', location_id: locId });
      } catch {
        return NextResponse.json({ error: '库存更新失败：quant、picking 和向导都不可用' }, { status: 500 });
      }
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '库存更新失败' }, { status: 500 });
  }
}