// /app/api/parts-inventory-history/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getBaseFromCookie, getDbFromCookie, getSessionId, rpc } from '@/app/api/_odoo';

export const dynamic = 'force-dynamic';

// 零配件盘点历史记录类型
export type PartsInventoryHistory = {
  id?: number;
  store_name: string;           // 门店名称
  user_name: string;           // 操作员姓名
  inventory_date: string;      // 盘点日期
  category: string;             // 盘点类别：Parts 或 Accessories
  total_parts: number;          // 总零配件数
  scan_count: number;           // 扫码数量
  manual_count: number;         // 手动数量
  scan_rate: number;            // 扫码率
  duration_minutes: number;     // 盘点耗时（分钟）
  notes?: string;              // 备注
  created_at?: string;         // 创建时间
};

// 获取零配件盘点历史记录
export async function GET(req: NextRequest) {
  try {
    const base = getBaseFromCookie(req);
    const db = getDbFromCookie(req);
    const sessionId = getSessionId(req);

    if (!base || !db || !sessionId) {
      return NextResponse.json({ 
        error: '未登录',
        details: {
          base: !!base,
          db: !!db,
          sessionId: !!sessionId
        }
      }, { status: 401 });
    }

    // 从Odoo获取零配件盘点历史记录
    // 注意：使用inventory.history_8070模型，但添加category字段区分
    const result = await rpc(
      '/web/dataset/call_kw',
      {
        model: 'inventory.history_8070',
        method: 'search_read',
        args: [
          [], // 搜索条件
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
      },
      sessionId,
      base
    );

    return NextResponse.json({ 
      histories: result || [],
      total: result?.length || 0 
    });

  } catch (e: any) {
    console.error('获取零配件盘点历史失败:', e);
    return NextResponse.json({ 
      error: e?.message || '获取历史记录失败',
      details: {
        message: e?.message,
        stack: e?.stack
      }
    }, { status: 500 });
  }
}

// 创建零配件盘点历史记录
export async function POST(req: NextRequest) {
  try {
    const base = getBaseFromCookie(req);
    const db = getDbFromCookie(req);
    const sessionId = getSessionId(req);

    if (!base || !db || !sessionId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const historyData: PartsInventoryHistory = await req.json();
    console.log('接收到的零配件盘点历史数据:', historyData);

    // 验证必需字段
    if (!historyData.store_name || !historyData.user_name || !historyData.inventory_date) {
      console.error('缺少必需字段:', {
        store_name: !!historyData.store_name,
        user_name: !!historyData.user_name,
        inventory_date: !!historyData.inventory_date
      });
      return NextResponse.json({ error: '缺少必需字段' }, { status: 400 });
    }

    // 创建盘点历史记录
    // 使用inventory.history_8070模型，在notes字段中保存category信息
    const notes = historyData.category 
      ? `${historyData.category}${historyData.notes ? ' | ' + historyData.notes : ''}`
      : (historyData.notes || '');
    
    const result = await rpc(
      '/web/dataset/call_kw',
      {
        model: 'inventory.history_8070',
        method: 'create',
        args: [{
          store_name: historyData.store_name,
          user_name: historyData.user_name,
          inventory_date: historyData.inventory_date,
          total_devices: historyData.total_parts,
          scan_count: historyData.scan_count,
          manual_count: historyData.manual_count,
          scan_rate: historyData.scan_rate,
          duration_minutes: historyData.duration_minutes,
          notes: notes
        }],
        kwargs: {}
      },
      sessionId,
      base
    );

    console.log('零配件盘点历史记录创建成功:', result);

    return NextResponse.json({ 
      success: true, 
      id: result,
      message: '盘点记录已保存'
    });

  } catch (e: any) {
    console.error('保存零配件盘点历史失败:', e);
    return NextResponse.json({ error: e?.message || '保存历史记录失败' }, { status: 500 });
  }
}

// 删除零配件盘点历史记录（支持单个和批量删除）
export async function DELETE(req: NextRequest) {
  try {
    const base = getBaseFromCookie(req);
    const db = getDbFromCookie(req);
    const sessionId = getSessionId(req);

    if (!base || !db || !sessionId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id'); // 单个删除的ID（向后兼容）
    const idsParam = searchParams.getAll('ids'); // 批量删除的ID列表
    const password = searchParams.get('password');

    // 确定要删除的ID列表
    let idsToDelete: number[] = [];
    
    if (idsParam.length > 0) {
      // 批量删除模式
      idsToDelete = idsParam.map(id => parseInt(id)).filter(id => !isNaN(id));
    } else if (id) {
      // 单个删除模式（向后兼容）
      idsToDelete = [parseInt(id)];
    }

    if (idsToDelete.length === 0) {
      return NextResponse.json({ error: '缺少ID参数' }, { status: 400 });
    }

    if (password !== 'u01xhaby') {
      return NextResponse.json({ error: '密码错误' }, { status: 403 });
    }

    // 批量删除
    const result = await rpc(
      '/web/dataset/call_kw',
      {
        model: 'inventory.history_8070',
        method: 'unlink',
        args: [idsToDelete],
        kwargs: {}
      },
      sessionId,
      base
    );

    if (result?.error) {
      throw new Error(result.error.message || '删除失败');
    }

    return NextResponse.json({ 
      success: true,
      message: `成功删除 ${idsToDelete.length} 条记录`
    });
  } catch (e: any) {
    console.error('删除零配件盘点历史记录失败:', e);
    return NextResponse.json({ 
      error: e?.message || '删除历史记录失败',
      details: {
        message: e?.message,
        stack: e?.stack
      }
    }, { status: 500 });
  }
}

