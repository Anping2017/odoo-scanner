import { NextRequest, NextResponse } from 'next/server';
import { resolvePreset } from '@/lib/odooPresets';

// 强制动态渲染，因为使用了 searchParams
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
    const code = req.nextUrl.searchParams.get('code')?.trim();
    const highResImage = req.nextUrl.searchParams.get('high_res_image') === 'true';
    if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });

    // 使用 req.cookies 而不是 cookies()
    const ck = req.cookies;
    
    // 使用 req.headers 而不是 headers()
    const hostHdr = req.headers.get('x-forwarded-host') || req.headers.get('host') || undefined;
    const preset = resolvePreset(hostHdr);

    const base = ck.get('od_base')?.value || preset?.url || req.nextUrl.searchParams.get('baseUrl') || undefined;
    const db = ck.get('od_db')?.value || preset?.db || req.nextUrl.searchParams.get('dbName') || undefined;
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

    // 先获取基础字段
    const baseFields = ['id', 'name', 'barcode', 'default_code', 'qty_available', 'free_qty', 'list_price', 'standard_price'];
    const imageField = highResImage ? 'image_1920' : 'image_128';
    
    const data = await rpc(
      base,
      '/web/dataset/call_kw',
      {
        model: 'product.product',
        method: 'search_read',
        args: [
          [
            '|', // OR 条件
            ['barcode', '=', code],
            ['default_code', '=', code],
          ],
          [...baseFields, imageField],
        ],
        kwargs: { limit: 1, context: ctx },
      },
      cookieStr
    );

    let product = data?.result?.[0] || null;
    
    if (data?.error) {
      const errorMessage = data.error.message || data.error.data?.message || JSON.stringify(data.error);
      throw new Error(`Odoo API错误: ${errorMessage}`);
    }
    
    // 如果找到产品，尝试获取自定义字段
    if (product) {
      try {
        const customData = await rpc(
          base,
          '/web/dataset/call_kw',
          {
            model: 'product.product',
            method: 'read',
            args: [
              [product.id],
              ['raytech_stock', 'raytech_p3']
            ],
            kwargs: { context: ctx },
          },
          cookieStr
        );
        
        // 合并自定义字段到产品数据
        if (customData?.result?.[0]) {
          product = { ...product, ...customData.result[0] };
        }
      } catch (customError) {
        // 设置默认值，避免前端显示错误
        product.raytech_stock = null;
        product.raytech_p3 = null;
      }
    }
    return NextResponse.json({ product, companyId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '查询失败' }, { status: 500 });
  }
}