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

    // ③ 首先尝试直接使用 stock.quant 的盘点功能
    try {
      // 先搜索是否存在 quant 记录
      const found = await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.quant',
        method: 'search',
        args: [[['product_id', '=', product_id], ['location_id', '=', locId]]],
        kwargs: { limit: 1, context: ctx },
      }, cookieStr);

      let quantId: number | null = Array.isArray(found?.result) && found.result.length ? found.result[0] : null;

      if (quantId) {
        // 如果存在 quant 记录，更新库存数量
        await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.quant',
          method: 'write',
          args: [[quantId], { inventory_quantity: new_qty }],
          kwargs: { context: ctx },
        }, cookieStr);
      } else {
        // 如果不存在 quant 记录，创建新的 quant 记录
        // 关键修复：确保包含所有必要字段
        const created = await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.quant',
          method: 'create',
          args: [[{ 
            product_id, 
            location_id: locId, 
            inventory_quantity: new_qty,
            quantity: 0, // 明确设置当前数量为 0
            reserved_quantity: 0, // 明确设置保留数量为 0
            in_date: new Date().toISOString().split('T')[0] // 设置入库日期
          }]],
          kwargs: { context: ctx },
        }, cookieStr);
        quantId = created?.result ?? null;
      }

      if (!quantId) {
        throw new Error('无法创建或找到 quant 记录');
      }

      // 应用盘点
      await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.quant',
        method: 'action_apply_inventory',
        args: [[quantId]],
        kwargs: { context: ctx },
      }, cookieStr);

      return NextResponse.json({ ok: true, method: 'quant.apply', location_id: locId });

    } catch (quantError) {
      console.log('Quant 方法失败，尝试旧版向导:', quantError);

      // ④ 如果新方法失败，回退到旧版向导
      try {
        // 首先创建向导记录
        const wiz = await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.change.product.qty',
          method: 'create',
          args: [[{ 
            product_id, 
            new_quantity: new_qty, 
            location_id: locId 
          }]],
          kwargs: { context: ctx },
        }, cookieStr);

        if (!wiz?.result) {
          throw new Error('无法创建库存调整向导');
        }

        // 执行库存调整
        const result = await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.change.product.qty',
          method: 'change_product_qty',
          args: [[wiz.result]],
          kwargs: { context: ctx },
        }, cookieStr);

        return NextResponse.json({ 
          ok: true, 
          method: 'legacy.wizard', 
          location_id: locId,
          result: result?.result 
        });

      } catch (wizardError) {
        console.log('旧版向导也失败:', wizardError);
        return NextResponse.json({ 
          error: '库存更新失败：quant 和向导都不可用',
          details: {
            quantError: String(quantError),
            wizardError: String(wizardError)
          }
        }, { status: 500 });
      }
    }
  } catch (e: any) {
    return NextResponse.json({ 
      error: e?.message || '库存更新失败',
      stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
    }, { status: 500 });
  }
}