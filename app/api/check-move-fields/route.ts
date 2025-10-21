// /app/api/check-move-fields/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { resolvePreset } from '@/lib/odooPresets';

export const dynamic = 'force-dynamic';

async function rpc(url: string, path: string, body: any, cookie: string) {
  const res = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'call', params: body }),
    cache: 'no-store',
  });
  
  const data = await res.json().catch(() => ({}));
  return data;
}

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

    // 1. 获取stock.move的所有字段
    const fieldsData = await rpc(base, '/web/dataset/call_kw', {
      model: 'stock.move',
      method: 'fields_get',
      args: [],
      kwargs: { context: ctx }
    }, cookieStr);

    if (fieldsData?.error) {
      return NextResponse.json({ 
        error: '字段查询失败',
        fieldsError: fieldsData.error
      });
    }

    const fields = fieldsData.result || {};
    
    // 查找与数量相关的字段
    const quantityFields = Object.keys(fields).filter(fieldName => 
      fieldName.toLowerCase().includes('qty') || 
      fieldName.toLowerCase().includes('quantity') ||
      fieldName.toLowerCase().includes('done') ||
      fieldName.toLowerCase().includes('received')
    );

    // 查找与状态相关的字段
    const stateFields = Object.keys(fields).filter(fieldName => 
      fieldName.toLowerCase().includes('state') ||
      fieldName.toLowerCase().includes('status')
    );

    return NextResponse.json({
      allFields: Object.keys(fields),
      quantityFields: quantityFields.map(field => ({
        name: field,
        type: fields[field]?.type,
        string: fields[field]?.string
      })),
      stateFields: stateFields.map(field => ({
        name: field,
        type: fields[field]?.type,
        string: fields[field]?.string
      })),
      debug: {
        base,
        db,
        companyId,
        context: ctx
      }
    });

  } catch (e: any) {
    console.error('Error checking move fields:', e);
    return NextResponse.json({ error: e?.message || '检查字段失败' }, { status: 500 });
  }
}
