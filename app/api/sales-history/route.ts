// /app/api/sales-history/route.ts
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

    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('product_id');
    const period = searchParams.get('period') || '30';

    if (!productId) {
      return NextResponse.json({ error: '缺少产品ID' }, { status: 400 });
    }

    // 获取POS销售记录
    const allSales = [];
    
    try {
      // 步骤1: 获取POS订单行
      const posData = await rpc(base, '/web/dataset/call_kw', {
        model: 'pos.order.line',
        method: 'search_read',
        args: [
          [['product_id', '=', parseInt(productId)]],
          ['id', 'order_id', 'product_id', 'qty', 'price_unit', 'price_subtotal']
        ],
        kwargs: { 
          limit: 50,
          context: ctx 
        }
      }, cookieStr);

      if (posData?.error) {
        throw new Error(`POS查询失败: ${posData.error.message || JSON.stringify(posData.error)}`);
      }

      const posLines = posData?.result || [];
      if (posLines.length > 0) {
        // 步骤2: 获取订单信息
        const orderIds = [...new Set(posLines.map((line: any) => line.order_id[0]))];
        const ordersData = await rpc(base, '/web/dataset/call_kw', {
          model: 'pos.order',
          method: 'search_read',
          args: [
            [['id', 'in', orderIds]],
            ['id', 'name', 'date_order', 'partner_id']
          ],
          kwargs: { 
            context: ctx 
          }
        }, cookieStr);

        const orderMap = new Map();
        if (!ordersData?.error && ordersData?.result) {
          ordersData.result.forEach((order: any) => {
            orderMap.set(order.id, order);
          });
        }

        // 步骤3: 组合数据
        const posSales = posLines.map((sale: any) => {
          const order = orderMap.get(sale.order_id[0]);
          return {
            id: sale.id,
            order_name: order?.name || `POS-${sale.order_id[0]}`,
            order_id: sale.order_id[0],
            date: order?.date_order || '未知日期',
            customer: order?.partner_id?.[1] || 'POS客户',
            quantity: sale.qty,
            unit_price: sale.price_unit,
            total_amount: sale.price_subtotal,
            product_id: sale.product_id[0],
            type: 'POS'
          };
        });
        
        allSales.push(...posSales);
      }
    } catch (e) {
      console.log('POS查询失败:', e);
    }

    // 按日期排序并限制数量
    const salesHistory = allSales
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 50);

    return NextResponse.json({
      salesHistory,
      period,
      totalCount: salesHistory.length,
      dateRange: {
        start: 'all',
        end: 'all'
      }
    });

  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '获取销售记录失败' }, { status: 500 });
  }
}