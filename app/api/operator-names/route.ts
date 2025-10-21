import { NextRequest, NextResponse } from 'next/server';
import { getBaseFromCookie, getDbFromCookie, getSessionId, rpc } from '@/app/api/_odoo';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const base = getBaseFromCookie(req);
    const db = getDbFromCookie(req);
    const sessionId = getSessionId(req);

    if (!base || !db || !sessionId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // 获取历史操作员姓名（去重）
    const result = await rpc('/web/dataset/call_kw', {
      model: 'inventory.history_8070',
      method: 'search_read',
      args: [
        [['user_name', '!=', false]], // 只获取有操作员姓名的记录
        ['user_name']
      ],
      kwargs: { 
        limit: 100,
        order: 'create_date desc'
      }
    }, sessionId, base);

    // 去重并排序
    const uniqueOperators = [...new Set(
      result
        ?.map((record: any) => record.user_name)
        .filter((name: string) => name && name.trim())
    )].sort();

    return NextResponse.json({
      success: true,
      operators: uniqueOperators
    });

  } catch (e: any) {
    console.error('获取历史操作员姓名失败:', e);
    return NextResponse.json({
      error: e?.message || 'Failed to get operator names',
      details: {
        message: e?.message,
        stack: e?.stack
      }
    }, { status: 500 });
  }
}
