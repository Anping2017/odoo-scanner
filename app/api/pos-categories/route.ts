import { NextRequest, NextResponse } from 'next/server';
import { resolvePreset } from '@/lib/odooPresets';
import { rpc, getBaseFromCookie, getDbFromCookie, getSessionId } from '@/app/api/_odoo';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const base = getBaseFromCookie(req);
    const db = getDbFromCookie(req);
    const sessionId = getSessionId(req);
    const ck = req.cookies;
    const hostHdr = req.headers.get('x-forwarded-host') || req.headers.get('host') || undefined;
    const preset = resolvePreset(hostHdr);

    if (!base || !db || !sessionId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const ctx: any = {};
    const companyId = Number(ck.get('od_company')?.value || 0) || undefined;
    if (companyId) {
      ctx.company_id = companyId;
      ctx.allowed_company_ids = [companyId];
    }

    // 获取所有POS类别
    const posCategoriesData = await rpc('/web/dataset/call_kw', {
      model: 'pos.category',
      method: 'search_read',
      args: [
        [],
        ['id', 'name']
      ],
      kwargs: {
        order: 'name asc',
        context: ctx
      }
    }, sessionId, base);

    const categories: string[] = [];
    if (posCategoriesData && Array.isArray(posCategoriesData)) {
      posCategoriesData.forEach((cat: any) => {
        if (cat.name && cat.name !== 'Unset' && cat.name !== 'Others') {
          categories.push(cat.name);
        }
      });
    }

    // 去重并排序（已过滤掉Unset和Others）
    const uniqueCategories = [...new Set(categories)].sort();

    return NextResponse.json({
      categories: uniqueCategories
    });

  } catch (e: any) {
    console.error('获取POS类别失败:', e);
    return NextResponse.json({
      error: e?.message || '获取POS类别失败',
      categories: []
    }, { status: 500 });
  }
}

