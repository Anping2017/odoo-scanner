import { NextRequest, NextResponse } from 'next/server';
import { rpc, getBaseFromCookie, getDbFromCookie, getSessionId } from '@/app/api/_odoo';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const base = getBaseFromCookie(req);
    const db = getDbFromCookie(req);
    const sessionId = getSessionId(req);
    const ck = req.cookies;

    if (!base || !db || !sessionId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const ctx: any = {};
    const companyId = Number(ck.get('od_company')?.value || 0) || undefined;
    if (companyId) {
      ctx.company_id = companyId;
      ctx.allowed_company_ids = [companyId];
    }

    const orderId = parseInt(params.id);
    if (isNaN(orderId)) {
      return NextResponse.json({ error: '无效的订单ID' }, { status: 400 });
    }

    // 获取采购订单信息
    const orderData = await rpc(
      '/web/dataset/call_kw',
      {
        model: 'purchase.order',
        method: 'read',
        args: [
          [orderId],
          [
            'id',
            'name',
            'date_order',
            'partner_id',
            'company_id',
            'amount_total',
            'amount_tax',
            'amount_untaxed',
            'user_id',
            'state',
            'order_line'
          ]
        ],
        kwargs: { context: ctx }
      },
      sessionId,
      base
    );

    if (!orderData || !Array.isArray(orderData) || orderData.length === 0) {
      return NextResponse.json({ error: '订单不存在或无法访问' }, { status: 404 });
    }

    const order = orderData[0];

    // 验证公司权限
    if (companyId && order.company_id && order.company_id[0] !== companyId) {
      return NextResponse.json({ error: '无权访问此订单' }, { status: 403 });
    }

    // 获取订单行详情
    let orderLines: any[] = [];
    if (order.order_line && Array.isArray(order.order_line) && order.order_line.length > 0) {
      const linesData = await rpc(
        '/web/dataset/call_kw',
        {
          model: 'purchase.order.line',
          method: 'read',
          args: [
            order.order_line,
            [
              'id',
              'product_id',
              'product_qty',
              'price_unit',
              'price_subtotal',
              'date_planned'
            ]
          ],
          kwargs: { context: ctx }
        },
        sessionId,
        base
      ).catch(() => []);

      if (Array.isArray(linesData)) {
        orderLines = linesData;
      }
    }

    // 获取产品信息（用于显示产品名称等）
    const productIds = orderLines
      .map((line: any) => line.product_id?.[0])
      .filter(Boolean);
    
    let productMap = new Map();
    if (productIds.length > 0) {
      const productsData = await rpc(
        '/web/dataset/call_kw',
        {
          model: 'product.product',
          method: 'read',
          args: [
            productIds,
            ['id', 'name', 'default_code', 'barcode']
          ],
          kwargs: { context: ctx }
        },
        sessionId,
        base
      ).catch(() => []);

      if (Array.isArray(productsData)) {
        productsData.forEach((p: any) => {
          productMap.set(p.id, p);
        });
      }
    }

    // 组合订单详情数据
    const orderDetail = {
      id: order.id,
      name: order.name,
      date_order: order.date_order,
      partner_id: order.partner_id,
      supplier: order.partner_id?.[1] || '未知供应商',
      company_id: order.company_id,
      amount_total: order.amount_total || 0,
      amount_tax: order.amount_tax || 0,
      amount_untaxed: order.amount_untaxed || 0,
      state: order.state,
      user_id: order.user_id,
      lines: orderLines.map((line: any) => {
        const product = productMap.get(line.product_id?.[0]);
        return {
          id: line.id,
          product_id: line.product_id?.[0],
          product_name: product?.name || line.product_id?.[1] || '未知产品',
          product_code: product?.default_code || '',
          product_barcode: product?.barcode || '',
          quantity: line.product_qty || 0,
          unit_price: line.price_unit || 0,
          price_subtotal: line.price_subtotal || 0,
          price_subtotal_incl: line.price_subtotal || 0, // 采购订单行没有税后价格字段，使用税前价格
          date_planned: line.date_planned
        };
      })
    };

    return NextResponse.json({ order: orderDetail });
  } catch (e: any) {
    console.error('获取采购订单详情失败:', e);
    return NextResponse.json({ error: e?.message || '获取订单详情失败' }, { status: 500 });
  }
}

