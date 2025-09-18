// /app/api/test-pos-sales/route.ts
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

    if (!productId) {
      return NextResponse.json({ error: '缺少产品ID' }, { status: 400 });
    }

    // 测试1: 获取所有POS订单行（不限制产品）
    const allPosLines = await rpc(base, '/web/dataset/call_kw', {
      model: 'pos.order.line',
      method: 'search_read',
      args: [
        [['id', '>', 0]], // 获取所有记录
        ['id', 'product_id', 'qty', 'price_unit', 'order_id']
      ],
      kwargs: { 
        limit: 10,
        context: ctx 
      }
    }, cookieStr);

    // 测试2: 获取指定产品的POS订单行（不限制日期）
    const productPosLines = await rpc(base, '/web/dataset/call_kw', {
      model: 'pos.order.line',
      method: 'search_read',
      args: [
        [['product_id', '=', parseInt(productId)]], // 只限制产品
        ['id', 'product_id', 'qty', 'price_unit', 'order_id', 'order_id.name', 'order_id.date_order']
      ],
      kwargs: { 
        limit: 10,
        context: ctx 
      }
    }, cookieStr);

    // 测试3: 获取所有POS订单（不限制产品）
    const allPosOrders = await rpc(base, '/web/dataset/call_kw', {
      model: 'pos.order',
      method: 'search_read',
      args: [
        [['id', '>', 0]], // 获取所有记录
        ['id', 'name', 'date_order', 'state', 'amount_total']
      ],
      kwargs: { 
        limit: 10,
        context: ctx 
      }
    }, cookieStr);

    return NextResponse.json({
      tests: {
        allPosLines: {
          error: allPosLines?.error,
          count: allPosLines?.result?.length || 0,
          sample: allPosLines?.result?.slice(0, 3),
          hasData: (allPosLines?.result?.length || 0) > 0
        },
        productPosLines: {
          error: productPosLines?.error,
          count: productPosLines?.result?.length || 0,
          sample: productPosLines?.result?.slice(0, 3),
          hasData: (productPosLines?.result?.length || 0) > 0
        },
        allPosOrders: {
          error: allPosOrders?.error,
          count: allPosOrders?.result?.length || 0,
          sample: allPosOrders?.result?.slice(0, 3),
          hasData: (allPosOrders?.result?.length || 0) > 0
        }
      },
      summary: {
        hasAnyPosData: (allPosLines?.result?.length || 0) > 0 || (allPosOrders?.result?.length || 0) > 0,
        hasProductPosData: (productPosLines?.result?.length || 0) > 0,
        totalPosLines: allPosLines?.result?.length || 0,
        totalPosOrders: allPosOrders?.result?.length || 0,
        productPosLines: productPosLines?.result?.length || 0
      },
      debug: {
        productId,
        companyId,
        context: ctx
      }
    });

  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '测试失败' }, { status: 500 });
  }
}
