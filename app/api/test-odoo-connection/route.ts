// /app/api/test-odoo-connection/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getBaseFromCookie, getDbFromCookie, getSessionId, rpc } from '@/app/api/_odoo';

export const dynamic = 'force-dynamic';

// 测试Odoo连接
export async function GET(req: NextRequest) {
  try {
    const base = getBaseFromCookie(req);
    const db = getDbFromCookie(req);
    const sessionId = getSessionId(req);

    console.log('Connection Test Debug:', {
      base: base,
      db: db,
      sessionId: sessionId ? 'present' : 'missing',
      cookies: req.headers.get('cookie')
    });

    if (!base || !db || !sessionId) {
      return NextResponse.json({ 
        error: 'Missing authentication',
        details: {
          base: !!base,
          db: !!db,
          sessionId: !!sessionId,
          cookies: req.headers.get('cookie')
        }
      }, { status: 401 });
    }

    // 测试基本连接
    const result = await rpc('/web/dataset/call_kw', {
      model: 'res.users',
      method: 'search_read',
      args: [
        [['id', '=', 1]], // 查找用户ID为1的记录
        ['id', 'name']
      ],
      kwargs: {
        limit: 1
      }
    }, sessionId, base);

    return NextResponse.json({ 
      success: true,
      message: 'Odoo connection successful',
      data: result,
      connection: {
        base: base,
        db: db,
        sessionId: sessionId ? 'present' : 'missing'
      }
    });

  } catch (e: any) {
    console.error('Odoo connection test failed:', e);
    return NextResponse.json({ 
      error: e?.message || 'Connection test failed',
      details: {
        message: e?.message,
        stack: e?.stack
      }
    }, { status: 500 });
  }
}
