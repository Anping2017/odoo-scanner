import { NextRequest, NextResponse } from 'next/server';
import { resolvePreset } from '@/lib/odooPresets';
import { rpc, getBaseFromCookie, getDbFromCookie, getSessionId } from '@/app/api/_odoo';

export const dynamic = 'force-dynamic';

export type PurchaseItem = {
  id: number;
  order_name: string;
  order_id: number;
  date: string;
  supplier: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  product_id: number;
  state: string;
};

export async function GET(req: NextRequest) {
  try {
    const base = getBaseFromCookie(req);
    const db = getDbFromCookie(req);
    const sessionId = getSessionId(req);
    const ck = req.cookies;
    const hostHdr = req.headers.get('x-forwarded-host') || req.headers.get('host') || undefined;
    const preset = resolvePreset(hostHdr);

    if (!base || !db || !sessionId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const ctx: any = {};
    const companyId = Number(ck.get('od_company')?.value || 0) || undefined;
    if (companyId) {
      ctx.company_id = companyId;
      ctx.allowed_company_ids = [companyId];
    }

    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('product_id');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = Math.min(parseInt(searchParams.get('page_size') || '10'), 500); // 限制最大pageSize为500

    if (!productId) {
      return NextResponse.json({ error: '缺少产品ID' }, { status: 400 });
    }

    // 获取采购订单行
    const offset = (page - 1) * pageSize;
    const purchaseData = await rpc('/web/dataset/call_kw', {
      model: 'purchase.order.line',
      method: 'search_read',
      args: [
        [['product_id', '=', parseInt(productId)]],
        ['id', 'order_id', 'product_id', 'product_qty', 'price_unit', 'price_subtotal', 'date_planned']
      ],
      kwargs: {
        limit: pageSize,
        offset: offset,
        order: 'date_planned desc',
        context: ctx
      }
    }, sessionId, base);

    const purchaseLines = purchaseData || [];
    
    // 获取总记录数
    const countData = await rpc('/web/dataset/call_kw', {
      model: 'purchase.order.line',
      method: 'search_count',
      args: [
        [['product_id', '=', parseInt(productId)]]
      ],
      kwargs: {
        context: ctx
      }
    }, sessionId, base);

    const totalCount = countData || 0;

    if (purchaseLines.length === 0) {
      return NextResponse.json({
        purchases: [],
        total: 0,
        page: 1,
        pageSize: pageSize,
        totalPages: 0
      });
    }

    // 获取采购订单信息
    const orderIds = [...new Set(purchaseLines.map((line: any) => line.order_id[0]))];
    const ordersData = await rpc('/web/dataset/call_kw', {
      model: 'purchase.order',
      method: 'search_read',
      args: [
        [['id', 'in', orderIds]],
        ['id', 'name', 'date_order', 'partner_id', 'state']
      ],
      kwargs: {
        context: ctx
      }
    }, sessionId, base);

    const orderMap = new Map();
    if (ordersData) {
      ordersData.forEach((order: any) => {
        orderMap.set(order.id, order);
      });
    }

    // 组合数据
    const purchases: PurchaseItem[] = purchaseLines.map((line: any) => {
      const order = orderMap.get(line.order_id[0]);
      return {
        id: line.id,
        order_name: order?.name || `PO-${line.order_id[0]}`,
        order_id: line.order_id[0],
        date: line.date_planned || order?.date_order || '未知日期',
        supplier: order?.partner_id?.[1] || '未知供应商',
        quantity: line.product_qty,
        unit_price: line.price_unit,
        total_amount: line.price_subtotal,
        product_id: line.product_id[0],
        state: order?.state || 'unknown'
      };
    });

    return NextResponse.json({
      purchases,
      total: totalCount,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(totalCount / pageSize)
    });

  } catch (e: any) {
    console.error('获取采购历史失败:', e);
    return NextResponse.json({
      error: e?.message || '获取采购历史失败',
      details: e?.stack
    }, { status: 500 });
  }
}

