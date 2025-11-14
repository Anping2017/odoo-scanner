// /app/api/sales-history/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { resolvePreset } from '@/lib/odooPresets';
import { rpc, getBaseFromCookie, getDbFromCookie, getSessionId } from '@/app/api/_odoo';

export const dynamic = 'force-dynamic';

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

    // 获取POS销售记录（带分页）
    // 在多公司环境中，需要确保只查询当前公司的订单
    const allSales = [];
    const offset = (page - 1) * pageSize;
    let companyOrderIds: number[] = []; // 在外部定义，以便在获取总数时使用
    
    try {
      // 构建查询条件：产品ID + 公司过滤
      let lineDomain: any[] = [['product_id', '=', parseInt(productId)]];
      
      // 在多公司环境中，通过order_id.company_id过滤订单行
      if (companyId) {
        // 先获取属于当前公司的订单ID（用于过滤订单行）
        // 注意：这里使用search而不是search_read以提高性能
        const orderIdsResult = await rpc('/web/dataset/call_kw', {
          model: 'pos.order',
          method: 'search',
          args: [[['company_id', '=', companyId]]],
          kwargs: { 
            limit: 50000, // 限制最大订单数，避免性能问题
            context: ctx 
          }
        }, sessionId, base).catch(() => []);
        
        if (Array.isArray(orderIdsResult) && orderIdsResult.length > 0) {
          companyOrderIds = orderIdsResult;
          lineDomain.push(['order_id', 'in', companyOrderIds]);
        } else {
          // 如果没有找到属于当前公司的订单，直接返回空结果
          return NextResponse.json({
            salesHistory: [],
            total: 0,
            page: page,
            pageSize: pageSize,
            totalPages: 0
          });
        }
      }
      
      // 步骤1: 获取POS订单行（带分页，已过滤公司）
      const posData = await rpc('/web/dataset/call_kw', {
        model: 'pos.order.line',
        method: 'search_read',
        args: [
          lineDomain,
          ['id', 'order_id', 'product_id', 'qty', 'price_unit', 'price_subtotal']
        ],
        kwargs: { 
          limit: pageSize,
          offset: offset,
          order: 'id desc',
          context: ctx 
        }
      }, sessionId, base);

      const posLines = Array.isArray(posData) ? posData : [];
      if (posLines.length > 0) {
        // 步骤2: 获取订单信息
        // 使用read方法批量获取，即使某些订单无法访问也不会报错
        const lineOrderIds = [...new Set(posLines.map((line: any) => line.order_id?.[0]).filter(Boolean))];
        if (lineOrderIds.length > 0) {
          // 如果有多公司过滤，只读取属于当前公司的订单
          const orderIdsToRead = companyId 
            ? lineOrderIds.filter(id => companyOrderIds.includes(id))
            : lineOrderIds;
          
          if (orderIdsToRead.length > 0) {
            const ordersData = await rpc('/web/dataset/call_kw', {
              model: 'pos.order',
              method: 'read',
              args: [orderIdsToRead, ['id', 'name', 'date_order', 'partner_id', 'company_id']],
              kwargs: { 
                context: ctx 
              }
            }, sessionId, base).catch(() => []);

            const orderMap = new Map();
            if (Array.isArray(ordersData)) {
              ordersData.forEach((order: any) => {
                // 再次确认订单属于当前公司（双重检查，确保数据安全）
                if (!companyId || !order.company_id || order.company_id[0] === companyId) {
                  orderMap.set(order.id, order);
                }
              });
            }

            // 步骤3: 组合数据（只包含订单信息可访问的订单行）
            const posSales = posLines
              .filter((sale: any) => {
                const orderId = sale.order_id?.[0];
                return orderId && orderMap.has(orderId);
              })
              .map((sale: any) => {
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
                  product_id: sale.product_id?.[0] || sale.product_id,
                  type: 'POS'
                };
              });
            
            allSales.push(...posSales);
          }
        }
      }
    } catch (e) {
      console.error('POS查询失败:', e);
    }

    // 获取总记录数（需要考虑公司过滤）
    let totalCount = 0;
    try {
      let countDomain: any[] = [['product_id', '=', parseInt(productId)]];
      
      // 如果有多公司过滤，需要应用相同的过滤条件
      if (companyId && companyOrderIds.length > 0) {
        countDomain.push(['order_id', 'in', companyOrderIds]);
      }
      
      const countData = await rpc('/web/dataset/call_kw', {
        model: 'pos.order.line',
        method: 'search_count',
        args: [countDomain],
        kwargs: {
          context: ctx
        }
      }, sessionId, base).catch(() => 0);
      totalCount = countData || 0;
    } catch (e) {
      console.error('获取总数失败:', e);
      totalCount = allSales.length;
    }

    // 按日期排序
    const salesHistory = allSales
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({
      salesHistory,
      total: totalCount,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(totalCount / pageSize)
    });

  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '获取销售记录失败' }, { status: 500 });
  }
}