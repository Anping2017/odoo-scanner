// /app/api/recycle-history/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getBaseFromCookie, getDbFromCookie, getSessionId, rpc } from '@/app/api/_odoo';

export const dynamic = 'force-dynamic';

// 回收历史记录类型
export type RecycleHistory = {
  id?: number;
  store_name: string;           // 门店名称
  operator_name: string;         // 操作员姓名
  recycle_date: string;          // 回收日期
  device_type: string;           // 设备类型
  brand: string;                 // 品牌
  model: string;                 // 型号
  customer_name: string;         // 客户姓名
  phone?: string;                // 手机号码
  email?: string;                // 邮箱地址
  recycle_price: string;        // 回收价格
  condition: string;             // 成色
  purchase_order_id?: number;    // 采购订单ID
  order_line_id?: number;        // 订单行ID
  notes?: string;                // 备注
  created_at?: string;           // 创建时间
  // 完整数据（JSON格式，存储在notes中）
  full_data?: {
    deviceInfo: any;
    userInfo: any;
    inspectionInfo: any;
  };
};

// 获取回收历史记录
export async function GET(req: NextRequest) {
  try {
    const base = getBaseFromCookie(req);
    const db = getDbFromCookie(req);
    const sessionId = getSessionId(req);

    if (!base || !db || !sessionId) {
      return NextResponse.json({ 
        error: 'Authentication required',
        details: {
          base: !!base,
          db: !!db,
          sessionId: !!sessionId
        }
      }, { status: 401 });
    }

    // 从Odoo获取回收历史记录
    // 过滤出回收记录（RECYCLE开头的notes）
    console.log('Attempting to fetch recycle history from Odoo...');
    
    const result = await rpc('/web/dataset/call_kw', {
      model: 'inventory.history_8070',
      method: 'search_read',
      args: [
        [['notes', 'like', 'RECYCLE:%']], // 只获取回收记录
        [
          'id',
          'store_name',
          'user_name', 
          'inventory_date',
          'total_devices',
          'scan_count',
          'manual_count',
          'scan_rate',
          'duration_minutes',
          'notes',
          'create_date'
        ]
      ],
      kwargs: {
        limit: 1000,
        order: 'create_date desc'
      }
    }, sessionId, base);

    console.log('Odoo RPC result:', result);

    // 解析notes字段，提取回收历史数据
    const histories: RecycleHistory[] = (result || []).map((item: any) => {
      try {
        // notes格式: RECYCLE:JSON数据
        const notes = item.notes || '';
        if (notes.startsWith('RECYCLE:')) {
          const jsonData = notes.substring(8); // 移除 "RECYCLE:" 前缀
          const data = JSON.parse(jsonData);
          
          return {
            id: item.id,
            store_name: item.store_name || '',
            operator_name: item.user_name || '',
            recycle_date: item.inventory_date || item.create_date || '',
            device_type: data.deviceInfo?.deviceType || '',
            brand: data.deviceInfo?.brand || '',
            model: data.deviceInfo?.model || '',
            customer_name: data.userInfo?.customerName || '',
            phone: data.userInfo?.phone || '',
            email: data.userInfo?.email || '',
            recycle_price: data.inspectionInfo?.estimatedValue || '',
            condition: data.inspectionInfo?.condition || '',
            purchase_order_id: data.purchaseOrderId,
            order_line_id: data.orderLineId,
            notes: data.inspectionInfo?.notes || '',
            created_at: item.create_date || '',
            full_data: data
          };
        }
        return null;
      } catch (e) {
        console.error('解析回收历史记录失败:', e, item);
        return null;
      }
    }).filter((item: any) => item !== null);

    return NextResponse.json({ 
      histories: histories,
      total: histories.length 
    });

  } catch (e: any) {
    console.error('获取回收历史失败:', e);
    
    // 检查是否是模型不存在错误
    if (e?.message?.includes('Model not found') || e?.message?.includes('inventory.history_8070')) {
      return NextResponse.json({ 
        error: 'Model not found',
        message: 'inventory.history_8070 model does not exist',
        suggestion: 'Please install the Inventory History 8070 module in Odoo'
      }, { status: 404 });
    }
    
    return NextResponse.json({ 
      error: e?.message || '获取历史记录失败',
      details: {
        message: e?.message,
        stack: e?.stack
      }
    }, { status: 500 });
  }
}

// 创建回收历史记录
export async function POST(req: NextRequest) {
  try {
    const base = getBaseFromCookie(req);
    const db = getDbFromCookie(req);
    const sessionId = getSessionId(req);

    if (!base || !db || !sessionId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const historyData: RecycleHistory = await req.json();
    console.log('接收到的回收历史数据:', historyData);

    // 验证必需字段
    if (!historyData.store_name || !historyData.operator_name || !historyData.recycle_date) {
      console.error('缺少必需字段:', {
        store_name: !!historyData.store_name,
        operator_name: !!historyData.operator_name,
        recycle_date: !!historyData.recycle_date
      });
      return NextResponse.json({ error: '缺少必需字段' }, { status: 400 });
    }

    // 构建notes字段：RECYCLE:JSON数据
    const recycleData = {
      deviceInfo: historyData.full_data?.deviceInfo || {},
      userInfo: historyData.full_data?.userInfo || {},
      inspectionInfo: historyData.full_data?.inspectionInfo || {},
      purchaseOrderId: historyData.purchase_order_id,
      orderLineId: historyData.order_line_id
    };
    
    const notes = `RECYCLE:${JSON.stringify(recycleData)}`;

    console.log('准备创建回收历史记录...');

    // 创建回收历史记录（使用inventory.history_8070模型）
    const result = await rpc('/web/dataset/call_kw', {
      model: 'inventory.history_8070',
      method: 'create',
      args: [{
        store_name: historyData.store_name,
        user_name: historyData.operator_name,
        inventory_date: historyData.recycle_date,
        total_devices: 1, // 回收记录固定为1
        scan_count: 0,
        manual_count: 0,
        scan_rate: 0,
        duration_minutes: 0,
        notes: notes
      }],
      kwargs: {}
    }, sessionId, base);

    console.log('回收历史记录创建成功:', result);

    return NextResponse.json({ 
      success: true, 
      id: result,
      message: '回收记录已保存'
    });

  } catch (e: any) {
    console.error('保存回收历史失败:', e);
    return NextResponse.json({ error: e?.message || '保存历史记录失败' }, { status: 500 });
  }
}

