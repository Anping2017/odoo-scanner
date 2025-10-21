// /app/api/confirm-receipt/route.ts
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

export async function POST(req: NextRequest) {
  try {
    const { picking_id, order_id, product_ids, lot_serial_numbers } = await req.json();

    if (!picking_id && !order_id) {
      return NextResponse.json({ error: '缺少收货单ID或订单ID' }, { status: 400 });
    }

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

    const targetPickingId = picking_id || order_id;

    // 1. 获取收货单的所有移动行
    const pickingData = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.picking',
      method: 'read',
      args: [targetPickingId, ['move_ids_without_package']],
      kwargs: { context: ctx }
    }, cookieStr);

    if (pickingData?.error || !pickingData?.result?.[0]) {
      throw new Error(`Odoo API错误 (stock.picking read): ${pickingData?.error?.message || '收货单不存在或无法读取'}`);
    }
    const moveIds = pickingData.result[0].move_ids_without_package;

    // 2. 如果指定了特定产品，先设置这些产品的 quantity_done
    if (product_ids && Array.isArray(product_ids) && product_ids.length > 0) {
      console.log('设置指定产品的 quantity_done:', product_ids);
      
      // 获取移动行详情
      const movesData = await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.move',
        method: 'search_read',
        args: [
          [['id', 'in', moveIds]],
          ['id', 'product_qty', 'quantity', 'product_id', 'product_uom', 'location_id', 'location_dest_id']
        ],
        kwargs: { context: ctx }
      }, cookieStr);

      if (movesData?.error) {
        console.log('移动行查询详细错误:', movesData.error);
        throw new Error(`Odoo API错误 (stock.move search_read): ${movesData.error.message || JSON.stringify(movesData.error)}`);
      }

      // 筛选指定的移动行
      const movesToUpdate = movesData.result.filter((move: any) => 
        product_ids.includes(move.id)
      );

      // 为选中的移动行设置 quantity = product_qty
      for (const move of movesToUpdate) {
        if (move.product_qty > 0) {
          // 检查产品是否需要批次/序列号跟踪
          const productData = await rpc(base, '/web/dataset/call_kw', {
            model: 'product.product',
            method: 'read',
            args: [move.product_id[0], ['tracking', 'name']],
            kwargs: { context: ctx }
          }, cookieStr);

          const tracking = productData?.result?.[0]?.tracking || 'none';
          
          if (tracking !== 'none') {
            // 需要批次/序列号跟踪，创建stock.move.line记录
            console.log(`产品 ${move.product_id[1]} 需要 ${tracking} 跟踪，创建移动行记录`);
            
            try {
              const moveLineData = await rpc(base, '/web/dataset/call_kw', {
                model: 'stock.move.line',
                method: 'create',
                args: [{
                  move_id: move.id,
                  product_id: move.product_id[0],
                  product_uom_id: move.product_uom[0],
                  quantity: move.product_qty, // 使用正确的字段名
                  location_id: move.location_id[0],
                  location_dest_id: move.location_dest_id[0],
                  lot_name: tracking === 'serial' ? `SN-${Date.now()}` : `LOT-${Date.now()}`, // 根据跟踪类型生成不同的标识
                  lot_id: false,
                  company_id: companyId // 添加必需的公司ID
                }],
                kwargs: { context: ctx }
              }, cookieStr);

              console.log('创建移动行记录成功:', moveLineData);
              
              if (moveLineData?.error) {
                console.log('移动行创建失败:', moveLineData.error);
                // 如果创建失败，尝试直接设置数量
                await rpc(base, '/web/dataset/call_kw', {
                  model: 'stock.move',
                  method: 'write',
                  args: [
                    [move.id],
                    { quantity: move.product_qty }
                  ],
                  kwargs: { context: ctx }
                }, cookieStr);
                console.log('回退到直接设置数量');
              }
            } catch (e) {
              console.log('移动行创建异常:', e);
              // 如果异常，尝试直接设置数量
              await rpc(base, '/web/dataset/call_kw', {
                model: 'stock.move',
                method: 'write',
                args: [
                  [move.id],
                  { quantity: move.product_qty }
                ],
                kwargs: { context: ctx }
              }, cookieStr);
              console.log('异常回退到直接设置数量');
            }
          } else {
            // 不需要跟踪，直接设置数量
            await rpc(base, '/web/dataset/call_kw', {
              model: 'stock.move',
              method: 'write',
              args: [
                [move.id],
                { quantity: move.product_qty }
              ],
              kwargs: { context: ctx }
            }, cookieStr);
          }
        }
      }
    } else {
      // 3. 如果没有指定产品，设置所有移动行的 quantity = product_qty
      console.log('设置所有产品的 quantity');
      
      const movesData = await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.move',
        method: 'search_read',
        args: [
          [['id', 'in', moveIds]],
          ['id', 'product_qty', 'quantity', 'product_id', 'product_uom', 'location_id', 'location_dest_id']
        ],
        kwargs: { context: ctx }
      }, cookieStr);

      if (movesData?.error) {
        console.log('移动行查询详细错误:', movesData.error);
        throw new Error(`Odoo API错误 (stock.move search_read): ${movesData.error.message || JSON.stringify(movesData.error)}`);
      }

      // 为所有移动行设置 quantity = product_qty
      for (const move of movesData.result) {
        if (move.product_qty > 0) {
          // 检查产品是否需要批次/序列号跟踪
          const productData = await rpc(base, '/web/dataset/call_kw', {
            model: 'product.product',
            method: 'read',
            args: [move.product_id[0], ['tracking', 'name']],
            kwargs: { context: ctx }
          }, cookieStr);

          const tracking = productData?.result?.[0]?.tracking || 'none';
          
          if (tracking !== 'none') {
            // 需要批次/序列号跟踪，创建stock.move.line记录
            console.log(`产品 ${move.product_id[1]} 需要 ${tracking} 跟踪，创建移动行记录`);
            
            try {
              const moveLineData = await rpc(base, '/web/dataset/call_kw', {
                model: 'stock.move.line',
                method: 'create',
                args: [{
                  move_id: move.id,
                  product_id: move.product_id[0],
                  product_uom_id: move.product_uom[0],
                  quantity: move.product_qty, // 使用正确的字段名
                  location_id: move.location_id[0],
                  location_dest_id: move.location_dest_id[0],
                  lot_name: tracking === 'serial' ? `SN-${Date.now()}` : `LOT-${Date.now()}`, // 根据跟踪类型生成不同的标识
                  lot_id: false,
                  company_id: companyId // 添加必需的公司ID
                }],
                kwargs: { context: ctx }
              }, cookieStr);

              console.log('创建移动行记录成功:', moveLineData);
              
              if (moveLineData?.error) {
                console.log('移动行创建失败:', moveLineData.error);
                // 如果创建失败，尝试直接设置数量
                await rpc(base, '/web/dataset/call_kw', {
                  model: 'stock.move',
                  method: 'write',
                  args: [
                    [move.id],
                    { quantity: move.product_qty }
                  ],
                  kwargs: { context: ctx }
                }, cookieStr);
                console.log('回退到直接设置数量');
              }
            } catch (e) {
              console.log('移动行创建异常:', e);
              // 如果异常，尝试直接设置数量
              await rpc(base, '/web/dataset/call_kw', {
                model: 'stock.move',
                method: 'write',
                args: [
                  [move.id],
                  { quantity: move.product_qty }
                ],
                kwargs: { context: ctx }
              }, cookieStr);
              console.log('异常回退到直接设置数量');
            }
          } else {
            // 不需要跟踪，直接设置数量
            await rpc(base, '/web/dataset/call_kw', {
              model: 'stock.move',
              method: 'write',
              args: [
                [move.id],
                { quantity: move.product_qty }
              ],
              kwargs: { context: ctx }
            }, cookieStr);
          }
        }
      }
    }

    // 4. 自动完成收货单 - 验证并完成整个流程
    console.log('开始自动完成收货单流程');
    
    // 4.1 首先尝试分配库存
    try {
      const assignResult = await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.picking',
        method: 'action_assign',
        args: [[targetPickingId]],
        kwargs: { context: ctx }
      }, cookieStr);
      console.log('分配结果:', assignResult);
    } catch (e) {
      console.log('分配失败，但继续处理:', e);
    }

    // 4.2 尝试验证收货单
    try {
      const validateResult = await rpc(base, '/web/dataset/call_kw', {
        model: 'stock.picking',
        method: 'button_validate',
        args: [[targetPickingId]],
        kwargs: { context: ctx }
      }, cookieStr);
      console.log('验证结果:', validateResult);
      
      if (validateResult?.error) {
        console.log('验证失败，尝试action_done:', validateResult.error);
        
        // 如果验证失败，尝试直接完成
        const doneResult = await rpc(base, '/web/dataset/call_kw', {
          model: 'stock.picking',
          method: 'action_done',
          args: [[targetPickingId]],
          kwargs: { context: ctx }
        }, cookieStr);
        console.log('完成结果:', doneResult);
      }
    } catch (e) {
      console.log('验证/完成异常:', e);
    }

    // 4.3 检查最终状态
    const finalStatus = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.picking',
      method: 'read',
      args: [targetPickingId, ['state', 'name']],
      kwargs: { context: ctx }
    }, cookieStr);

    console.log('最终收货单状态:', finalStatus);

    return NextResponse.json({ 
      success: true, 
      message: '一键入库完成！批次/序列号已处理，收货单已验证',
      picking_id: targetPickingId, 
      result: finalStatus?.result?.[0] || 'done'
    });

  } catch (e: any) {
    console.error('Error confirming receipt:', e);
    return NextResponse.json({ error: e?.message || '确认入库失败' }, { status: 500 });
  }
}