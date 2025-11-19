import { NextRequest, NextResponse } from 'next/server';
import { rpc, getBaseFromCookie, getDbFromCookie, getSessionId } from '@/app/api/_odoo';

// 强制动态渲染
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const productId = req.nextUrl.searchParams.get('product_id');
    if (!productId) {
      return NextResponse.json({ error: 'product_id required' }, { status: 400 });
    }

    const productIdNum = parseInt(productId);
    if (isNaN(productIdNum)) {
      return NextResponse.json({ error: 'Invalid product_id' }, { status: 400 });
    }

    let base: string;
    let db: string;
    let sessionId: string | undefined;
    
    try {
      base = getBaseFromCookie(req);
      db = getDbFromCookie(req);
      sessionId = getSessionId(req);
    } catch (authError: any) {
      return NextResponse.json({ error: authError?.message || '未登录' }, { status: 401 });
    }

    if (!base || !db || !sessionId) {
      return NextResponse.json({ error: '未登录或会话已过期' }, { status: 401 });
    }

    const ck = req.cookies;
    const ctx: any = {};
    const companyId = Number(ck.get('od_company')?.value || 0) || undefined;
    if (companyId) {
      ctx.company_id = companyId;
      ctx.allowed_company_ids = [companyId];
    }

    // 获取产品大图（image_1920）
    // 注意：rpc函数返回的是data.result，不是整个data对象
    let products: any[];
    try {
      products = await rpc(
        '/web/dataset/call_kw',
        {
          model: 'product.product',
          method: 'read',
          args: [
            [productIdNum],
            ['image_1920']
          ],
          kwargs: { context: ctx },
        },
        sessionId,
        base
      );
    } catch (rpcError: any) {
      console.error('RPC调用失败:', rpcError);
      return NextResponse.json({ error: rpcError?.message || 'RPC调用失败' }, { status: 500 });
    }

    // 检查返回结果（rpc函数已经返回了result数组）
    if (!products || !Array.isArray(products) || products.length === 0) {
      console.warn(`产品 ${productIdNum} 不存在或无法访问`);
      return NextResponse.json({ error: '产品不存在或无法访问' }, { status: 404 });
    }

    const product = products[0];
    if (!product) {
      return NextResponse.json({ error: '产品数据格式错误' }, { status: 500 });
    }

    // 如果产品存在但没有大图，返回null（前端会继续使用小图）
    return NextResponse.json({ 
      image_1920: product.image_1920 || null 
    });
  } catch (e: any) {
    console.error('获取产品图片失败:', e);
    return NextResponse.json({ error: e?.message || '获取图片失败' }, { status: 500 });
  }
}

