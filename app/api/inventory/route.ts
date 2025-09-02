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

    // helpers
    const sumQuantAtLocation = async (): Promise<number> => {
      const qsr = await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.quant',
        method: 'search_read',
        args: [[['product_id', '=', product_id], ['location_id', '=', locId]], ['quantity']],
        kwargs: { context: ctx },
      }, cookieStr);
      if (!Array.isArray(qsr?.result)) return 0;
      return qsr.result.reduce((s: number, q: any) => s + (q.quantity || 0), 0);
    };

    const applyQuantDiff = async (quantIdParam: number | null): Promise<{ ok: boolean, err?: any }> => {
      if (!quantIdParam) return { ok: false, err: 'no quant id' };
      // read current
      const qread = await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.quant',
        method: 'read',
        args: [[quantIdParam], ['quantity']],
        kwargs: { context: ctx },
      }, cookieStr);
      const current = qread?.result?.[0]?.quantity || 0;
      const diff = new_qty - current;
      // write diff
      await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.quant',
        method: 'write',
        args: [[quantIdParam], { inventory_diff_quantity: diff }],
        kwargs: { context: ctx },
      }, cookieStr);
      // apply
      try {
        await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.quant',
          method: 'action_apply_inventory',
          args: [[quantIdParam]],
          kwargs: { context: ctx },
        }, cookieStr);
        return { ok: true };
      } catch (e) {
        return { ok: false, err: e };
      }
    };

    const legacyWizard = async (): Promise<{ ok: boolean, err?: any }> => {
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
        return { ok: true };
      } catch (e) {
        return { ok: false, err: e };
      }
    };

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

    // ④ 读取当前库存（quant.quantity sum）
    const currentQty = await sumQuantAtLocation();

    const attempts: string[] = [];

    // If starting from zero, first try standard picking flow (create incoming/internal picking)
    if (currentQty === 0) {
      attempts.push('start_with_picking_attempt');
      // --- reading uom ---
      const pread = await rpc(base, '/web/dataset/call_kw', {
        model: 'product.product',
        method: 'read',
        args: [[product_id], ['uom_id']],
        kwargs: { context: ctx },
      }, cookieStr);
      const uomId = pread?.result?.[0]?.uom_id?.[0] || 1;

      // find picking type
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

      // source location
      const srcLocSearch = await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.location',
        method: 'search',
        args: [[['usage', '=', 'supplier'], companyId ? ['company_id', '=', companyId] : []].filter(Boolean)],
        kwargs: { limit: 1, context: ctx },
      }, cookieStr);
      const srcLocId = Array.isArray(srcLocSearch?.result) && srcLocSearch.result.length ? srcLocSearch.result[0] : locId;

      let pickingId: number | null = null;
      if (pickingTypeId) {
        // create picking
        const pickingCreate = await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.picking',
          method: 'create',
          args: [[{
            picking_type_id: pickingTypeId,
            location_id: srcLocId,
            location_dest_id: locId,
          }]],
          kwargs: { context: ctx },
        }, cookieStr);
        pickingId = pickingCreate?.result ?? null;
      }

      if (pickingId) {
        attempts.push('picking.created');
        // create move
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
          attempts.push('picking.move.created');
          // try confirm/assign/validate (best-effort)
          try {
            await rpc(base, '/web/dataset/call_kw', {
              model: 'stock.picking',
              method: 'action_confirm',
              args: [[pickingId]],
              kwargs: { context: ctx },
            }, cookieStr);
          } catch (_) { /* ignore */ }

          try {
            await rpc(base, '/web/dataset/call_kw', {
              model: 'stock.picking',
              method: 'action_assign',
              args: [[pickingId]],
              kwargs: { context: ctx },
            }, cookieStr);
          } catch (_) {
            try {
              await rpc(base, '/web/dataset/call_kw', {
                model: 'stock.picking',
                method: '_action_assign',
                args: [[pickingId]],
                kwargs: { context: ctx },
              }, cookieStr);
            } catch (_) { /* ignore */ }
          }

          // create/update move_lines with qty_done
          const mlinesSearch = await rpc(base, '/web/dataset/call_kw', {
            model: 'stock.move.line',
            method: 'search',
            args: [[['move_id', '=', moveId]]],
            kwargs: { context: ctx },
          }, cookieStr);
          const moveLineIds = Array.isArray(mlinesSearch?.result) ? mlinesSearch.result : [];

          if (moveLineIds.length === 0) {
            await rpc(base, '/web/dataset/call_kw', {
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
          } else {
            try {
              await rpc(base, '/web/dataset/call_kw', {
                model: 'stock.move.line',
                method: 'write',
                args: [moveLineIds, { qty_done: new_qty }],
                kwargs: { context: ctx },
              }, cookieStr);
            } catch (_) { /* ignore */ }
          }

          // validate
          try {
            await rpc(base, '/web/dataset/call_kw', {
              model: 'stock.picking',
              method: 'button_validate',
              args: [[pickingId]],
              kwargs: { context: ctx },
            }, cookieStr);
            attempts.push('picking.validated');
          } catch (validateErr) {
            attempts.push('picking.validate_failed');
          }
        }
      }
    } // end if currentQty === 0

    // After initial attempt(s), check real qty
    let finalQty = await sumQuantAtLocation();
    if (finalQty >= new_qty) {
      return NextResponse.json({ ok: true, final_qty: finalQty, attempts, note: 'first attempt succeeded' });
    }

    // Try quant diff + action_apply_inventory
    attempts.push('quant.apply_first_try');
    const ap1 = await applyQuantDiff(quantId);
    if (!ap1.ok) attempts.push('quant.apply_first_fail');

    finalQty = await sumQuantAtLocation();
    if (finalQty >= new_qty) {
      return NextResponse.json({ ok: true, final_qty: finalQty, attempts, note: 'quant.apply worked' });
    }

    // Try legacy wizard as another fallback
    attempts.push('legacy.wizard_try');
    const lw = await legacyWizard();
    if (!lw.ok) attempts.push(`legacy.wizard_fail:${String(lw.err?.message || lw.err)}`);

    finalQty = await sumQuantAtLocation();
    if (finalQty >= new_qty) {
      return NextResponse.json({ ok: true, final_qty: finalQty, attempts, note: 'legacy wizard worked' });
    }

    // Last resort: retry quant.apply once more
    attempts.push('quant.apply_retry');
    const ap2 = await applyQuantDiff(quantId);
    if (!ap2.ok) attempts.push('quant.apply_retry_fail');

    finalQty = await sumQuantAtLocation();
    if (finalQty >= new_qty) {
      return NextResponse.json({ ok: true, final_qty: finalQty, attempts, note: 'retry succeeded' });
    }

    // 如果还是不行，返回失败并附上尝试历史与最终实际数量，便于定位
    return NextResponse.json({
      ok: false,
      error: '多次尝试后数量仍未更新到目标值',
      final_qty: finalQty,
      attempts,
    }, { status: 500 });

  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '库存更新失败' }, { status: 500 });
  }
}
