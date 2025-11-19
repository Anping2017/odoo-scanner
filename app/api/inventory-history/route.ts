// /app/api/inventory-history/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getBaseFromCookie, getDbFromCookie, getSessionId, getLoginUser, rpc } from '@/app/api/_odoo';

export const dynamic = 'force-dynamic';

// 盘点历史记录类型
export type InventoryHistory = {
  id?: number;
  store_name: string;           // 门店名称
  user_name: string;           // 操作员姓名
  inventory_date: string;      // 盘点日期
  total_devices: number;       // 总设备数
  scan_count: number;          // 扫码数量
  manual_count: number;        // 手动数量
  scan_rate: number;           // 扫码率
  duration_minutes: number;    // 盘点耗时（分钟）
  notes?: string;              // 备注
  created_at?: string;         // 创建时间
};

// 获取盘点历史记录
export async function GET(req: NextRequest) {
  try {
    const base = getBaseFromCookie(req);
    const db = getDbFromCookie(req);
    const sessionId = getSessionId(req);

    console.log('API Debug Info:', {
      base: base,
      db: db,
      sessionId: sessionId ? 'present' : 'missing',
      hasSessionId: !!sessionId
    });

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

    // 从Odoo获取盘点历史记录
    // 过滤掉活动记录（ACTIVITY开头的notes），只返回完成盘点记录
    console.log('Attempting to fetch inventory history from Odoo...');
    
    const result = await rpc('/web/dataset/call_kw', {
      model: 'inventory.history_8070',
      method: 'search_read',
      args: [
        [
          ['notes', 'not like', 'ACTIVITY:%'], // 过滤掉活动记录
          ['notes', 'not like', 'RECYCLE:%']   // 过滤掉回收历史记录
        ],
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
        limit: 100,
        order: 'create_date desc'
      }
    }, sessionId, base);

    console.log('Odoo RPC result:', result);

    return NextResponse.json({ 
      histories: result || [],
      total: result?.length || 0 
    });

  } catch (e: any) {
    console.error('获取盘点历史失败:', e);
    
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

// 创建盘点历史记录
export async function POST(req: NextRequest) {
  try {
    const base = getBaseFromCookie(req);
    const db = getDbFromCookie(req);
    const sessionId = getSessionId(req);

    console.log('POST API Debug Info:', {
      base: base,
      db: db,
      sessionId: sessionId ? 'present' : 'missing',
      hasSessionId: !!sessionId
    });

    if (!base || !db || !sessionId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const historyData: InventoryHistory = await req.json();
    console.log('接收到的盘点历史数据:', historyData);

    // 验证必需字段
    if (!historyData.store_name || !historyData.user_name || !historyData.inventory_date) {
      console.error('缺少必需字段:', {
        store_name: !!historyData.store_name,
        user_name: !!historyData.user_name,
        inventory_date: !!historyData.inventory_date
      });
      return NextResponse.json({ error: '缺少必需字段' }, { status: 400 });
    }

    console.log('准备创建盘点历史记录...');

    // 创建盘点历史记录
    const result = await rpc('/web/dataset/call_kw', {
      model: 'inventory.history_8070',
      method: 'create',
      args: [{
        store_name: historyData.store_name,
        user_name: historyData.user_name,
        inventory_date: historyData.inventory_date,
        total_devices: historyData.total_devices,
        scan_count: historyData.scan_count,
        manual_count: historyData.manual_count,
        scan_rate: historyData.scan_rate,
        duration_minutes: historyData.duration_minutes,
        notes: historyData.notes || ''
      }],
      kwargs: {}
    }, sessionId, base);

    console.log('盘点历史记录创建成功:', result);

    return NextResponse.json({ 
      success: true, 
      id: result,
      message: '盘点记录已保存'
    });

  } catch (e: any) {
    console.error('保存盘点历史失败:', e);
    return NextResponse.json({ error: e?.message || '保存历史记录失败' }, { status: 500 });
  }
}

// 删除盘点历史记录（支持单个和批量删除）
export async function DELETE(req: NextRequest) {
  try {
    const base = getBaseFromCookie(req);
    const db = getDbFromCookie(req);
    const sessionId = getSessionId(req);

    if (!base || !db || !sessionId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const ids = searchParams.get('ids'); // 批量删除的ID列表，逗号分隔
    const password = searchParams.get('password');

    // 验证删除密码
    if (password !== 'u01xhaby') {
      return NextResponse.json({ error: 'Invalid password' }, { status: 403 });
    }

    // 确定要删除的ID数组
    let idsToDelete: number[] = [];
    
    if (ids) {
      // 批量删除：解析逗号分隔的ID列表
      idsToDelete = ids.split(',').map(idStr => parseInt(idStr.trim())).filter(id => !isNaN(id));
      if (idsToDelete.length === 0) {
        return NextResponse.json({ error: 'Invalid IDs format' }, { status: 400 });
      }
    } else if (id) {
      // 单个删除：兼容旧的方式
      idsToDelete = [parseInt(id)];
      if (isNaN(idsToDelete[0])) {
        return NextResponse.json({ error: 'Invalid record ID' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: 'Missing record ID(s)' }, { status: 400 });
    }

    console.log('准备删除盘点历史记录:', idsToDelete);

    const result = await rpc('/web/dataset/call_kw', {
      model: 'inventory.history_8070',
      method: 'unlink',
      args: [idsToDelete],
      kwargs: {}
    }, sessionId, base);

    console.log('删除盘点历史响应:', result);

    return NextResponse.json({
      success: true,
      deleted: result,
      deletedCount: idsToDelete.length,
      message: result ? `成功删除 ${idsToDelete.length} 条记录` : '删除失败'
    });

  } catch (e: any) {
    console.error('删除盘点历史失败:', e);
    return NextResponse.json({
      error: e?.message || 'Failed to delete inventory history',
      details: {
        message: e?.message,
        stack: e?.stack
      }
    }, { status: 500 });
  }
}
