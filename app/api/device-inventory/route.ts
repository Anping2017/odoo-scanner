// /app/api/device-inventory/route.ts
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
  
  // 记录详细的响应信息
  console.log('RPC Response:', {
    url: `${url}${path}`,
    status: res.status,
    statusText: res.statusText,
    data: data,
    hasError: !!data.error
  });
  
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

    // 先获取有库存的Lot/Serial产品（通过stock.quant）
    console.log('Getting lots with stock from stock.quant');
    const quantsData = await rpc(
      base,
      '/web/dataset/call_kw',
      {
        model: 'stock.quant',
        method: 'search_read',
        args: [
          [
            ['lot_id', '!=', false], // 有Lot/Serial号的
            ['quantity', '>', 0], // 有库存的
            ['location_id.usage', '=', 'internal'], // 只显示Internal库位
          ],
          [
            'id',
            'product_id',
            'lot_id', 
            'location_id',
            'quantity',
            'reserved_quantity',
            'available_quantity'
          ]
        ],
        kwargs: { 
          limit: 1000, // 限制数量避免数据过大
          context: ctx 
        },
      },
      cookieStr
    );

    if (quantsData?.error) {
      console.error('Odoo API error details:', quantsData.error);
      const errorMessage = quantsData.error.message || quantsData.error.data?.message || JSON.stringify(quantsData.error);
      throw new Error(`Odoo API错误: ${errorMessage}`);
    }

    const quants = quantsData?.result || [];
    
    // 获取Lot详细信息
    const lotIds = [...new Set(quants.map((q: any) => q.lot_id[0]))];
    const lotsData = await rpc(
      base,
      '/web/dataset/call_kw',
      {
        model: 'stock.lot',
        method: 'read',
        args: [lotIds, ['id', 'name', 'ref', 'product_id', 'company_id']],
        kwargs: { context: ctx },
      },
      cookieStr
    );

    if (lotsData?.error) {
      console.error('Odoo API error details:', lotsData.error);
      const errorMessage = lotsData.error.message || lotsData.error.data?.message || JSON.stringify(lotsData.error);
      throw new Error(`Odoo API错误: ${errorMessage}`);
    }

    const lots = lotsData?.result || [];
    
    // 获取产品信息
    const productIds = [...new Set(quants.map((q: any) => q.product_id[0]))];
    const products = await rpc(
      base,
      '/web/dataset/call_kw',
      {
        model: 'product.product',
        method: 'read',
        args: [productIds, ['id', 'name', 'default_code', 'barcode']],
        kwargs: { context: ctx },
      },
      cookieStr
    );


    // 创建查找映射
    const productMap = new Map((products?.result || []).map((p: any) => [p.id, p]));
    const lotMap = new Map((lots || []).map((l: any) => [l.id, l]));

    // 组合数据 - 使用stock.quant数据 + Lot详细信息
    const deviceInventory = quants.map((quant: any) => {
      const product = productMap.get(quant.product_id[0]);
      const lot = lotMap.get(quant.lot_id[0]);
      
      // 使用Lot的name作为序列号
      const lotSerialNumber = lot?.name || `LOT-${quant.lot_id[0]}`;
      
      // 添加详细调试信息
      console.log('Quant ID:', quant.id);
      console.log('Lot ID:', quant.lot_id[0]);
      console.log('Lot object:', lot);
      console.log('Lot name:', lot?.name);
      console.log('Lot ref:', lot?.ref);
      console.log('Final serial number:', lotSerialNumber);
      console.log('Quantity:', quant.quantity);
      
      return {
        id: quant.id,
        product_id: quant.product_id[0],
        product_name: product?.name || '未知产品',
        product_code: product?.default_code || '',
        product_barcode: product?.barcode || '',
        lot_id: quant.lot_id[0],
        lot_name: lotSerialNumber,
        lot_ref: lot?.ref || '',
        location_id: quant.location_id[0],
        location_name: 'Internal库位',
        location_complete_name: 'Internal库位',
        quantity: quant.quantity,
        reserved_quantity: quant.reserved_quantity,
        available_quantity: quant.available_quantity,
        // 用于扫码匹配的标识
        scan_key: `${product?.barcode || ''}-${lotSerialNumber}`.replace(/^-/, ''),
      };
    });

    return NextResponse.json({ 
      devices: deviceInventory,
      total: deviceInventory.length 
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '查询失败' }, { status: 500 });
  }
}
