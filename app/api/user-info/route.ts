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

    // 获取当前登录用户信息 - 通过会话信息获取
    const sessionResult = await rpc('/web/session/get_session_info', {}, sessionId, base);
    console.log('会话信息结果:', sessionResult);

    let userId = 1; // 默认用户ID
    if (sessionResult && sessionResult.uid) {
      userId = sessionResult.uid;
    }

    // 获取用户可访问的公司列表（从session中获取）
    const allowedCompanyIds = sessionResult?.user_context?.allowed_company_ids || 
                              sessionResult?.allowed_company_ids || 
                              [];

    console.log('当前用户ID:', userId);
    console.log('可访问的公司ID列表:', allowedCompanyIds);

    // 根据用户ID获取用户信息
    const userResult = await rpc('/web/dataset/call_kw', {
      model: 'res.users',
      method: 'search_read',
      args: [[['id', '=', userId]]],
      kwargs: { 
        fields: ['name', 'company_id', 'login', 'company_ids']
      }
    }, sessionId, base);

    console.log('用户信息查询结果:', userResult);

    // 获取当前公司ID（从cookie或session中）
    const currentCompanyId = sessionResult?.user_context?.company_id || 
                            sessionResult?.company_id || 
                            (userResult && userResult.length > 0 && userResult[0].company_id ? userResult[0].company_id[0] : null);

    // 获取用户可访问的公司列表（优先使用session中的，否则使用用户记录中的）
    let accessibleCompanyIds = allowedCompanyIds;
    if (accessibleCompanyIds.length === 0 && userResult && userResult.length > 0 && userResult[0].company_ids) {
      accessibleCompanyIds = userResult[0].company_ids;
    }

    // 获取所有可访问的公司信息
    let companies: Array<{ id: number; name: string }> = [];
    if (accessibleCompanyIds.length > 0) {
      const companiesResult = await rpc('/web/dataset/call_kw', {
        model: 'res.company',
        method: 'search_read',
        args: [[['id', 'in', accessibleCompanyIds]]],
        kwargs: { 
          fields: ['id', 'name']
        }
      }, sessionId, base);
      
      if (companiesResult && companiesResult.length > 0) {
        companies = companiesResult.map((c: any) => ({
          id: c.id,
          name: c.name
        }));
      }
    }

    // 获取当前公司名称
    let companyName = 'Default Company';
    if (currentCompanyId) {
      const currentCompany = companies.find(c => c.id === currentCompanyId);
      if (currentCompany) {
        companyName = currentCompany.name;
      } else {
        // 如果当前公司不在列表中，单独查询
        const companyResult = await rpc('/web/dataset/call_kw', {
          model: 'res.company',
          method: 'search_read',
          args: [[['id', '=', currentCompanyId]]],
          kwargs: { fields: ['name'] }
        }, sessionId, base);
        
        if (companyResult && companyResult.length > 0) {
          companyName = companyResult[0].name;
          // 添加到公司列表中
          companies.push({ id: currentCompanyId, name: companyName });
        }
      }
    }

    // 如果还是默认值，尝试获取第一个公司
    if (companyName === 'Default Company' && companies.length > 0) {
      companyName = companies[0].name;
    }

    return NextResponse.json({
      success: true,
      company_name: companyName,
      current_company_id: currentCompanyId,
      companies: companies, // 用户可访问的公司列表
      can_switch_company: companies.length > 1, // 是否可以切换公司（有多个公司时）
      debug_info: {
        user_result: userResult,
        company_name: companyName,
        current_company_id: currentCompanyId,
        allowed_company_ids: accessibleCompanyIds
      }
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
