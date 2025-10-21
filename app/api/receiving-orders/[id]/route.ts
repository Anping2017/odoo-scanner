// /app/api/receiving-orders/[id]/route.ts
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

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
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

    const orderId = parseInt(params.id);
    if (isNaN(orderId)) {
      return NextResponse.json({ error: '无效的订单ID' }, { status: 400 });
    }

    // 1. 查找Receive仓库
    const receiveWarehouse = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.warehouse',
      method: 'search_read',
      args: [
        [['name', 'ilike', 'receive']],
        ['id', 'name', 'code', 'partner_id']
      ],
      kwargs: { 
        context: ctx 
      }
    }, cookieStr);

    if (receiveWarehouse?.error) {
      throw new Error(`仓库查询失败: ${receiveWarehouse.error.message || JSON.stringify(receiveWarehouse.error)}`);
    }

    const warehouses = receiveWarehouse?.result || [];
    const warehouseIds = warehouses.map((w: any) => w.id);

    // 2. 先获取收货单信息
    const pickingData = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.picking',
      method: 'read',
      args: [orderId, ['id', 'name', 'origin', 'state', 'partner_id', 'date', 'move_ids_without_package']],
      kwargs: { context: ctx }
    }, cookieStr);

    if (pickingData?.error || !pickingData?.result?.[0]) {
      throw new Error(`收货单查询失败: ${pickingData?.error?.message || '收货单不存在'}`);
    }

    const picking = pickingData.result[0];

    // 3. 通过收货单的移动行ID获取移动行详情
    const moveIds = picking.move_ids_without_package || [];
    let moves: any[] = [];
    
    if (moveIds.length > 0) {
      const stockMoves = await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.move',
        method: 'search_read',
        args: [
          [['id', 'in', moveIds]],
          ['id', 'product_id', 'product_qty', 'state', 'picking_id']
        ],
        kwargs: { 
          context: ctx 
        }
      }, cookieStr);

      if (stockMoves?.error) {
        console.log('移动行查询错误:', stockMoves.error);
      } else {
        moves = stockMoves?.result || [];
      }
    }

    if (moves.length === 0) {
      return NextResponse.json({ error: '未找到该订单的待入库产品' }, { status: 404 });
    }

    // 4. 获取产品信息
    const productIds = [...new Set(moves.map((m: any) => m.product_id[0]))];
    let productMap = new Map();
    if (productIds.length > 0) {
      const productsData = await rpc(base, '/web/dataset/call_kw', {
        model: 'product.product',
        method: 'search_read',
        args: [
          [['id', 'in', productIds]],
          ['id', 'name', 'default_code', 'barcode', 'tracking']
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

    // 5. 整理订单数据
    const products = moves.map((move: any) => {
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
        picking_id: move.picking_id[0],
        tracking: product?.tracking || 'none' // 添加跟踪信息
      };
    }).filter(p => p.qty_to_receive > 0); // 只显示待入库的产品

    const order = {
      id: picking.id,
      name: picking.origin || picking.name,
      supplier: picking.partner_id ? picking.partner_id[1] : '未知供应商',
      date_order: picking.date,
      amount_total: 0, // 库存移动没有总金额
      state: picking.state,
      warehouse: warehouses.length > 0 ? warehouses[0].name : '未知仓库',
      products: products
    };

    return NextResponse.json({ order });

  } catch (e: any) {
    console.error('Error fetching order detail:', e);
    return NextResponse.json({ error: e?.message || '获取订单详情失败' }, { status: 500 });
  }
}
