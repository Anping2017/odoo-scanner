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

    const lotId = parseInt(params.id);
    if (isNaN(lotId)) {
      return NextResponse.json({ error: '无效的Lot/Serial ID' }, { status: 400 });
    }

    // 获取Lot/Serial基本信息
    const lotData = await rpc(
      '/web/dataset/call_kw',
      {
        model: 'stock.lot',
        method: 'read',
        args: [
          [lotId],
          [
            'id',
            'name',
            'product_id',
            'ref',
            'company_id',
            'create_date',
            'write_date',
            'expiration_date'
          ]
        ],
        kwargs: { context: ctx }
      },
      sessionId,
      base
    );

    if (!lotData || !Array.isArray(lotData) || lotData.length === 0) {
      return NextResponse.json({ error: 'Lot/Serial不存在或无法访问' }, { status: 404 });
    }

    const lot = lotData[0];
    const productId = lot.product_id?.[0];

    if (!productId) {
      return NextResponse.json({ error: 'Lot/Serial未关联产品' }, { status: 400 });
    }

    // 获取产品信息
    const productData = await rpc(
      '/web/dataset/call_kw',
      {
        model: 'product.product',
        method: 'read',
        args: [
          [productId],
          ['id', 'name', 'default_code', 'barcode']
        ],
        kwargs: { context: ctx }
      },
      sessionId,
      base
    ).catch(() => []);

    const product = productData?.[0] || null;

    // 获取库存信息（通过stock.quant）
    const quantData = await rpc(
      '/web/dataset/call_kw',
      {
        model: 'stock.quant',
        method: 'search_read',
        args: [
          [['lot_id', '=', lotId]],
          [
            'id',
            'product_id',
            'location_id',
            'quantity',
            'reserved_quantity',
            'available_quantity',
            'in_date',
            'expiration_date'
          ]
        ],
        kwargs: {
          context: ctx,
          limit: 1000
        }
      },
      sessionId,
      base
    ).catch(() => []);

    const quants = Array.isArray(quantData) ? quantData : [];

    // 获取库位信息
    const locationIds = [...new Set(quants.map((q: any) => q.location_id?.[0]).filter(Boolean))];
    let locationMap = new Map();
    if (locationIds.length > 0) {
      const locationData = await rpc(
        '/web/dataset/call_kw',
        {
          model: 'stock.location',
          method: 'read',
          args: [
            locationIds,
            ['id', 'name', 'complete_name', 'usage']
          ],
          kwargs: { context: ctx }
        },
        sessionId,
        base
      ).catch(() => []);

      if (Array.isArray(locationData)) {
        locationData.forEach((loc: any) => {
          locationMap.set(loc.id, loc);
        });
      }
    }

    // 组合库存信息
    const inventory = quants.map((q: any) => {
      const locationId = q.location_id?.[0];
      const location = locationMap.get(locationId);
      
      return {
        id: q.id,
        location_id: locationId,
        location_name: location?.name || q.location_id?.[1] || '未知位置',
        location_complete_name: location?.complete_name || q.location_id?.[1] || '未知位置',
        location_usage: location?.usage || 'unknown',
        quantity: q.quantity || 0,
        reserved_quantity: q.reserved_quantity || 0,
        available_quantity: q.available_quantity || 0,
        in_date: q.in_date || null,
        expiration_date: q.expiration_date || null
      };
    });

    // 计算总库存
    const totalQuantity = inventory.reduce((sum, inv) => sum + inv.quantity, 0);
    const totalReserved = inventory.reduce((sum, inv) => sum + inv.reserved_quantity, 0);
    const totalAvailable = inventory.reduce((sum, inv) => sum + inv.available_quantity, 0);

    // 组合Lot/Serial详情数据
    const lotSerialDetail = {
      lot: {
        id: lot.id,
        name: lot.name || '',
        ref: lot.ref || '',
        product_id: productId,
        product_name: product?.name || lot.product_id?.[1] || '未知产品',
        product_code: product?.default_code || '',
        product_barcode: product?.barcode || '',
        company_id: lot.company_id,
        create_date: lot.create_date,
        write_date: lot.write_date,
        expiration_date: lot.expiration_date || null
      },
      inventory: inventory,
      summary: {
        total_quantity: totalQuantity,
        total_reserved: totalReserved,
        total_available: totalAvailable,
        location_count: inventory.length
      }
    };

    return NextResponse.json({ lot_serial: lotSerialDetail });
  } catch (e: any) {
    console.error('获取Lot/Serial详情失败:', e);
    return NextResponse.json({ error: e?.message || '获取Lot/Serial详情失败' }, { status: 500 });
  }
}

