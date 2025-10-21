import { NextRequest, NextResponse } from 'next/server';
import { getBaseFromCookie, getDbFromCookie, getSessionId, rpc } from '@/app/api/_odoo';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const base = getBaseFromCookie(req);
    const db = getDbFromCookie(req);
    const sessionId = getSessionId(req);

    console.log('测试公司信息 - 基础信息:', { base, db, sessionId: sessionId ? 'exists' : 'missing' });

    if (!base || !db || !sessionId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // 测试1: 获取所有公司
    console.log('测试1: 获取所有公司...');
    const allCompaniesResult = await rpc('/web/dataset/call_kw', {
      model: 'res.company',
      method: 'search_read',
      args: [[]],
      kwargs: { 
        fields: ['name', 'id'],
        limit: 10
      }
    }, sessionId, base);

    console.log('所有公司结果:', allCompaniesResult);

    // 测试2: 获取所有用户
    console.log('测试2: 获取所有用户...');
    const allUsersResult = await rpc('/web/dataset/call_kw', {
      model: 'res.users',
      method: 'search_read',
      args: [[]],
      kwargs: { 
        fields: ['name', 'login', 'company_id'],
        limit: 10
      }
    }, sessionId, base);

    console.log('所有用户结果:', allUsersResult);

    // 测试3: 获取当前会话信息
    console.log('测试3: 获取当前会话信息...');
    const sessionResult = await rpc('/web/session/get_session_info', {}, sessionId, base);
    console.log('会话信息结果:', sessionResult);

    return NextResponse.json({
      success: true,
      debug_info: {
        companies: allCompaniesResult,
        users: allUsersResult,
        session: sessionResult,
        cookies: {
          base,
          db,
          sessionId: sessionId ? 'exists' : 'missing'
        }
      }
    });

  } catch (e: any) {
    console.error('测试公司信息失败:', e);
    return NextResponse.json({
      error: e?.message || 'Failed to test company info',
      details: {
        message: e?.message,
        stack: e?.stack
      }
    }, { status: 500 });
  }
}
