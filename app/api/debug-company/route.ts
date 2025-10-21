import { NextRequest, NextResponse } from 'next/server';
import { getBaseFromCookie, getDbFromCookie, getSessionId, rpc } from '@/app/api/_odoo';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const base = getBaseFromCookie(req);
    const db = getDbFromCookie(req);
    const sessionId = getSessionId(req);

    console.log('调试公司信息 - 基础信息:', { base, db, sessionId: sessionId ? 'exists' : 'missing' });

    if (!base || !db || !sessionId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // 测试1: 获取会话信息
    console.log('测试1: 获取会话信息...');
    const sessionResult = await rpc('/web/session/get_session_info', {}, sessionId, base);
    console.log('会话信息结果:', sessionResult);

    // 测试2: 根据会话中的用户ID获取用户信息
    let userId = sessionResult?.uid || 1;
    console.log('当前用户ID:', userId);

    const userResult = await rpc('/web/dataset/call_kw', {
      model: 'res.users',
      method: 'search_read',
      args: [[['id', '=', userId]]],
      kwargs: { 
        fields: ['name', 'company_id', 'login', 'active']
      }
    }, sessionId, base);

    console.log('用户信息结果:', userResult);

    // 测试3: 获取用户所属公司信息
    let companyName = 'Default Company';
    let companyResult = null;
    
    if (userResult && userResult.length > 0 && userResult[0].company_id) {
      console.log('测试3: 获取用户所属公司信息...');
      companyResult = await rpc('/web/dataset/call_kw', {
        model: 'res.company',
        method: 'search_read',
        args: [[['id', '=', userResult[0].company_id[0]]]],
        kwargs: { fields: ['name', 'id', 'active'] }
      }, sessionId, base);
      
      console.log('公司信息结果:', companyResult);
      
      if (companyResult && companyResult.length > 0) {
        companyName = companyResult[0].name;
      }
    }

    // 测试4: 如果还是默认值，获取所有公司
    if (companyName === 'Default Company') {
      console.log('测试4: 获取所有公司...');
      const allCompaniesResult = await rpc('/web/dataset/call_kw', {
        model: 'res.company',
        method: 'search_read',
        args: [[]],
        kwargs: { 
          fields: ['name', 'id', 'active'],
          limit: 10
        }
      }, sessionId, base);
      
      console.log('所有公司结果:', allCompaniesResult);
      
      if (allCompaniesResult && allCompaniesResult.length > 0) {
        companyName = allCompaniesResult[0].name;
      }
    }

    // 测试5: 获取当前用户的所有公司
    console.log('测试5: 获取当前用户的所有公司...');
    const userCompaniesResult = await rpc('/web/dataset/call_kw', {
      model: 'res.users',
      method: 'read',
      args: [[userId]],
      kwargs: { 
        fields: ['company_ids']
      }
    }, sessionId, base);

    console.log('用户所有公司结果:', userCompaniesResult);

    return NextResponse.json({
      success: true,
      debug_info: {
        session: sessionResult,
        userId: userId,
        user: userResult,
        company: companyResult,
        finalCompanyName: companyName,
        userCompanies: userCompaniesResult,
        cookies: {
          base,
          db,
          sessionId: sessionId ? 'exists' : 'missing'
        }
      }
    });

  } catch (e: any) {
    console.error('调试公司信息失败:', e);
    return NextResponse.json({
      error: e?.message || 'Failed to debug company info',
      details: {
        message: e?.message,
        stack: e?.stack
      }
    }, { status: 500 });
  }
}
