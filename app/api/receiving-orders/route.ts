// /app/api/receiving-orders/route.ts
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

    // 1. 查找所有仓库
    const allWarehouses = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.warehouse',
      method: 'search_read',
      args: [
        [['id', '>', 0]],
        ['id', 'name', 'code', 'partner_id']
      ],
      kwargs: { 
        context: ctx 
      }
    }, cookieStr);

    if (allWarehouses?.error) {
      throw new Error(`仓库查询失败: ${allWarehouses.error.message || JSON.stringify(allWarehouses.error)}`);
    }

    const warehouses = allWarehouses?.result || [];
    console.log('找到仓库数量:', warehouses.length);
    
    if (warehouses.length === 0) {
      return NextResponse.json({ orders: [] });
    }

    const warehouseIds = warehouses.map((w: any) => w.id);

    // 2. 查找待入库的收货单（使用picking_type_code = 'incoming'）
    const pickings = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.picking',
      method: 'search_read',
      args: [
        [
          ['state', 'not in', ['done', 'cancel']],
          ['picking_type_code', '=', 'incoming'] // 入库类型的收货单
        ],
        ['id', 'name', 'origin', 'state', 'partner_id', 'date', 'move_ids_without_package']
      ],
      kwargs: { 
        limit: 50,
        order: 'create_date desc',
        context: ctx 
      }
    }, cookieStr);

    if (pickings?.error) {
      throw new Error(`收货单查询失败: ${pickings.error.message || JSON.stringify(pickings.error)}`);
    }

    const pickingList = pickings?.result || [];
    console.log('找到收货单数量:', pickingList.length);

    if (pickingList.length === 0) {
      return NextResponse.json({ orders: [] });
    }

    // 3. 直接通过收货单获取移动行数据
    let moves: any[] = [];
    
    for (const picking of pickingList) {
      try {
        // 直接读取收货单的移动行
        const pickingMoves = await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.move',
          method: 'search_read',
          args: [
            [['picking_id', '=', picking.id]],
            ['id', 'product_id', 'product_qty', 'state', 'picking_id']
          ],
          kwargs: { 
            context: ctx 
          }
        }, cookieStr);

        if (!pickingMoves?.error && pickingMoves?.result) {
          moves.push(...pickingMoves.result);
        }
      } catch (e) {
        console.log(`收货单${picking.id}的移动行查询失败:`, e);
      }
    }

    console.log('找到移动行数量:', moves.length);

    // 4. 获取产品信息
    const productIds = [...new Set(moves.map((m: any) => m.product_id[0]))];
    let productMap = new Map();
    if (productIds.length > 0) {
      const productsData = await rpc(base, '/web/dataset/call_kw', {
        model: 'product.product',
        method: 'search_read',
        args: [
          [['id', 'in', productIds]],
          ['id', 'name', 'default_code', 'barcode']
        ],
        kwargs: {
          context: ctx
        }
      }, cookieStr);
      if (productsData?.error) {
        throw new Error(`产品查询失败: ${productsData.error.message || JSON.stringify(productsData.error)}`);
      }
      productsData.result.forEach((p: any) => productMap.set(p.id, p));
    }

    // 5. 按收货单分组整理数据
    const ordersMap = new Map();
    
    pickingList.forEach((picking: any) => {
      const pickingMoves = moves.filter((move: any) => move.picking_id[0] === picking.id);
      
      if (pickingMoves.length === 0) {
        // 如果没有移动行，创建一个空的订单
        const orderKey = picking.origin || picking.name;
        ordersMap.set(orderKey, {
          id: picking.id,
          name: orderKey,
          supplier: picking.partner_id ? picking.partner_id[1] : '未知供应商',
          date_order: picking.date,
          amount_total: 0,
          state: picking.state,
          warehouse: warehouses[0]?.name || '未知仓库',
          products: []
        });
        return;
      }
      
      const products = pickingMoves.map((move: any) => {
        const product = productMap.get(move.product_id[0]);
        // Odoo 17中可能没有quantity_done字段，假设全部待入库
        const qtyToReceive = move.product_qty; // 简化处理，假设全部待入库
        
        return {
          id: move.id,
          product_id: move.product_id[0],
          product_name: product?.name || move.product_id[1] || '未知产品',
          product_code: product?.default_code || '',
          product_barcode: product?.barcode || '',
          qty_to_receive: qtyToReceive,
          qty_done: 0, // 简化处理
          product_qty: move.product_qty,
          state: move.state,
          picking_id: move.picking_id[0]
        };
      }).filter(p => p.qty_to_receive > 0); // 只显示待入库的产品
      
      if (products.length > 0) {
        const orderKey = picking.origin || picking.name;
        
        if (!ordersMap.has(orderKey)) {
          ordersMap.set(orderKey, {
            id: picking.id,
            name: orderKey,
            supplier: picking.partner_id ? picking.partner_id[1] : '未知供应商',
            date_order: picking.date,
            amount_total: 0,
            state: picking.state,
            warehouse: warehouses[0]?.name || '未知仓库',
            products: []
          });
        }
        
        ordersMap.get(orderKey).products.push(...products);
      }
    });

    const ordersWithDetails = Array.from(ordersMap.values());

    return NextResponse.json({
      orders: ordersWithDetails,
      totalCount: ordersWithDetails.length,
      warehouses: warehouses.map((w: any) => ({ id: w.id, name: w.name, code: w.code }))
    });

  } catch (e: any) {
    console.error('Error fetching receiving orders:', e);
    return NextResponse.json({ error: e?.message || '获取待入库订单失败' }, { status: 500 });
  }
}