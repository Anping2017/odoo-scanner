// /app/api/test-model/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getBaseFromCookie, getDbFromCookie, getSessionId, rpc } from '@/app/api/_odoo';

export const dynamic = 'force-dynamic';

// 测试模型是否存在
export async function GET(req: NextRequest) {
  try {
    const base = getBaseFromCookie(req);
    const db = getDbFromCookie(req);
    const sessionId = getSessionId(req);

    if (!base || !db || !sessionId) {
      return NextResponse.json({ 
        error: 'Missing authentication',
        details: { base: !!base, db: !!db, sessionId: !!sessionId }
      }, { status: 401 });
    }

    // 测试模型是否存在
    console.log('Testing model existence...');
    
    try {
      // 尝试获取模型信息
      const modelInfo = await rpc('/web/dataset/call_kw', {
        model: 'ir.model',
        method: 'search_read',
        args: [
          [['model', '=', 'inventory.history_8070']],
          ['id', 'model', 'name']
        ],
        kwargs: { limit: 1 }
      }, sessionId, base);

      console.log('Model info:', modelInfo);

      if (!modelInfo || modelInfo.length === 0) {
        return NextResponse.json({ 
          error: 'Model not found',
          message: 'inventory.history_8070 model does not exist in Odoo',
          suggestion: 'Please install the Inventory History 8070 module'
        }, { status: 404 });
      }

      // 尝试获取记录
      const records = await rpc('/web/dataset/call_kw', {
        model: 'inventory.history_8070',
        method: 'search_read',
        args: [[], ['id']],
        kwargs: { limit: 1 }
      }, sessionId, base);

      return NextResponse.json({ 
        success: true,
        model: modelInfo[0],
        recordCount: records?.length || 0,
        message: 'Model exists and accessible'
      });

    } catch (modelError: any) {
      console.error('Model test error:', modelError);
      
      if (modelError.message?.includes('Model not found')) {
        return NextResponse.json({ 
          error: 'Model not found',
          message: 'inventory.history_8070 model does not exist',
          suggestion: 'Please install the Inventory History 8070 module in Odoo'
        }, { status: 404 });
      }
      
      throw modelError;
    }

  } catch (e: any) {
    console.error('Model test failed:', e);
    return NextResponse.json({ 
      error: e?.message || 'Model test failed',
      details: {
        message: e?.message,
        stack: e?.stack
      }
    }, { status: 500 });
  }
}
