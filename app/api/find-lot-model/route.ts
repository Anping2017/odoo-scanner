// /app/api/find-lot-model/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { resolvePreset } from '@/lib/odooPresets';

export async function GET(req: NextRequest) {
  try {
    const ck = req.cookies;
    const hostHdr = req.headers.get('x-forwarded-host') || req.headers.get('host') || undefined;
    const preset = resolvePreset(hostHdr);

    const base = ck.get('od_base')?.value || preset?.url;
    const db = ck.get('od_db')?.value || preset?.db;
    const session = ck.get('od_session')?.value;
    const companyId = Number(ck.get('od_company')?.value || 0) || undefined;

    if (!base || !db || !session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const cookieStr = `session_id=${session}`;
    const ctx: any = {};
    if (companyId) { 
      ctx.company_id = companyId; 
      ctx.allowed_company_ids = [companyId]; 
    }

    // 尝试不同的Lot模型名称
    const possibleModels = [
      'stock.production.lot',
      'stock.lot',
      'stock.serial',
      'stock.lot.serial',
      'stock.tracking.lot',
      'stock.quant', // 备用方案
    ];

    const results: any = {};

    for (const modelName of possibleModels) {
      try {
        // 测试字段获取
        const fieldsTest = await fetch(`${base}/web/dataset/call_kw`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: cookieStr },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'call',
            params: {
              model: modelName,
              method: 'fields_get',
              args: [],
              kwargs: { context: ctx }
            }
          }),
        });

        const fieldsResult = await fieldsTest.json().catch(() => ({}));
        
        results[modelName] = {
          available: !fieldsResult?.error,
          error: fieldsResult?.error || null,
          fields: Object.keys(fieldsResult?.result || {}),
        };

        // 如果模型可用，尝试搜索
        if (!fieldsResult?.error) {
          const searchTest = await fetch(`${base}/web/dataset/call_kw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', cookie: cookieStr },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: Date.now(),
              method: 'call',
              params: {
                model: modelName,
                method: 'search',
                args: [[['id', '>', 0]]],
                kwargs: { limit: 1, context: ctx }
              }
            }),
          });

          const searchResult = await searchTest.json().catch(() => ({}));
          results[modelName].searchResult = searchResult?.result || [];
          results[modelName].searchError = searchResult?.error || null;
        }
      } catch (e: any) {
        results[modelName] = {
          available: false,
          error: (e as any)?.message || 'Unknown error',
          fields: [],
        };
      }
    }

    return NextResponse.json({
      modelTests: results,
      debug: {
        base,
        db,
        companyId,
        sessionLength: session?.length || 0,
        context: ctx
      }
    });
  } catch (e: any) {
    console.error('Find lot model error:', e);
    return NextResponse.json({ error: e?.message || '测试失败' }, { status: 500 });
  }
}
