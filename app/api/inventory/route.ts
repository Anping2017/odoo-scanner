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

    // ========== 如果当前为 0 —— 使用入库(picking)流程 ==========
    if (currentQty === 0) {
      // 读取 product 的默认单位（uom_id）
      const pread = await rpc(base, '/web/dataset/call_kw', {
        model: 'product.product',
        method: 'read',
        args: [[product_id], ['uom_id']],
        kwargs: { context: ctx },
      }, cookieStr);
      const uomId = pread?.result?.[0]?.uom_id?.[0] || 1;

      // 1) 找 picking type：优先 incoming -> internal
      const ptypeSearch = await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.picking.type',
        method: 'search',
        args: [[['code', '=', 'incoming'], companyId ? ['company_id', '=', companyId] : []].filter(Boolean)],
        kwargs: { limit: 1, context: ctx },
      }, cookieStr);

      let pickingTypeId = Array.isArray(ptypeSearch?.result) && ptypeSearch.result.length ? ptypeSearch.result[0] : null;

      if (!pickingTypeId) {
        const ptypeInternal = await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.picking.type',
          method: 'search',
          args: [[['code', '=', 'internal'], companyId ? ['company_id', '=', companyId] : []].filter(Boolean)],
          kwargs: { limit: 1, context: ctx },
        }, cookieStr);
        pickingTypeId = Array.isArray(ptypeInternal?.result) && ptypeInternal.result.length ? ptypeInternal.result[0] : null;
      }

      // 2) 找来源库位（supplier）作为来源：如果没有 supplier 则用 locId 作为来源（兜底）
      const srcLocSearch = await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.location',
        method: 'search',
        args: [[['usage', '=', 'supplier'], companyId ? ['company_id', '=', companyId] : []].filter(Boolean)],
        kwargs: { limit: 1, context: ctx },
      }, cookieStr);
      const srcLocId = Array.isArray(srcLocSearch?.result) && srcLocSearch.result.length ? srcLocSearch.result[0] : locId;

      // 如果没有 pickingType，跳过入库流程（走后续 quant 兜底）
      if (pickingTypeId) {
        // 3) 创建 picking
        const pickingCreate = await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.picking',
          method: 'create',
          args: [[{
            picking_type_id: pickingTypeId,
            location_id: srcLocId,
            location_dest_id: locId,
            // name/partner_id 可选
          }]],
          kwargs: { context: ctx },
        }, cookieStr);
        const pickingId = pickingCreate?.result ?? null;

        if (pickingId) {
          // 4) 创建 move（注意 product_uom 使用 product.uom_id）
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

          if (moveId) {
            // 5) confirm -> assign (兼容不同版本) -> 写 move_line qty_done -> validate
            try {
              await rpc(base, '/web/dataset/call_kw', {
                model: 'stock.picking',
                method: 'action_confirm',
                args: [[pickingId]],
                kwargs: { context: ctx },
              }, cookieStr);
            } catch (err) {
              // ignore; 有些实例在 create 后自动 confirm
            }

            // 尝试 assign（两种可能的方法名）
            let assigned = false;
            try {
              await rpc(base, '/web/dataset/call_kw', {
                model: 'stock.picking',
                method: 'action_assign',
                args: [[pickingId]],
                kwargs: { context: ctx },
              }, cookieStr);
              assigned = true;
            } catch (eAssign) {
              try {
                await rpc(base, '/web/dataset/call_kw', {
                  model: 'stock.picking',
                  method: '_action_assign',
                  args: [[pickingId]],
                  kwargs: { context: ctx },
                }, cookieStr);
                assigned = true;
              } catch (_) {
                assigned = false;
              }
            }

            // 读取 move_lines（如果存在）并写入 qty_done, 或者直接创建 move_line
            const mlinesSearch = await rpc(base, '/web/dataset/call_kw', {
              model: 'stock.move.line',
              method: 'search',
              args: [[['move_id', '=', moveId]]],
              kwargs: { context: ctx },
            }, cookieStr);
            const moveLineIds = Array.isArray(mlinesSearch?.result) ? mlinesSearch.result : [];

            if (moveLineIds.length === 0) {
              // 创建一个 move_line 并直接设置 qty_done
              const mlineCreate = await rpc(base, '/web/dataset/call_kw', {
                model: 'stock.move.line',
                method: 'create',
                args: [[{
                  move_id: moveId,
                  picking_id: pickingId,
                  product_id,
                  product_uom_id: uomId,
                  qty_done: new_qty,
                  location_id: srcLocId,
                  location_dest_id: locId,
                }]],
                kwargs: { context: ctx },
              }, cookieStr);
              if (mlineCreate?.result) {
                // created
              }
            } else {
              // 将每个 move_line 的 qty_done 设置为 planned qty
              try {
                await rpc(base, '/web/dataset/call_kw', {
                  model: 'stock.move.line',
                  method: 'write',
                  args: [moveLineIds, { qty_done: new_qty }],
                  kwargs: { context: ctx },
                }, cookieStr);
              } catch (_) { /* ignore write errors; validation may still work */ }
            }

            // 最后尝试验证
            try {
              await rpc(base, '/web/dataset/call_kw', {
                model: 'stock.picking',
                method: 'button_validate',
                args: [[pickingId]],
                kwargs: { context: ctx },
              }, cookieStr);

              return NextResponse.json({ ok: true, method: 'picking.in', picking_id: pickingId, location_id: locId });
            } catch (validateErr) {
              // 入库验证失败，继续退回到 quant 兜底
              // （保留 validateErr.message 用于调试）
              // fallthrough
            }
          } // end if moveId
        } // end if pickingId
      } // end if pickingTypeId
      // 如果入库任一步失败，继续下面的 quant 兜底流程
    } // end if currentQty === 0

    // ========== 通用 quant.diff + action_apply_inventory 兜底 ==========
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
