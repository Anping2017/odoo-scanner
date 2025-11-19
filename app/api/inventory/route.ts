// app/api/inventory/route.ts
import { cookies, headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { resolvePreset } from '@/lib/odooPresets';

// 强制动态渲染，因为使用了 searchParams
export const dynamic = 'force-dynamic';

// 通用 RPC 封装（添加超时和重试）
async function rpc(url: string, path: string, body: any, cookie: string, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
      
      const res = await fetch(`${url}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'call', params: body }),
        cache: 'no-store',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));
      return data;
    } catch (error) {
      if (i === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // 递增延迟重试
    }
  }
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

// —— GET: 库存变动记录（带分页）——
export async function GET(req: NextRequest) {
  try {
    const pid = Number(req.nextUrl.searchParams.get('product_id') || 0);
    const page = parseInt(req.nextUrl.searchParams.get('page') || '1');
    const pageSize = parseInt(req.nextUrl.searchParams.get('page_size') || '10');

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

    // 获取总记录数
    let totalCount = 0;
    try {
      const countData = await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.move',
        method: 'search_count',
        args: [[
          ['product_id', '=', pid],
          ['state', '=', 'done'],
        ]],
        kwargs: { context },
      }, cookieStr);
      totalCount = countData?.result || 0;
    } catch (e) {
      console.log('获取总数失败:', e);
    }

    // 用 stock.move 读取完成的移动作为历史（带分页）
    // 需要获取更详细的信息，包括变动类型和库存余额
    const offset = (page - 1) * pageSize;
    const moveIds = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.move',
      method: 'search_read',
      args: [[
        ['product_id', '=', pid],
        ['state', '=', 'done'],
      ], [
        'id', 
        'date', 
        'product_uom_qty', 
        'product_uom', 
        'location_id', 
        'location_dest_id', 
        'reference', 
        'create_uid', 
        'write_uid',
        'picking_id',
        'origin',
        'name'
      ]],
      kwargs: { 
        limit: pageSize, 
        offset: offset,
        order: 'date desc, id desc', 
        context 
      },
    }, cookieStr);

    const moves = moveIds?.result || [];
    
    // 获取当前产品的库存信息（用于计算余额）
    let currentStock = 0;
    try {
      const productData = await rpc(base, '/web/dataset/call_kw', {
        model: 'product.product',
        method: 'read',
        args: [[pid], ['qty_available']],
        kwargs: { context },
      }, cookieStr);
      if (productData?.result?.[0]) {
        currentStock = productData.result[0].qty_available || 0;
      }
    } catch (e) {
      console.log('获取当前库存失败:', e);
    }

    // 获取库位信息，用于判断入库/出库
    // 需要获取所有涉及的库位类型
    const locationIds = new Set<number>();
    moves.forEach((m: any) => {
      if (m.location_id?.[0]) locationIds.add(m.location_id[0]);
      if (m.location_dest_id?.[0]) locationIds.add(m.location_dest_id[0]);
    });
    
    let locationUsageMap = new Map<number, string>();
    if (locationIds.size > 0) {
      try {
        const locationData = await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.location',
          method: 'read',
          args: [Array.from(locationIds), ['id', 'usage', 'name']],
          kwargs: { context },
        }, cookieStr);
        
        if (locationData?.result && Array.isArray(locationData.result)) {
          locationData.result.forEach((loc: any) => {
            locationUsageMap.set(loc.id, loc.usage || 'internal');
          });
        }
      } catch (e) {
        console.log('获取库位信息失败:', e);
      }
    }
    
    // 处理移动记录，计算库存余额
    // 按日期正序排列（从最早到最新），然后计算累计余额
    const sortedMoves = [...moves].sort((a: any, b: any) => {
      const dateA = new Date(a.date || 0).getTime();
      const dateB = new Date(b.date || 0).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return (a.id || 0) - (b.id || 0);
    });
    
    let runningBalance = 0; // 从0开始累加
    
    const out = sortedMoves.map((m: any) => {
      // 根据库位类型判断是入库还是出库
      const fromLocationId = m.location_id?.[0];
      const toLocationId = m.location_dest_id?.[0];
      const fromUsage = fromLocationId ? locationUsageMap.get(fromLocationId) : 'internal';
      const toUsage = toLocationId ? locationUsageMap.get(toLocationId) : 'internal';
      
      const fromLocation = m.location_id?.[1] || '';
      const toLocation = m.location_dest_id?.[1] || '';
      
      let moveType = 'transfer'; // 默认是转移
      let qtyChange = 0;
      
      // 判断变动类型
      if (fromUsage === 'supplier' || fromUsage === 'inventory' || fromUsage === 'production') {
        // 从供应商/盘点/生产到内部 = 入库
        if (toUsage === 'internal') {
          moveType = 'in';
          qtyChange = m.product_uom_qty || 0;
        }
      } else if (toUsage === 'customer' || toUsage === 'inventory') {
        // 从内部到客户/盘点 = 出库
        if (fromUsage === 'internal') {
          moveType = 'out';
          qtyChange = -(m.product_uom_qty || 0);
        }
      } else if (fromUsage === 'internal' && toUsage === 'internal') {
        // 内部转移：不影响总库存
        moveType = 'transfer';
        qtyChange = 0;
      } else {
        // 其他情况，根据库位名称判断
        const fromIsInternal = fromLocation.toLowerCase().includes('internal') || 
                              fromLocation.toLowerCase().includes('stock') ||
                              fromLocation.toLowerCase().includes('wh');
        const toIsInternal = toLocation.toLowerCase().includes('internal') || 
                            toLocation.toLowerCase().includes('stock') ||
                            toLocation.toLowerCase().includes('wh');
        
        if (!fromIsInternal && toIsInternal) {
          moveType = 'in';
          qtyChange = m.product_uom_qty || 0;
        } else if (fromIsInternal && !toIsInternal) {
          moveType = 'out';
          qtyChange = -(m.product_uom_qty || 0);
        } else {
          moveType = 'transfer';
          qtyChange = 0;
        }
      }
      
      // 计算变动前后的库存余额
      const balanceBefore = runningBalance;
      runningBalance += qtyChange; // 累加变动
      const balanceAfter = runningBalance;
      
      return {
        id: m.id,
        date: m.date,
        qty_change: qtyChange,
        qty_absolute: Math.abs(qtyChange) || 0,
        uom: m.product_uom?.[1] || 'Units',
        move_type: moveType, // 'in', 'out', 'transfer'
        from: fromLocation,
        to: toLocation,
        ref: m.reference || m.origin || m.name || '',
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        created_by: m.create_uid?.[1],
        updated_by: m.write_uid?.[1],
      };
    }).reverse(); // 反转回日期倒序（最新的在前）

    return NextResponse.json({ 
      history: out,
      total: totalCount,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(totalCount / pageSize)
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '查询历史失败' }, { status: 500 });
  }
}

// —— POST: 盘点（调整到 new_qty），自动选库位 ——
// 会优先尝试 stock.quant.apply（新版本），失败则回退到旧版向导 stock.change.product.qty
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

    // ① 确定要用的库位：优先 body.location_id；否则 cookie；否则根据“当前公司”自动找 WH/Stock
    let locId: number | undefined = Number(location_id || 0) || Number(ck.get('od_location')?.value || 0) || undefined;
    if (!locId) {
      locId = await getDefaultLocationForCompany(base, cookieStr, companyId);
    }
    if (!locId) return NextResponse.json({ error: '缺少 location_id（已尝试自动匹配但未找到，请选择具体库位）' }, { status: 400 });

    // view 库位保护：必要时下钻到 internal
    locId = await resolveEffectiveLocation(base, cookieStr, locId);

    // ② 保存本次自动判定的库位，便于下次无需再传
    const resp = NextResponse.json({ ok: true, location_id: locId, method: 'pending' });
    const isHttps = req.url.startsWith('https://') || req.headers.get('x-forwarded-proto') === 'https';
    resp.cookies.set('od_location', String(locId), { 
      path: '/', 
      maxAge: 60 * 60 * 24 * 30,
      secure: isHttps,
      sameSite: 'lax'
    });

    // ③ Odoo 17 库存调整方法
    // 尝试多种方法以确保兼容性
    try {
      // 方法1: 尝试使用 stock.inventory 模型（Odoo 17推荐）
      try {
        // 创建库存调整记录
        const inventory = await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.inventory',
          method: 'create',
          args: [[{
            name: `库存调整 - ${new Date().toLocaleString()}`,
            location_ids: [[6, 0, [locId]]],
            product_ids: [[6, 0, [product_id]]],
            state: 'draft'
          }]],
          kwargs: { context: ctx },
        }, cookieStr);

        if (inventory?.result) {
          // 添加库存调整行
          const line = await rpc(base, '/web/dataset/call_kw', {
            model: 'stock.inventory.line',
            method: 'create',
            args: [[{
              inventory_id: inventory.result,
              product_id: product_id,
              location_id: locId,
              product_qty: new_qty,
              theoretical_qty: 0 // 当前理论库存，设为0让系统自动计算
            }]],
            kwargs: { context: ctx },
          }, cookieStr);

          if (line?.result) {
            // 确认库存调整
            await rpc(base, '/web/dataset/call_kw', {
              model: 'stock.inventory',
              method: 'action_validate',
              args: [[inventory.result]],
              kwargs: { context: ctx },
            }, cookieStr);

            return NextResponse.json({ ok: true, method: 'stock.inventory', location_id: locId });
          }
        }
      } catch (inventoryError) {
        // stock.inventory 方法失败，尝试其他方法
      }

      // 方法2: 尝试使用 stock.quant 直接调整（Odoo 17备用方法）
      try {
        // 查找或创建 quant 记录
        const found = await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.quant',
          method: 'search',
          args: [[['product_id', '=', product_id], ['location_id', '=', locId]]],
          kwargs: { limit: 1, context: ctx },
        }, cookieStr);

        let quantId = Array.isArray(found?.result) && found.result.length ? found.result[0] : null;

        if (!quantId) {
          // 创建新的 quant 记录
          const created = await rpc(base, '/web/dataset/call_kw', {
            model: 'stock.quant',
            method: 'create',
            args: [[{
              product_id: product_id,
              location_id: locId,
              quantity: new_qty,
              inventory_quantity: new_qty
            }]],
            kwargs: { context: ctx },
          }, cookieStr);
          quantId = created?.result;
        } else {
          // 更新现有 quant 记录
          await rpc(base, '/web/dataset/call_kw', {
            model: 'stock.quant',
            method: 'write',
            args: [[quantId], {
              quantity: new_qty,
              inventory_quantity: new_qty
            }],
            kwargs: { context: ctx },
          }, cookieStr);
        }

        if (quantId) {
          // 应用库存调整
          await rpc(base, '/web/dataset/call_kw', {
            model: 'stock.quant',
            method: 'action_apply_inventory',
            args: [[quantId]],
            kwargs: { context: ctx },
          }, cookieStr);

          return NextResponse.json({ ok: true, method: 'stock.quant', location_id: locId });
        }
      } catch (quantError) {
        // stock.quant 方法失败，尝试旧版方法
      }

      // 方法3: 回退到旧版向导（如果仍然可用）
      try {
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

        if (wiz?.result) {
          await rpc(base, '/web/dataset/call_kw', {
            model: 'stock.change.product.qty',
            method: 'change_product_qty',
            args: [[wiz.result]],
            kwargs: { context: ctx },
          }, cookieStr);

          return NextResponse.json({ ok: true, method: 'legacy.wizard', location_id: locId });
        }
      } catch (legacyError) {
        // 旧版向导也失败
      }

      throw new Error('所有库存调整方法都失败了');
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || '库存更新失败' }, { status: 500 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '库存更新失败' }, { status: 500 });
  }
}