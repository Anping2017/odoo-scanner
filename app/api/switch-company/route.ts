// /app/api/switch-company/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getBaseFromCookie, getSessionId, getCookie, rpc } from '@/app/api/_odoo';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const base = getBaseFromCookie(req);
    const sessionId = getSessionId(req);

    if (!base || !sessionId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { companyId } = await req.json();
    
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // 1. 获取当前会话信息，验证用户权限
    let sessionInfo: any;
    try {
      sessionInfo = await rpc('/web/session/get_session_info', {}, sessionId, base);
    } catch (e: any) {
      return NextResponse.json(
        { error: '无法获取会话信息: ' + (e?.message || '未知错误') },
        { status: 401 }
      );
    }

    // 2. 验证用户是否有权限访问目标公司
    // 使用与 user-info API 相同的方式获取公司列表
    const allowedCompanyIds = sessionInfo?.user_context?.allowed_company_ids || 
                              sessionInfo?.allowed_company_ids || 
                              [];
    
    // 确保 allowedCompanyIds 是数组
    const companyIdsArray = Array.isArray(allowedCompanyIds) ? allowedCompanyIds : [];
    const targetCompanyId = Number(companyId);
    
    // 验证目标公司是否在可访问列表中
    if (companyIdsArray.length > 0 && !companyIdsArray.includes(targetCompanyId)) {
      return NextResponse.json(
        { error: '您没有权限访问该公司' },
        { status: 403 }
      );
    }

    // 3. 尝试更新 Odoo session 中的公司信息
    // 注意：Odoo 17 可能没有 /web/session/switch_company 端点
    // 我们通过更新 cookie 来记录用户选择的公司，后续 API 调用会使用这个公司 ID
    // 如果需要在 Odoo session 中也更新，可以尝试以下方法：
    try {
      // 方法1: 尝试通过 RPC 更新用户的当前公司（如果模型支持）
      const userId = sessionInfo?.uid;
      if (userId) {
        try {
          // 尝试更新用户的 company_id（某些 Odoo 版本支持）
          await rpc(
            '/web/dataset/call_kw',
            {
              model: 'res.users',
              method: 'write',
              args: [[userId], { company_id: targetCompanyId }],
              kwargs: {},
            },
            sessionId,
            base
          );
          console.log('成功更新用户的 company_id');
        } catch (e: any) {
          // 如果更新失败，可能是因为权限或模型不支持，这是正常的
          console.warn('无法更新用户的 company_id（可能不需要）:', e?.message);
        }
      }
    } catch (e: any) {
      console.warn('切换公司时出现警告（可忽略）:', e?.message);
      // 继续执行，因为 cookie 更新是最重要的
    }

    // 4. 切换成功，更新前端用的 od_company
    const res = NextResponse.json({
      success: true,
      message: '公司切换成功',
    });

    const maxAge = 60 * 60 * 24 * 30; // 30天
    // 建议用 x-forwarded-proto 判断 https
    const forwardedProto = req.headers.get('x-forwarded-proto');
    const isHttps =
      req.url.startsWith('https://') || forwardedProto === 'https';

    res.cookies.set('od_company', String(companyId), {
      path: '/',
      secure: isHttps,
      sameSite: 'lax',
      maxAge,
      httpOnly: false, // 前端要读的话就 false
    });

    return res;
  } catch (e: any) {
    console.error('切换公司失败:', e);
    return NextResponse.json(
      {
        error: e?.message || '切换公司失败',
        details: {
          message: e?.message,
          stack: e?.stack,
        },
      },
      { status: 500 }
    );
  }
}


