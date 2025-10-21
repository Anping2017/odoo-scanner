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

    // 只获取公司信息
    const companyResult = await rpc('/web/dataset/call_kw', {
      model: 'res.company',
      method: 'search_read',
      args: [[['id', '=', 1]]], // 获取默认公司
      kwargs: { fields: ['name'] }
    }, sessionId, base);

    return NextResponse.json({
      success: true,
      company_name: companyResult?.[0]?.name || 'Default Company'
    });

  } catch (e: any) {
    console.error('获取公司信息失败:', e);
    return NextResponse.json({
      error: e?.message || 'Failed to get company info',
      details: {
        message: e?.message,
        stack: e?.stack
      }
    }, { status: 500 });
  }
}
