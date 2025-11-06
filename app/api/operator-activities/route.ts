// /app/api/operator-activities/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getBaseFromCookie, getDbFromCookie, getSessionId, rpc } from '@/app/api/_odoo';

export const dynamic = 'force-dynamic';

// 操作员活动记录类型
export type OperatorActivity = {
  id?: number;
  user_name: string;           // 操作员姓名
  activity_date: string;       // 活动日期时间
  activity_type: 'start' | 'continue'; // 活动类型：开始或继续
  category: string;            // 盘点类别：Parts 或 Accessories
  inventory_start_date?: string; // 盘点开始日期（如果是继续盘点，使用原始开始日期）
  notes?: string;              // 备注
  created_at?: string;         // 创建时间
};

// 获取操作员活动记录（按操作员分组）
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

    // 从Odoo获取操作员活动记录
    // 使用inventory.history_8070模型的notes字段来存储活动信息
    // 格式：ACTIVITY:start|continue|category|inventory_start_date
    const result = await rpc(
      '/web/dataset/call_kw',
      {
        model: 'inventory.history_8070',
        method: 'search_read',
        args: [
          [['notes', 'ilike', 'ACTIVITY:']], // 只获取活动记录
          [
            'id',
            'user_name', 
            'inventory_date',
            'notes',
            'create_date'
          ]
        ],
        kwargs: {
          limit: 1000,
          order: 'create_date desc'
        }
      },
      sessionId,
      base
    );

    // 解析活动记录并按操作员分组
    const activitiesByOperator = new Map<string, Array<{
      activity_date: string;
      activity_type: 'start' | 'continue';
      category: string;
      inventory_start_date?: string;
    }>>();

    (result || []).forEach((record: any) => {
      const notes = record.notes || '';
      if (notes.startsWith('ACTIVITY:')) {
        const parts = notes.replace('ACTIVITY:', '').split('|');
        if (parts.length >= 3) {
          const activityType = parts[0] as 'start' | 'continue';
          const category = parts[1];
          const inventoryStartDate = parts[2] || undefined;
          
          const operatorName = record.user_name;
          if (!activitiesByOperator.has(operatorName)) {
            activitiesByOperator.set(operatorName, []);
          }
          
          activitiesByOperator.get(operatorName)!.push({
            activity_date: record.inventory_date || record.create_date,
            activity_type: activityType,
            category: category,
            inventory_start_date: inventoryStartDate
          });
        }
      }
    });

    // 转换为数组格式，包含每个操作员的活动次数
    const operatorsData = Array.from(activitiesByOperator.entries()).map(([operatorName, activities]) => ({
      operator_name: operatorName,
      activity_count: activities.length,
      activities: activities.sort((a, b) => 
        new Date(b.activity_date).getTime() - new Date(a.activity_date).getTime()
      ) // 按日期倒序排序
    }));

    return NextResponse.json({ 
      operators: operatorsData,
      total: operatorsData.length
    });

  } catch (e: any) {
    console.error('获取操作员活动记录失败:', e);
    return NextResponse.json({ 
      error: e?.message || '获取活动记录失败',
      details: {
        message: e?.message,
        stack: e?.stack
      }
    }, { status: 500 });
  }
}

// 创建操作员活动记录
export async function POST(req: NextRequest) {
  try {
    const base = getBaseFromCookie(req);
    const db = getDbFromCookie(req);
    const sessionId = getSessionId(req);

    if (!base || !db || !sessionId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const activityData: OperatorActivity = await req.json();
    console.log('接收到的操作员活动数据:', activityData);

    // 验证必需字段
    if (!activityData.user_name || !activityData.activity_date || !activityData.activity_type || !activityData.category) {
      console.error('缺少必需字段:', {
        user_name: !!activityData.user_name,
        activity_date: !!activityData.activity_date,
        activity_type: !!activityData.activity_type,
        category: !!activityData.category
      });
      return NextResponse.json({ error: '缺少必需字段' }, { status: 400 });
    }

    // 获取公司信息
    let storeName = '默认公司';
    try {
      // 先获取当前用户信息 - 通过会话信息获取
      const sessionResult = await rpc('/web/session/get_session_info', {}, sessionId, base);
      
      let userId = 1; // 默认用户ID
      if (sessionResult && sessionResult.uid) {
        userId = sessionResult.uid;
      }

      const userResult = await rpc(
        '/web/dataset/call_kw',
        {
          model: 'res.users',
          method: 'search_read',
          args: [[['id', '=', userId]]],
          kwargs: {
            fields: ['name', 'company_id', 'login']
          }
        },
        sessionId,
        base
      );

      // 获取用户所属公司信息
      if (userResult && userResult.length > 0 && userResult[0].company_id) {
        const companyResult = await rpc(
          '/web/dataset/call_kw',
          {
            model: 'res.company',
            method: 'search_read',
            args: [[['id', '=', userResult[0].company_id[0]]]],
            kwargs: { fields: ['name'] }
          },
          sessionId,
          base
        );
        
        if (companyResult && companyResult.length > 0) {
          storeName = companyResult[0].name;
        }
      }
      
      // 如果还是默认值，尝试获取第一个公司
      if (storeName === '默认公司') {
        const allCompaniesResult = await rpc(
          '/web/dataset/call_kw',
          {
            model: 'res.company',
            method: 'search_read',
            args: [[]],
            kwargs: { 
              fields: ['name'],
              limit: 1,
              order: 'id asc'
            }
          },
          sessionId,
          base
        );
        
        if (allCompaniesResult && allCompaniesResult.length > 0) {
          storeName = allCompaniesResult[0].name;
        }
      }
    } catch (e) {
      console.warn('获取公司信息失败，使用默认值:', e);
    }

    // 构建notes字段：ACTIVITY:type|category|inventory_start_date
    const notes = `ACTIVITY:${activityData.activity_type}|${activityData.category}|${activityData.inventory_start_date || ''}`;

    // 创建活动记录（使用inventory.history_8070模型，但只记录活动信息）
    const result = await rpc(
      '/web/dataset/call_kw',
      {
        model: 'inventory.history_8070',
        method: 'create',
      args: [{
          store_name: storeName,
          user_name: activityData.user_name,
          inventory_date: activityData.activity_date,
          total_devices: 0, // 活动记录不使用此字段
          scan_count: 0,
          manual_count: 0,
          scan_rate: 0,
          duration_minutes: 0,
          notes: notes
        }],
        kwargs: {}
      },
      sessionId,
      base
    );

    console.log('操作员活动记录创建成功:', result);

    return NextResponse.json({ 
      success: true, 
      id: result,
      message: '活动记录已保存'
    });

  } catch (e: any) {
    console.error('保存操作员活动记录失败:', e);
    return NextResponse.json({ error: e?.message || '保存活动记录失败' }, { status: 500 });
  }
}

