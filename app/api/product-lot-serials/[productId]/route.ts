import { NextRequest, NextResponse } from 'next/server';
import { rpc, getBaseFromCookie, getDbFromCookie, getSessionId } from '@/app/api/_odoo';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { productId: string } }
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

    const productId = parseInt(params.productId);
    if (isNaN(productId)) {
      return NextResponse.json({ error: '无效的产品ID' }, { status: 400 });
    }

    // 获取查询参数：是否包含不在库的Lot/Serial（quantity = 0或负数）
    const includeZero = req.nextUrl.searchParams.get('include_zero') === 'true';

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
    );

    if (!productData || !Array.isArray(productData) || productData.length === 0) {
      return NextResponse.json({ error: '产品不存在或无法访问' }, { status: 404 });
    }

    const product = productData[0];

    // 首先，直接通过stock.lot查找该产品的所有Lot（最直接的方法）
    // 这样可以确保获取到所有Lot，即使没有库存记录
    let allLotIds: number[] = [];
    try {
      // 方法1: 直接通过product_id查询
      const lotData1 = await rpc(
        '/web/dataset/call_kw',
        {
          model: 'stock.lot',
          method: 'search_read',
          args: [
            [
              ['product_id', '=', productId]
            ],
            ['id', 'name', 'product_id', 'company_id']
          ],
          kwargs: {
            context: ctx,
            limit: 10000
          }
        },
        sessionId,
        base
      ).catch((e) => {
        console.error('方法1查询Lot失败:', e);
        return [];
      });
      
      if (Array.isArray(lotData1) && lotData1.length > 0) {
        allLotIds = lotData1.map((lot: any) => lot.id).filter(Boolean);
        console.log(`方法1找到 ${allLotIds.length} 个Lot`);
      }
      
      // 如果方法1没有找到，尝试方法2: 通过stock.quant反向查找
      if (allLotIds.length === 0) {
        console.log('方法1未找到Lot，尝试方法2: 通过stock.quant查找');
        const quantDataForLot = await rpc(
          '/web/dataset/call_kw',
          {
            model: 'stock.quant',
            method: 'search_read',
            args: [
              [
                ['product_id', '=', productId],
                ['lot_id', '!=', false]
              ],
              ['lot_id']
            ],
            kwargs: {
              context: ctx,
              limit: 10000
            }
          },
          sessionId,
          base
        ).catch((e) => {
          console.error('方法2查询quant失败:', e);
          return [];
        });
        
        if (Array.isArray(quantDataForLot) && quantDataForLot.length > 0) {
          const lotIdsFromQuant = [...new Set(quantDataForLot.map((q: any) => q.lot_id?.[0]).filter(Boolean))];
          if (lotIdsFromQuant.length > 0) {
            // 获取这些Lot的详细信息
            const lotData2 = await rpc(
              '/web/dataset/call_kw',
              {
                model: 'stock.lot',
                method: 'read',
                args: [
                  lotIdsFromQuant,
                  ['id', 'name', 'product_id']
                ],
                kwargs: { context: ctx }
              },
              sessionId,
              base
            ).catch((e) => {
              console.error('方法2读取Lot详情失败:', e);
              return [];
            });
            
            if (Array.isArray(lotData2) && lotData2.length > 0) {
              // 过滤出确实是该产品的Lot
              const validLotIds = lotData2
                .filter((lot: any) => lot.product_id && (lot.product_id[0] === productId || lot.product_id === productId))
                .map((lot: any) => lot.id);
              allLotIds = validLotIds;
              console.log(`方法2找到 ${allLotIds.length} 个Lot`);
            }
          }
        }
      }
      
      // 如果还是没找到，尝试方法3: 通过stock.move.line查找
      if (allLotIds.length === 0) {
        console.log('方法2未找到Lot，尝试方法3: 通过stock.move.line查找');
        const moveLineData = await rpc(
          '/web/dataset/call_kw',
          {
            model: 'stock.move.line',
            method: 'search_read',
            args: [
              [
                ['product_id', '=', productId],
                ['lot_id', '!=', false]
              ],
              ['lot_id']
            ],
            kwargs: {
              context: ctx,
              limit: 10000
            }
          },
          sessionId,
          base
        ).catch((e) => {
          console.error('方法3查询move.line失败:', e);
          return [];
        });
        
        if (Array.isArray(moveLineData) && moveLineData.length > 0) {
          const lotIdsFromMoveLine = [...new Set(moveLineData.map((ml: any) => ml.lot_id?.[0]).filter(Boolean))];
          if (lotIdsFromMoveLine.length > 0) {
            allLotIds = lotIdsFromMoveLine;
            console.log(`方法3找到 ${allLotIds.length} 个Lot`);
          }
        }
      }
      
      console.log(`最终找到 ${allLotIds.length} 个Lot for product ${productId}`);
    } catch (e) {
      console.error('获取Lot列表失败:', e);
    }
    
    if (allLotIds.length === 0) {
      console.log(`产品 ${productId} 没有找到任何Lot/Serial`);
      return NextResponse.json({
        product: {
          id: product.id,
          name: product.name || '',
          code: product.default_code || '',
          barcode: product.barcode || ''
        },
        lot_serials: []
      });
    }

     // 获取该产品的所有Lot/Serial库存信息
     // 方法1: 通过stock.quant查询（这是主要的库存记录）
     const quantDomain: any[] = [
       ['product_id', '=', productId],
       ['lot_id', 'in', allLotIds] // 只查询这些Lot的库存
     ];
     
     // 注意：即使include_zero=false，我们也需要获取所有quant记录来计算total_quantity
     // 只有在最终返回时才过滤掉total_quantity=0的Lot
     
     const quantData = await rpc(
       '/web/dataset/call_kw',
       {
         model: 'stock.quant',
         method: 'search_read',
         args: [
           quantDomain,
           [
             'id',
             'lot_id',
             'location_id',
             'quantity',
             'reserved_quantity',
             'available_quantity',
             'in_date'
           ]
         ],
         kwargs: {
           context: ctx,
           limit: 10000
         }
       },
       sessionId,
       base
     ).catch(() => []);

     const quants = Array.isArray(quantData) ? quantData : [];
     console.log(`查询到 ${quants.length} 条quant记录`);
     if (quants.length > 0) {
       console.log('quant记录示例:', JSON.stringify(quants[0], null, 2));
     }
    
    // 确定要获取详细信息的Lot ID列表
    // 如果include_zero为true，获取所有Lot；如果为false，只获取有库存的Lot
    const lotIdsFromQuants = [...new Set(quants.map((q: any) => q.lot_id?.[0]).filter(Boolean))];
    const lotIdsToFetch = includeZero ? allLotIds : lotIdsFromQuants;
    
    if (lotIdsToFetch.length === 0) {
      return NextResponse.json({
        product: {
          id: product.id,
          name: product.name || '',
          code: product.default_code || '',
          barcode: product.barcode || ''
        },
        lot_serials: []
      });
    }
    
    // 获取Lot详细信息
    console.log(`准备读取 ${lotIdsToFetch.length} 个Lot的详细信息，Lot IDs:`, lotIdsToFetch);
    
     // 方法1: 使用read方法，尝试读取product_qty字段
     let lotData = await rpc(
       '/web/dataset/call_kw',
       {
         model: 'stock.lot',
         method: 'read',
         args: [
           lotIdsToFetch,
           [
             'id',
             'name',
             'ref',
             'create_date',
             'write_date',
             'product_qty' // 尝试读取product_qty字段
           ]
         ],
         kwargs: { context: ctx }
       },
       sessionId,
       base
     ).catch(async (e) => {
       console.error('read方法读取Lot详细信息失败:', e);
       // 如果product_qty字段不存在，尝试不包含该字段
       if (e?.message?.includes('product_qty')) {
         console.log('product_qty字段不存在，尝试不包含该字段');
         try {
           return await rpc(
             '/web/dataset/call_kw',
             {
               model: 'stock.lot',
               method: 'read',
               args: [
                 lotIdsToFetch,
                 [
                   'id',
                   'name',
                   'ref',
                   'create_date',
                   'write_date'
                 ]
               ],
               kwargs: { context: ctx }
             },
             sessionId,
             base
           );
         } catch (e2) {
           console.error('read方法（不含product_qty）也失败:', e2);
           return [];
         }
       }
       return [];
     });

    console.log('read方法返回的数据:', JSON.stringify(lotData, null, 2));
    let lots = Array.isArray(lotData) ? lotData : [];
    console.log(`read方法成功读取 ${lots.length} 个Lot的详细信息`);
    
    // 如果read方法返回空，尝试使用search_read方法
    if (lots.length === 0 && lotIdsToFetch.length > 0) {
      console.log('read方法返回空，尝试使用search_read方法');
      try {
         const lotData2 = await rpc(
           '/web/dataset/call_kw',
           {
             model: 'stock.lot',
             method: 'search_read',
             args: [
               [['id', 'in', lotIdsToFetch]],
               [
                 'id',
                 'name',
                 'ref',
                 'create_date',
                 'write_date',
                 'product_qty' // 尝试读取product_qty字段
               ]
             ],
             kwargs: { context: ctx, limit: 10000 }
           },
           sessionId,
           base
         ).catch((e) => {
           console.error('search_read方法读取Lot详细信息失败:', e);
           // 如果product_qty字段不存在，尝试不包含该字段
           if (e?.message?.includes('product_qty')) {
             console.log('product_qty字段不存在，尝试不包含该字段');
             return rpc(
               '/web/dataset/call_kw',
               {
                 model: 'stock.lot',
                 method: 'search_read',
                 args: [
                   [['id', 'in', lotIdsToFetch]],
                   [
                     'id',
                     'name',
                     'ref',
                     'create_date',
                     'write_date'
                   ]
                 ],
                 kwargs: { context: ctx, limit: 10000 }
               },
               sessionId,
               base
             ).catch(() => []);
           }
           return [];
         });
        
        console.log('search_read方法返回的数据:', JSON.stringify(lotData2, null, 2));
        const lots2 = Array.isArray(lotData2) ? lotData2 : [];
        console.log(`search_read方法成功读取 ${lots2.length} 个Lot的详细信息`);
        
        if (lots2.length > 0) {
          lots = lots2;
        } else {
          console.error(`警告: 两种方法都无法读取Lot。请求读取 ${lotIdsToFetch.length} 个Lot，但返回了0个。可能的原因：权限问题、Lot不存在、或公司过滤问题`);
        }
      } catch (e) {
        console.error('search_read方法也失败:', e);
      }
    }
    
    const lotMap = new Map(lots.map((l: any) => [l.id, l]));
    console.log('lotMap创建完成，大小:', lotMap.size);

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

    // 先为所有Lot创建条目（包括没有quant记录的）
    const lotSerialMap = new Map<number, {
      lot: any;
      inventory: any[];
      summary: {
        total_quantity: number;
        total_reserved: number;
        total_available: number;
        location_count: number;
        in_stock: boolean; // 是否在库
      };
    }>();

    // 为所有Lot创建基础条目（使用lotIdsToFetch，确保所有Lot都有条目）
    console.log(`准备创建 ${lotIdsToFetch.length} 个Lot条目`);
    console.log('lotIdsToFetch:', lotIdsToFetch);
    console.log('lotMap大小:', lotMap.size);
    console.log('lotMap中的ID:', Array.from(lotMap.keys()));
    
    lotIdsToFetch.forEach((lotId) => {
      const lot = lotMap.get(lotId);
      if (!lot) {
        console.warn(`Lot ID ${lotId} 在lotMap中不存在，跳过`);
        return;
      }

       // 如果lot有product_qty字段，使用它作为初始库存
       const initialQty = lot.product_qty !== undefined ? Number(lot.product_qty) || 0 : 0;
       
       lotSerialMap.set(lotId, {
         lot: {
           id: lot.id,
           name: lot.name || '',
           ref: lot.ref || '',
           create_date: lot.create_date,
           write_date: lot.write_date,
           product_qty: initialQty
         },
         inventory: [],
         summary: {
           total_quantity: initialQty, // 使用product_qty作为初始值
           total_reserved: 0,
           total_available: 0,
           location_count: 0,
           in_stock: false
         }
       });
    });
    
    console.log(`成功创建 ${lotSerialMap.size} 个Lot条目`);

     // 处理quant数据 - 累加每个Lot的所有库存记录
     quants.forEach((q: any) => {
       const lotId = q.lot_id?.[0];
       if (!lotId) return;

       const lotSerial = lotSerialMap.get(lotId);
       if (!lotSerial) return;

       const locationId = q.location_id?.[0];
       const location = locationMap.get(locationId);
       const locationUsage = location?.usage || 'unknown';

       // 只统计内部库位（internal）的库存，排除客户库位（customer）、供应商库位（supplier）等
       const isInternalLocation = locationUsage === 'internal';
       
       lotSerial.inventory.push({
         id: q.id,
         location_id: locationId,
         location_name: location?.name || q.location_id?.[1] || '未知位置',
         location_complete_name: location?.complete_name || q.location_id?.[1] || '未知位置',
         location_usage: locationUsage,
         quantity: q.quantity || 0,
         reserved_quantity: q.reserved_quantity || 0,
         available_quantity: q.available_quantity || 0,
         in_date: q.in_date || null
       });

       // 更新汇总 - 只累加内部库位的库存（quantity > 0 且 location_usage = 'internal'）
       if (isInternalLocation) {
         const qty = Number(q.quantity) || 0;
         // 只累加正数库存
         if (qty > 0) {
           lotSerial.summary.total_quantity += qty;
           lotSerial.summary.total_reserved += Number(q.reserved_quantity) || 0;
           lotSerial.summary.total_available += Number(q.available_quantity) || 0;
         }
       }
     });

     // 更新每个Lot的location_count和in_stock状态
     lotSerialMap.forEach((lotSerial) => {
       lotSerial.summary.location_count = lotSerial.inventory.length;
       
       // 判断是否在库：
       // 1. 如果lot有product_qty字段，优先使用product_qty
       // 2. 否则使用累加的total_quantity
       let finalQuantity = lotSerial.summary.total_quantity;
       if (lotSerial.lot.product_qty !== undefined) {
         finalQuantity = Number(lotSerial.lot.product_qty) || 0;
         // 如果product_qty存在，使用它作为最终数量
         lotSerial.summary.total_quantity = finalQuantity;
       }
       
       // 判断是否在库：总库存大于0（有库存就是在库，没库存就是不在库）
       lotSerial.summary.in_stock = finalQuantity > 0;
       
       console.log(`Lot ${lotSerial.lot.name} (ID: ${lotSerial.lot.id}): product_qty=${lotSerial.lot.product_qty}, total_quantity=${lotSerial.summary.total_quantity}, in_stock=${lotSerial.summary.in_stock}`);
     });

    // 转换为数组
    const lotSerials = Array.from(lotSerialMap.values());
    
    console.log(`准备返回 ${lotSerials.length} 个Lot/Serial`);
    console.log('Lot/Serial数据示例:', JSON.stringify(lotSerials[0] || {}, null, 2));

    const responseData = {
      product: {
        id: product.id,
        name: product.name || '',
        code: product.default_code || '',
        barcode: product.barcode || ''
      },
      lot_serials: lotSerials
    };
    
    console.log('返回的完整数据结构:', JSON.stringify({
      product: responseData.product,
      lot_serials_count: responseData.lot_serials.length
    }, null, 2));

    return NextResponse.json(responseData);
  } catch (e: any) {
    console.error('获取产品Lot/Serial信息失败:', e);
    return NextResponse.json({ error: e?.message || '获取Lot/Serial信息失败' }, { status: 500 });
  }
}

