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

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('page_size') || '20');
    const filterStoreStock = searchParams.get('filter_store_stock'); // 'true', 'false', or null
    const filterHeadquartersStock = searchParams.get('filter_hq_stock'); // 'true', 'false', or null
    const posCategories = searchParams.getAll('pos_category'); // POS类别名称（多选）
    const minPrice = searchParams.get('min_price'); // 最低价格
    const maxPrice = searchParams.get('max_price'); // 最高价格
    const searchMode = searchParams.get('search_mode') || 'fuzzy'; // 搜索模式：'fuzzy' 或 'exact'
    const sortField = searchParams.get('sort_field') || 'name'; // 排序字段
    const sortOrder = searchParams.get('sort_order') || 'desc'; // 排序方向：'asc' 或 'desc'
    const searchOnly = searchParams.get('search_only') === 'true'; // 只搜索模式：不进行筛选、排序、分页

    // 构建搜索条件 - 完美搜索方案
    const searchDomain: any[] = [];
    if (search.trim()) {
      const searchTerm = search.trim();
      
      if (searchMode === 'exact') {
        // 精确搜索模式：完全匹配（不区分大小写）
        // 在name、default_code或barcode中完全匹配
        // 由于Odoo的ilike是模糊匹配，我们先用ilike获取候选，然后在应用层过滤
        // 使用展开运算符构建域，参考 parts-inventory 的实现
        searchDomain.push('|');
        searchDomain.push('|');
        searchDomain.push(['name', 'ilike', searchTerm]);
        searchDomain.push(['default_code', 'ilike', searchTerm]);
        searchDomain.push(['barcode', 'ilike', searchTerm]);
      } else if (searchMode === 'name') {
        // 按名称搜索模式：仅在产品名称中搜索（不搜索SKU和条码）
        // 使用与模糊搜索完全相同的逻辑，但只搜索name字段
        // 1. 支持引号包裹的精确短语
        // 2. 多关键词自动用AND连接（每个关键词都要出现）
        // 3. 关键词顺序不重要，大小写不敏感
        
        // 解析搜索词：分离引号短语和普通关键词
        // 辅助函数：检查字符是否是引号（支持中英文引号）
        const isQuote = (char: string) => {
          return char === '"' || char === '"' || char === '"';
        };
        
        const parts: Array<{type: 'exact' | 'fuzzy', value: string}> = [];
        let currentPart = '';
        let inQuotes = false;
        
        for (let i = 0; i < searchTerm.length; i++) {
          const char = searchTerm[i];
          if (isQuote(char)) {
            if (inQuotes) {
              // 结束引号
              if (currentPart.trim()) {
                parts.push({ type: 'exact', value: currentPart.trim() });
              }
              currentPart = '';
              inQuotes = false;
            } else {
              // 开始引号
              if (currentPart.trim()) {
                // 将引号前的部分作为模糊关键词处理
                const fuzzyKeywords = currentPart.trim().split(/\s+/).filter(k => k.length > 0);
                fuzzyKeywords.forEach(k => parts.push({ type: 'fuzzy', value: k }));
              }
              currentPart = '';
              inQuotes = true;
            }
          } else {
            currentPart += char;
          }
        }
        
        // 处理最后一部分
        if (currentPart.trim()) {
          if (inQuotes) {
            parts.push({ type: 'exact', value: currentPart.trim() });
          } else {
            // 将剩余部分拆分为多个模糊关键词
            const fuzzyKeywords = currentPart.trim().split(/\s+/).filter(k => k.length > 0);
            fuzzyKeywords.forEach(k => parts.push({ type: 'fuzzy', value: k }));
          }
        }
        
        // 如果没有解析出任何部分，使用整个搜索词作为模糊搜索
        if (parts.length === 0) {
          const keywords = searchTerm.split(/\s+/).filter(k => k.length > 0);
          keywords.forEach(k => parts.push({ type: 'fuzzy', value: k }));
        }
        
        console.log(`[按名称搜索] 搜索词: "${searchTerm}"`);
        console.log(`[按名称搜索] 搜索词长度: ${searchTerm.length}`);
        console.log(`[按名称搜索] 搜索词字符编码:`, Array.from(searchTerm).map(c => `${c} (${c.charCodeAt(0)})`).join(', '));
        console.log(`[按名称搜索] 解析结果:`, JSON.stringify(parts, null, 2));
        
        // 构建搜索条件：所有关键词都要在名称中出现（AND关系），不要求顺序和连续
        // 注意：对于精确短语，ilike 会进行部分匹配，所以 "iphone 8" 可以匹配包含 "iphone 8" 的产品名称
        if (parts.length === 1) {
          // 单个关键词或短语：只在name字段中搜索
          searchDomain.push(['name', 'ilike', parts[0].value]);
          console.log(`[按名称搜索] 单个条件: name ilike "${parts[0].value}"`);
        } else if (parts.length > 1) {
          // 多个关键词：所有关键词都要在名称中出现（AND关系）
          const nameGroup: any[] = [];
          for (let i = 0; i < parts.length - 1; i++) {
            nameGroup.push('&');
          }
          for (let i = 0; i < parts.length; i++) {
            nameGroup.push(['name', 'ilike', parts[i].value]);
          }
          searchDomain.push(...nameGroup);
          console.log(`[按名称搜索] 多个条件:`, nameGroup.map((item, idx) => {
            if (item === '&') return 'AND';
            if (Array.isArray(item)) return `name ilike "${item[2]}"`;
            return item;
          }).join(' '));
        }
        
        console.log(`[按名称搜索] 构建的搜索域:`, JSON.stringify(searchDomain, null, 2));
      } else if (searchMode === 'sku') {
        // 按SKU搜索模式：仅在SKU（default_code）中搜索（不搜索名称和条码）
        // 支持模糊匹配
        searchDomain.push(['default_code', 'ilike', searchTerm]);
      } else if (searchMode === 'lot') {
        // 按Lot/Serial Number搜索模式：通过stock.lot搜索，然后找到关联的产品
        // 这个模式需要特殊处理，先搜索Lot，然后获取产品ID列表
        // 暂时先不添加到searchDomain，后面会单独处理
      } else {
        // 模糊搜索模式：智能多关键词搜索
        // 1. 支持引号包裹的精确短语
        // 2. 多关键词自动用AND连接（每个关键词都要出现）
        // 3. 关键词顺序不重要，大小写不敏感
        
        // 解析搜索词：分离引号短语和普通关键词
        // 辅助函数：检查字符是否是引号（支持中英文引号）
        const isQuote = (char: string) => {
          return char === '"' || char === '"' || char === '"';
        };
        
        const parts: Array<{type: 'exact' | 'fuzzy', value: string}> = [];
        let currentPart = '';
        let inQuotes = false;
        
        for (let i = 0; i < searchTerm.length; i++) {
          const char = searchTerm[i];
          if (isQuote(char)) {
            if (inQuotes) {
              // 结束引号
              if (currentPart.trim()) {
                parts.push({ type: 'exact', value: currentPart.trim() });
              }
              currentPart = '';
              inQuotes = false;
            } else {
              // 开始引号
              if (currentPart.trim()) {
                // 将引号前的部分作为模糊关键词处理
                const fuzzyKeywords = currentPart.trim().split(/\s+/).filter(k => k.length > 0);
                fuzzyKeywords.forEach(k => parts.push({ type: 'fuzzy', value: k }));
              }
              currentPart = '';
              inQuotes = true;
            }
          } else {
            currentPart += char;
          }
        }
        
        // 处理最后一部分
        if (currentPart.trim()) {
          if (inQuotes) {
            parts.push({ type: 'exact', value: currentPart.trim() });
          } else {
            // 将剩余部分拆分为多个模糊关键词
            const fuzzyKeywords = currentPart.trim().split(/\s+/).filter(k => k.length > 0);
            fuzzyKeywords.forEach(k => parts.push({ type: 'fuzzy', value: k }));
          }
        }
        
        // 如果没有解析出任何部分，使用整个搜索词作为模糊搜索
        if (parts.length === 0) {
          const keywords = searchTerm.split(/\s+/).filter(k => k.length > 0);
          keywords.forEach(k => parts.push({ type: 'fuzzy', value: k }));
        }
        
        // 构建搜索条件：每个关键词必须在同一字段内匹配，不能跨字段匹配
        // 多个关键词时，不要求顺序，不要求连续，但所有关键词必须在同一字段内出现
        // 例如搜索"iphone 13 battery"，应该匹配名称中包含"iphone"、"13"、"battery"的产品
        // 不区分大小写（ilike已支持），不要求关键词顺序和连续性
        if (parts.length === 1) {
          // 单个关键词：name OR default_code OR barcode
          searchDomain.push('|');
          searchDomain.push('|');
          searchDomain.push(['name', 'ilike', parts[0].value]);
          searchDomain.push(['default_code', 'ilike', parts[0].value]);
          searchDomain.push(['barcode', 'ilike', parts[0].value]);
        } else if (parts.length > 1) {
          // 多个关键词：每个字段内必须包含所有关键词（AND关系），不要求顺序和连续
          // 构建条件：(name包含所有关键词) OR (default_code包含所有关键词) OR (barcode包含所有关键词)
          
          // 使用扁平化的AND格式：先构建三个独立的组，然后用OR连接
          // 格式：['&', '&', condition1, condition2, condition3] 表示 condition1 AND condition2 AND condition3
          
          // 名称字段组：所有关键词都要在名称中出现（不要求顺序和连续）
          const nameGroup: any[] = [];
          for (let i = 0; i < parts.length - 1; i++) {
            nameGroup.push('&');
          }
          for (let i = 0; i < parts.length; i++) {
            nameGroup.push(['name', 'ilike', parts[i].value]);
          }
          
          // SKU字段组：所有关键词都要在SKU中出现（不要求顺序和连续）
          const skuGroup: any[] = [];
          for (let i = 0; i < parts.length - 1; i++) {
            skuGroup.push('&');
          }
          for (let i = 0; i < parts.length; i++) {
            skuGroup.push(['default_code', 'ilike', parts[i].value]);
          }
          
          // 条码字段组：所有关键词都要在条码中出现（不要求顺序和连续）
          const barcodeGroup: any[] = [];
          for (let i = 0; i < parts.length - 1; i++) {
            barcodeGroup.push('&');
          }
          for (let i = 0; i < parts.length; i++) {
            barcodeGroup.push(['barcode', 'ilike', parts[i].value]);
          }
          
          // 用OR连接三个组
          searchDomain.push('|');
          searchDomain.push('|');
          searchDomain.push(...nameGroup);
          searchDomain.push(...skuGroup);
          searchDomain.push(...barcodeGroup);
        }
      }
    }

    // 价格筛选（在搜索条件中添加）
    if (minPrice && !isNaN(parseFloat(minPrice))) {
      searchDomain.push(['list_price', '>=', parseFloat(minPrice)]);
    }
    if (maxPrice && !isNaN(parseFloat(maxPrice))) {
      searchDomain.push(['list_price', '<=', parseFloat(maxPrice)]);
    }

    // POS类别筛选：先通过product.template筛选（支持多选）
    // 排除"Unset"类别
    let templateIdsByCategory: number[] = [];
    if (posCategories.length > 0) {
      try {
        // 1. 根据POS类别名称找到所有POS类别ID（排除"Unset"）
        const categoryNames = posCategories.map(cat => cat.trim()).filter(cat => cat !== '' && cat.toLowerCase() !== 'unset');
        if (categoryNames.length > 0) {
          // 构建OR条件：查找所有匹配的POS类别
          let categoryDomain: any;
          if (categoryNames.length === 1) {
            categoryDomain = [['name', '=', categoryNames[0]]];
          } else {
            // 多个类别用OR连接：['|', condition1, ['|', condition2, condition3]]
            let orCondition: any = ['name', '=', categoryNames[categoryNames.length - 1]];
            for (let i = categoryNames.length - 2; i >= 0; i--) {
              orCondition = ['|', ['name', '=', categoryNames[i]], orCondition];
            }
            categoryDomain = [orCondition];
          }

          const posCategoriesData = await rpc('/web/dataset/call_kw', {
            model: 'pos.category',
            method: 'search_read',
            args: [
              categoryDomain,
              ['id', 'name']
            ],
            kwargs: { context: ctx }
          }, sessionId, base);

          if (posCategoriesData && Array.isArray(posCategoriesData) && posCategoriesData.length > 0) {
            const categoryIds = posCategoriesData.map(cat => cat.id);
            
            // 2. 找到所有属于这些POS类别的产品模板（使用OR逻辑）
            // 同时排除"Unset"类别：先获取"Unset"类别ID，然后在查询中排除
            let unsetCategoryId: number | null = null;
            try {
              const unsetCategoryData = await rpc('/web/dataset/call_kw', {
                model: 'pos.category',
                method: 'search_read',
                args: [
                  [['name', '=', 'Unset']],
                  ['id']
                ],
                kwargs: { context: ctx, limit: 1 }
              }, sessionId, base);
              if (unsetCategoryData && Array.isArray(unsetCategoryData) && unsetCategoryData.length > 0) {
                unsetCategoryId = unsetCategoryData[0].id;
              }
            } catch (e) {
              // 忽略错误
            }
            
            // 构建查询条件：包含指定类别，排除Unset
            let templateDomain: any[] = [['pos_categ_ids', 'in', categoryIds]];
            if (unsetCategoryId !== null) {
              templateDomain.push(['pos_categ_ids', 'not in', [unsetCategoryId]]);
            }
            
            const templatesData = await rpc('/web/dataset/call_kw', {
              model: 'product.template',
              method: 'search',
              args: [templateDomain],
              kwargs: { context: ctx }
            }, sessionId, base);

            if (templatesData && Array.isArray(templatesData)) {
              templateIdsByCategory = templatesData;
            }
          }
        }
      } catch (e) {
        console.warn('POS类别筛选失败:', e);
      }
    }

    // 如果有POS类别筛选，添加product_tmpl_id条件
    if (posCategories.length > 0) {
      if (templateIdsByCategory.length === 0) {
        // 如果指定了POS类别但没有找到匹配的模板，返回空结果
        return NextResponse.json({
          products: [],
          total: 0,
          page: page,
          pageSize: pageSize,
          totalPages: 0
        });
      }
      searchDomain.push(['product_tmpl_id', 'in', templateIdsByCategory]);
    } else {
      // 即使没有指定POS类别筛选，也要排除"Unset"类别的产品
      try {
        const unsetCategoryData = await rpc('/web/dataset/call_kw', {
          model: 'pos.category',
          method: 'search_read',
          args: [
            [['name', '=', 'Unset']],
            ['id']
          ],
          kwargs: { context: ctx, limit: 1 }
        }, sessionId, base);
        if (unsetCategoryData && Array.isArray(unsetCategoryData) && unsetCategoryData.length > 0) {
          const unsetCategoryId = unsetCategoryData[0].id;
          // 找到所有属于Unset类别的模板ID，然后排除它们
          const unsetTemplatesData = await rpc('/web/dataset/call_kw', {
            model: 'product.template',
            method: 'search',
            args: [
              [['pos_categ_ids', 'in', [unsetCategoryId]]]
            ],
            kwargs: { context: ctx }
          }, sessionId, base);
          if (unsetTemplatesData && Array.isArray(unsetTemplatesData) && unsetTemplatesData.length > 0) {
            searchDomain.push(['product_tmpl_id', 'not in', unsetTemplatesData]);
          }
        }
      } catch (e) {
        // 忽略错误，继续执行
      }
    }

    // 如果是Lot/Serial Number搜索模式，需要先搜索Lot，然后获取产品ID
    // 注意：Lot/Serial搜索模式始终使用实时查询，不使用离线数据
    let lotProductIds: number[] = [];
    if (searchMode === 'lot' && search.trim()) {
      try {
        // 1. 搜索匹配的Lot/Serial Number
        const lotData = await rpc('/web/dataset/call_kw', {
          model: 'stock.lot',
          method: 'search_read',
          args: [
            [['name', 'ilike', search.trim()]],
            ['id', 'name']
          ],
          kwargs: {
            limit: 1000, // 限制最大Lot数量
            context: ctx
          }
        }, sessionId, base);
        
        if (lotData && Array.isArray(lotData) && lotData.length > 0) {
          const lotIds = lotData.map((lot: any) => lot.id);
          
          // 2. 通过stock.quant找到关联的产品ID
          const quantData = await rpc('/web/dataset/call_kw', {
            model: 'stock.quant',
            method: 'search_read',
            args: [
              [['lot_id', 'in', lotIds]],
              ['product_id']
            ],
            kwargs: {
              limit: 10000, // 限制最大数量
              context: ctx
            }
          }, sessionId, base);
          
          if (quantData && Array.isArray(quantData) && quantData.length > 0) {
            lotProductIds = [...new Set(quantData.map((q: any) => q.product_id?.[0]).filter(Boolean))];
          }
        }
      } catch (e) {
        console.error('Lot/Serial Number搜索失败:', e);
      }
      
      // 如果没有找到匹配的产品，返回空结果
      if (lotProductIds.length === 0) {
        return NextResponse.json({
          products: [],
          total: 0,
          page: page,
          pageSize: pageSize,
          totalPages: 0
        });
      }
      
      // 将产品ID添加到搜索条件中
      searchDomain.push(['id', 'in', lotProductIds]);
    }

    // 如果是只搜索模式，不进行筛选、排序、分页，直接返回搜索结果
    if (searchOnly) {
      // 只搜索模式：只应用搜索条件和数据库层面的筛选（POS类别、价格）
      // 不应用客户端筛选（库存筛选）、排序、分页
      if (searchMode === 'name' && search.trim()) {
        console.log(`[按名称搜索] 调用 Odoo search_read，搜索域:`, JSON.stringify(searchDomain.length > 0 ? searchDomain : [], null, 2));
      }
      const productsData = await rpc('/web/dataset/call_kw', {
        model: 'product.product',
        method: 'search_read',
        args: [
          searchDomain.length > 0 ? searchDomain : [],
          [
            'id',
            'name',
            'barcode',
            'default_code',
            'qty_available',
            'free_qty',
            'list_price',
            'standard_price',
            'product_tmpl_id',
            'image_128'
          ]
        ],
        kwargs: {
          limit: parseInt(pageSize.toString()) || 5000, // 使用传入的page_size，默认5000
          offset: 0,
          order: 'name asc', // 简单排序，客户端会重新排序
          context: ctx
        }
      }, sessionId, base);
      if (searchMode === 'name' && search.trim()) {
        console.log(`[按名称搜索] Odoo 返回产品数量: ${productsData?.length || 0}`);
        if (productsData && productsData.length > 0) {
          console.log(`[按名称搜索] 前5个产品名称:`, productsData.slice(0, 5).map((p: any) => p.name).join(', '));
        }
      }

      const products = productsData || [];
      if (products.length === 0) {
        return NextResponse.json({
          products: [],
          total: 0,
          page: 1,
          pageSize: parseInt(pageSize.toString()) || 5000,
          totalPages: 0
        });
      }

      // 获取产品模板ID和产品ID列表
      const templateIds = [...new Set(products.map((p: any) => p.product_tmpl_id?.[0]).filter(Boolean))];
      const productIds = products.map((p: any) => p.id).filter(Boolean);

      // 如果有多公司环境，先获取属于当前公司的订单ID（用于过滤销售数量）
      // 注意：必须确保与销售订单记录API使用相同的过滤逻辑
      let companyOrderIds: number[] = [];
      if (companyId) {
        try {
          const orderIdsResult = await rpc('/web/dataset/call_kw', {
            model: 'pos.order',
            method: 'search',
            args: [[['company_id', '=', companyId]]],
            kwargs: { 
              limit: 50000, // 限制最大订单数，避免性能问题，与sales-history API保持一致
              context: ctx 
            }
          }, sessionId, base);
          
          if (Array.isArray(orderIdsResult) && orderIdsResult.length > 0) {
            companyOrderIds = orderIdsResult;
          } else {
            console.warn(`未找到属于公司 ${companyId} 的订单，销售数量可能包含其他公司的数据`);
          }
        } catch (e) {
          console.error('获取公司订单ID失败:', e);
        }
      }

      // 并行获取辅助数据（自定义字段、POS类别、销售数量、采购数量、Lot/Serial信息）
      const [
        customFieldsResult,
        posCategoryResult,
        salesQuantityResult,
        purchaseQuantityResult,
        lotSerialResult
      ] = await Promise.allSettled([
        productIds.length > 0 ? rpc('/web/dataset/call_kw', {
          model: 'product.product',
          method: 'read',
          args: [productIds, ['raytech_stock', 'raytech_p3', 'raytech_web_name']],
          kwargs: { context: ctx }
        }, sessionId, base).catch(() => []) : Promise.resolve([]),
        (async () => {
          if (templateIds.length === 0) return { templatesData: [], categoryMap: new Map() };
          try {
            const templatesData = await rpc('/web/dataset/call_kw', {
              model: 'product.template',
              method: 'read',
              args: [templateIds, ['id', 'pos_categ_ids']],
              kwargs: { context: ctx }
            }, sessionId, base);

            let categoryMap = new Map();
            let needsCategoryMap = false;
            
            if (templatesData && Array.isArray(templatesData)) {
              for (const t of templatesData) {
                const categoryFieldValue = t.pos_categ_ids;
                if (categoryFieldValue && Array.isArray(categoryFieldValue) && categoryFieldValue.length > 0) {
                  if (!Array.isArray(categoryFieldValue[0])) {
                    needsCategoryMap = true;
                    break;
                  }
                }
              }
            }

            if (needsCategoryMap) {
              try {
                const posCategoriesData = await rpc('/web/dataset/call_kw', {
                  model: 'pos.category',
                  method: 'search_read',
                  args: [[], ['id', 'name']],
                  kwargs: { context: ctx }
                }, sessionId, base);
                
                if (posCategoriesData && Array.isArray(posCategoriesData)) {
                  posCategoriesData.forEach((cat: any) => {
                    categoryMap.set(cat.id, cat.name);
                  });
                }
              } catch (e) {
                // 忽略错误
              }
            }

            return { templatesData, categoryMap };
          } catch (e) {
            return { templatesData: [], categoryMap: new Map() };
          }
        })(),
        // 销售数量查询（带公司过滤，确保与销售订单记录一致）
        (async () => {
          if (productIds.length === 0) return [];
          try {
            // 构建查询条件：产品ID + 公司过滤（如果有多公司环境）
            // 注意：必须与sales-history API使用相同的过滤逻辑
            const salesDomain: any[] = [['product_id', 'in', productIds]];
            if (companyId) {
              if (companyOrderIds.length > 0) {
                salesDomain.push(['order_id', 'in', companyOrderIds]);
              } else {
                console.warn('公司订单ID为空，销售数量查询可能不准确');
                return [];
              }
            }
            
            const salesData = await rpc('/web/dataset/call_kw', {
              model: 'pos.order.line',
              method: 'read_group',
              args: [
                salesDomain,
                ['qty'],
                ['product_id'],
              ],
              kwargs: { context: ctx }
            }, sessionId, base);
            return salesData || [];
          } catch (e) {
            return [];
          }
        })(),
        // 采购数量查询（使用read_group，需要应用公司过滤）
        // 注意：必须与采购订单记录API使用相同的过滤逻辑
        (async () => {
          if (productIds.length === 0) return [];
          
          // 构建查询条件：产品ID + 公司过滤（如果有多公司环境）
          let purchaseDomain: any[] = [['product_id', 'in', productIds]];
          
          // 如果有多公司环境，需要获取属于当前公司的采购订单ID
          let companyPurchaseOrderIds: number[] = [];
          if (companyId) {
            try {
              const orderIdsResult = await rpc('/web/dataset/call_kw', {
                model: 'purchase.order',
                method: 'search',
                args: [[['company_id', '=', companyId]]],
                kwargs: { 
                  limit: 50000, // 限制最大订单数，避免性能问题，与purchase-history API保持一致
                  context: ctx 
                }
              }, sessionId, base);
              
              if (Array.isArray(orderIdsResult) && orderIdsResult.length > 0) {
                companyPurchaseOrderIds = orderIdsResult;
                purchaseDomain.push(['order_id', 'in', companyPurchaseOrderIds]);
              } else {
                console.warn(`未找到属于公司 ${companyId} 的采购订单，采购数量可能包含其他公司的数据`);
                return [];
              }
            } catch (e) {
              console.error('获取公司采购订单ID失败:', e);
              return [];
            }
          }
          
          try {
            return await rpc('/web/dataset/call_kw', {
              model: 'purchase.order.line',
              method: 'read_group',
              args: [
                purchaseDomain,
                ['product_qty'],
                ['product_id'],
              ],
              kwargs: { context: ctx }
            }, sessionId, base);
          } catch (e: any) {
            console.warn('采购数量查询失败，返回空数组:', e?.message);
            return [];
          }
        })(),
        // 获取Lot/Serial信息（仅限有Lot/Serial的产品，只在lot搜索模式下获取）
        (async () => {
          // 只在lot搜索模式下获取Lot/Serial信息
          if (searchMode !== 'lot' || productIds.length === 0) return new Map();
          try {
            // 通过stock.quant获取有Lot/Serial的产品
            const quantData = await rpc('/web/dataset/call_kw', {
              model: 'stock.quant',
              method: 'search_read',
              args: [
                [
                  ['product_id', 'in', productIds],
                  ['lot_id', '!=', false],
                  ['quantity', '>', 0]
                ],
                ['product_id', 'lot_id', 'quantity', 'location_id']
              ],
              kwargs: {
                limit: 10000,
                context: ctx
              }
            }, sessionId, base);
            
            if (!quantData || !Array.isArray(quantData)) return new Map();
            
            // 获取所有Lot ID
            const lotIds = [...new Set(quantData.map((q: any) => q.lot_id?.[0]).filter(Boolean))];
            if (lotIds.length === 0) return new Map();
            
            // 获取Lot详细信息
            const lotData = await rpc('/web/dataset/call_kw', {
              model: 'stock.lot',
              method: 'read',
              args: [lotIds, ['id', 'name']],
              kwargs: { context: ctx }
            }, sessionId, base);
            
            if (!lotData || !Array.isArray(lotData)) return new Map();
            
            const lotMap = new Map(lotData.map((l: any) => [l.id, l.name]));
            
            // 按产品ID分组Lot/Serial信息
            const lotSerialMap = new Map<number, Array<{lot_id: number, lot_name: string, quantity: number, location_name: string}>>();
            
            quantData.forEach((q: any) => {
              const productId = q.product_id?.[0];
              const lotId = q.lot_id?.[0];
              if (!productId || !lotId) return;
              
              const lotName = lotMap.get(lotId) || `LOT-${lotId}`;
              const quantity = q.quantity || 0;
              const locationName = q.location_id?.[1] || '未知位置';
              
              if (!lotSerialMap.has(productId)) {
                lotSerialMap.set(productId, []);
              }
              
              lotSerialMap.get(productId)!.push({
                lot_id: lotId,
                lot_name: lotName,
                quantity: quantity,
                location_name: locationName
              });
            });
            
            return lotSerialMap;
          } catch (e) {
            console.error('获取Lot/Serial信息失败:', e);
            return new Map();
          }
        })()
      ]);

      // 处理结果并组合数据
      let customFieldsMap = new Map();
      if (customFieldsResult.status === 'fulfilled' && Array.isArray(customFieldsResult.value)) {
        customFieldsResult.value.forEach((p: any) => {
          customFieldsMap.set(p.id, {
            raytech_stock: p.raytech_stock || null,
            raytech_p3: p.raytech_p3 || null,
            raytech_web_name: p.raytech_web_name || null
          });
        });
      }

      let posCategoryMap = new Map();
      if (posCategoryResult.status === 'fulfilled' && posCategoryResult.value && !Array.isArray(posCategoryResult.value)) {
        const { templatesData, categoryMap } = posCategoryResult.value;
        if (templatesData && Array.isArray(templatesData)) {
          templatesData.forEach((t: any) => {
            let categoryName = '未分类';
            const categoryFieldValue = t.pos_categ_ids;
            if (categoryFieldValue && Array.isArray(categoryFieldValue) && categoryFieldValue.length > 0) {
              if (Array.isArray(categoryFieldValue[0])) {
                categoryName = categoryFieldValue[0][1] || categoryMap.get(categoryFieldValue[0][0]) || '未分类';
              } else {
                categoryName = categoryMap.get(categoryFieldValue[0]) || '未分类';
              }
            }
            posCategoryMap.set(t.id, categoryName);
          });
        }
      }

      let salesQuantityMap = new Map();
      if (salesQuantityResult.status === 'fulfilled' && Array.isArray(salesQuantityResult.value)) {
        salesQuantityResult.value.forEach((item: any) => {
          const productId = item.product_id?.[0];
          const qty = item.qty || 0;
          if (productId) {
            salesQuantityMap.set(productId, qty);
          }
        });
      }

      let purchaseQuantityMap = new Map();
      if (purchaseQuantityResult.status === 'fulfilled' && Array.isArray(purchaseQuantityResult.value)) {
        purchaseQuantityResult.value.forEach((item: any) => {
          const productId = item.product_id?.[0];
          const totalQty = item.product_qty || 0;
          if (productId) {
            purchaseQuantityMap.set(productId, totalQty);
          }
        });
      }

      // 处理Lot/Serial信息结果
      let lotSerialMap = new Map<number, Array<{lot_id: number, lot_name: string, quantity: number, location_name: string}>>();
      if (lotSerialResult.status === 'fulfilled' && lotSerialResult.value instanceof Map) {
        lotSerialMap = lotSerialResult.value;
      }

      // 组合产品数据
      const productsList = products.map((product: any) => {
        const customFields = customFieldsMap.get(product.id) || {};
        const templateId = product.product_tmpl_id?.[0];
        const posCategory = posCategoryMap.get(templateId) || '未分类';
        const salesQty = salesQuantityMap.get(product.id) || 0;
        const purchaseQty = purchaseQuantityMap.get(product.id) || 0;

        return {
          id: product.id,
          name: product.name || '',
          barcode: product.barcode || '',
          default_code: product.default_code || '',
          qty_available: product.qty_available || 0,
          free_qty: product.free_qty || 0,
          list_price: product.list_price || 0,
          standard_price: product.standard_price || 0,
          raytech_stock: customFields.raytech_stock ?? null,
          raytech_p3: customFields.raytech_p3 ?? null,
          raytech_web_name: customFields.raytech_web_name ?? null,
          image_128: product.image_128 || null,
          pos_category: posCategory,
          sales_quantity: salesQty,
          purchase_quantity: purchaseQty,
          // 只在lot搜索模式下添加lot_serial_numbers字段
          ...(searchMode === 'lot' ? { lot_serial_numbers: lotSerialMap.get(product.id) || undefined } : {})
        };
      });

      return NextResponse.json({
        products: productsList,
        total: productsList.length,
        page: 1,
        pageSize: productsList.length,
        totalPages: 1
      });
    }

    // 正常模式：进行筛选、排序、分页
    // 判断是否需要应用层排序（需要先获取所有数据）
    const needsAppSort = ['sales_quantity', 'purchase_quantity', 'raytech_p3'].includes(sortField);
    // 判断是否是Odoo层面支持的排序字段
    const odooSortFields = ['name', 'list_price', 'qty_available'];
    const isOdooSortField = odooSortFields.includes(sortField);
    
    // 1. 获取产品列表
    // 为了确保全产品排序，先排序后分页，需要先获取所有数据
    // 对于Odoo层面支持的字段，可以在Odoo层面排序；对于应用层排序的字段，先获取所有数据再排序
    const productsData = await rpc('/web/dataset/call_kw', {
      model: 'product.product',
      method: 'search_read',
      args: [
        searchDomain.length > 0 ? searchDomain : [],
        [
          'id',
          'name',
          'barcode',
          'default_code',
          'qty_available',
          'free_qty',
          'list_price',
          'standard_price',
          'product_tmpl_id',
          'image_128'
        ]
      ],
      kwargs: {
        // 为了全产品排序，先获取所有数据（限制10000以避免性能问题）
        limit: 10000,
        offset: 0,
        order: (() => {
          // 对于Odoo直接支持的字段，在Odoo层面排序
          if (isOdooSortField) {
            return `${sortField} ${sortOrder}`;
          }
          // 其他字段在应用层排序，这里先用name排序作为默认
          return 'name asc';
        })(),
        context: ctx
      }
    }, sessionId, base);

    const products = productsData || [];
    if (products.length === 0) {
      return NextResponse.json({
        products: [],
        total: 0,
        page: page,
        pageSize: pageSize,
        totalPages: 0
      });
    }

    // 2. 获取总记录数
    const countData = await rpc('/web/dataset/call_kw', {
      model: 'product.product',
      method: 'search_count',
      args: [searchDomain.length > 0 ? searchDomain : []],
      kwargs: { context: ctx }
    }, sessionId, base);

    const totalCount = countData || 0;

    // 3. 获取产品模板ID列表，用于查询POS类别和自定义字段
    const templateIds = [...new Set(products.map((p: any) => p.product_tmpl_id?.[0]).filter(Boolean))];
    const productIds = products.map((p: any) => p.id).filter(Boolean);

    // 如果有多公司环境，先获取属于当前公司的订单ID（用于过滤销售数量）
    // 注意：必须确保与销售订单记录API使用相同的过滤逻辑
    let companyOrderIds: number[] = [];
    if (companyId) {
      try {
        const orderIdsResult = await rpc('/web/dataset/call_kw', {
          model: 'pos.order',
          method: 'search',
          args: [[['company_id', '=', companyId]]],
          kwargs: { 
            limit: 50000, // 限制最大订单数，避免性能问题，与sales-history API保持一致
            context: ctx 
          }
        }, sessionId, base);
        
        if (Array.isArray(orderIdsResult) && orderIdsResult.length > 0) {
          companyOrderIds = orderIdsResult;
        } else {
          // 如果没有找到属于当前公司的订单，记录警告但不返回空结果
          // 因为可能是查询失败，而不是真的没有订单
          console.warn(`未找到属于公司 ${companyId} 的订单，销售数量可能包含其他公司的数据`);
        }
      } catch (e) {
        // 查询失败时记录错误，但不阻止继续执行
        // 这样即使查询失败，也能返回部分数据
        console.error('获取公司订单ID失败:', e);
      }
    }

    // 4-8. 并行获取所有辅助数据（自定义字段、POS类别、销售数量、采购数量、Lot/Serial信息）
    // 注意：Lot/Serial信息只在lot搜索模式下获取
    // 使用Promise.all并行执行，大幅提升性能
    const [
      customFieldsResult,
      posCategoryResult,
      salesQuantityResult,
      purchaseQuantityResult,
      lotSerialResult
    ] = await Promise.allSettled([
      // 4. 获取自定义字段（raytech_stock, raytech_p3）
      productIds.length > 0 ? rpc('/web/dataset/call_kw', {
        model: 'product.product',
        method: 'read',
        args: [productIds, ['raytech_stock', 'raytech_p3']],
        kwargs: { context: ctx }
      }, sessionId, base).catch(() => []) : Promise.resolve([]),

      // 5. 获取POS类别信息（优化：先获取模板，如果模板数据包含类别名称则不需要额外查询）
      (async () => {
        if (templateIds.length === 0) return { templatesData: [], categoryMap: new Map() };
        try {
          const templatesData = await rpc('/web/dataset/call_kw', {
            model: 'product.template',
            method: 'read',
            args: [templateIds, ['id', 'pos_categ_ids']],
            kwargs: { context: ctx }
          }, sessionId, base);

          // 检查是否需要获取类别映射（如果模板数据中已经包含类别名称，就不需要）
          let categoryMap = new Map();
          let needsCategoryMap = false;
          
          if (templatesData && Array.isArray(templatesData)) {
            for (const t of templatesData) {
              const categoryFieldValue = t.pos_categ_ids;
              if (categoryFieldValue && Array.isArray(categoryFieldValue) && categoryFieldValue.length > 0) {
                if (!Array.isArray(categoryFieldValue[0])) {
                  // 如果格式不是[[id, name]]，需要获取类别映射
                  needsCategoryMap = true;
                  break;
                }
              }
            }
          }

          // 只在需要时获取所有POS类别
          if (needsCategoryMap) {
            try {
              const posCategoriesData = await rpc('/web/dataset/call_kw', {
                model: 'pos.category',
                method: 'search_read',
                args: [[], ['id', 'name']],
                kwargs: { context: ctx }
              }, sessionId, base);
              
              if (posCategoriesData && Array.isArray(posCategoriesData)) {
                posCategoriesData.forEach((cat: any) => {
                  categoryMap.set(cat.id, cat.name);
                });
              }
            } catch (e) {
              // 忽略错误，使用空映射
            }
          }

          return { templatesData, categoryMap };
        } catch (e) {
          return { templatesData: [], categoryMap: new Map() };
        }
      })(),

      // 6. 获取Lot/Serial信息（仅限有Lot/Serial的产品，只在lot搜索模式下获取）
      (async () => {
        // 只在lot搜索模式下获取Lot/Serial信息
        if (searchMode !== 'lot' || productIds.length === 0) return new Map();
        try {
          // 通过stock.quant获取有Lot/Serial的产品
          const quantData = await rpc('/web/dataset/call_kw', {
            model: 'stock.quant',
            method: 'search_read',
            args: [
              [
                ['product_id', 'in', productIds],
                ['lot_id', '!=', false],
                ['quantity', '>', 0]
              ],
              ['product_id', 'lot_id', 'quantity', 'location_id']
            ],
            kwargs: {
              limit: 10000,
              context: ctx
            }
          }, sessionId, base);
          
          if (!quantData || !Array.isArray(quantData)) return new Map();
          
          // 获取所有Lot ID
          const lotIds = [...new Set(quantData.map((q: any) => q.lot_id?.[0]).filter(Boolean))];
          if (lotIds.length === 0) return new Map();
          
          // 获取Lot详细信息
          const lotData = await rpc('/web/dataset/call_kw', {
            model: 'stock.lot',
            method: 'read',
            args: [lotIds, ['id', 'name']],
            kwargs: { context: ctx }
          }, sessionId, base);
          
          if (!lotData || !Array.isArray(lotData)) return new Map();
          
          const lotMap = new Map(lotData.map((l: any) => [l.id, l.name]));
          
          // 按产品ID分组Lot/Serial信息
          const lotSerialMap = new Map<number, Array<{lot_id: number, lot_name: string, quantity: number, location_name: string}>>();
          
          quantData.forEach((q: any) => {
            const productId = q.product_id?.[0];
            const lotId = q.lot_id?.[0];
            if (!productId || !lotId) return;
            
            const lotName = lotMap.get(lotId) || `LOT-${lotId}`;
            const quantity = q.quantity || 0;
            const locationName = q.location_id?.[1] || '未知位置';
            
            if (!lotSerialMap.has(productId)) {
              lotSerialMap.set(productId, []);
            }
            
            lotSerialMap.get(productId)!.push({
              lot_id: lotId,
              lot_name: lotName,
              quantity: quantity,
              location_name: locationName
            });
          });
          
          return lotSerialMap;
        } catch (e) {
          console.error('获取Lot/Serial信息失败:', e);
          return new Map();
        }
      })(),

      // 7. 批量获取销售数量（优化：优先使用read_group，失败则用search_read）
      // 注意：需要应用公司过滤，确保与销售订单列表一致
      (async () => {
        if (productIds.length === 0) return [];
        
        // 构建查询条件：产品ID + 公司过滤（如果有多公司环境）
        // 注意：必须与sales-history API使用相同的过滤逻辑
        let salesDomain: any[] = [['product_id', 'in', productIds]];
        if (companyId) {
          if (companyOrderIds.length > 0) {
            // 如果成功获取了公司订单ID，使用订单ID过滤
            salesDomain.push(['order_id', 'in', companyOrderIds]);
          } else {
            // 如果没有获取到公司订单ID（可能是查询失败），尝试使用公司ID直接过滤
            // 注意：pos.order.line模型可能没有直接的company_id字段，需要通过order_id关联
            // 如果order_id.company_id过滤不可用，这里返回空结果以确保数据一致性
            // 但实际上，如果companyOrderIds为空，可能是查询失败，应该记录警告
            console.warn('公司订单ID为空，销售数量查询可能不准确');
            // 返回空结果，确保与sales-history API行为一致
            return [];
          }
        }
        
        try {
          // 优先尝试使用read_group聚合，性能更好
          // 添加超时控制，避免502/504错误
          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('销售数量查询超时')), 10000)
          );
          
          const salesDataPromise = rpc('/web/dataset/call_kw', {
            model: 'pos.order.line',
            method: 'read_group',
            args: [
              salesDomain,
              ['qty'],
              ['product_id'],
            ],
            kwargs: { context: ctx }
          }, sessionId, base);
          
          const salesData = await Promise.race([salesDataPromise, timeoutPromise]);
          return salesData || [];
        } catch (e: any) {
          // 如果read_group失败或超时，使用search_read作为备用方案（但限制更小）
          try {
            const timeoutPromise2 = new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('销售数量查询超时')), 10000)
            );
            
            const salesDataPromise2 = rpc('/web/dataset/call_kw', {
              model: 'pos.order.line',
              method: 'search_read',
              args: [
                salesDomain,
                ['product_id', 'qty']
              ],
              kwargs: { 
                limit: 10000, // 进一步降低限制，避免502/504错误
                context: ctx 
              }
            }, sessionId, base);
            
            const salesData = await Promise.race([salesDataPromise2, timeoutPromise2]);
            return salesData || [];
          } catch (e2: any) {
            console.warn('销售数量查询失败，返回空数组:', e2?.message);
            return [];
          }
        }
      })(),

      // 7. 批量获取采购数量（使用read_group，需要应用公司过滤）
      // 注意：必须与采购订单记录API使用相同的过滤逻辑
      (async () => {
        if (productIds.length === 0) return [];
        
        // 构建查询条件：产品ID + 公司过滤（如果有多公司环境）
        let purchaseDomain: any[] = [['product_id', 'in', productIds]];
        
        // 如果有多公司环境，需要获取属于当前公司的采购订单ID
        let companyPurchaseOrderIds: number[] = [];
        if (companyId) {
          try {
            const orderIdsResult = await rpc('/web/dataset/call_kw', {
              model: 'purchase.order',
              method: 'search',
              args: [[['company_id', '=', companyId]]],
              kwargs: { 
                limit: 50000, // 限制最大订单数，避免性能问题，与purchase-history API保持一致
                context: ctx 
              }
            }, sessionId, base);
            
            if (Array.isArray(orderIdsResult) && orderIdsResult.length > 0) {
              companyPurchaseOrderIds = orderIdsResult;
              purchaseDomain.push(['order_id', 'in', companyPurchaseOrderIds]);
            } else {
              console.warn(`未找到属于公司 ${companyId} 的采购订单，采购数量可能包含其他公司的数据`);
              // 返回空结果，确保与purchase-history API行为一致
              return [];
            }
          } catch (e) {
            console.error('获取公司采购订单ID失败:', e);
            // 查询失败时返回空结果，确保数据一致性
            return [];
          }
        }
        
        try {
          return await rpc('/web/dataset/call_kw', {
            model: 'purchase.order.line',
            method: 'read_group',
            args: [
              purchaseDomain,
              ['product_qty'],
              ['product_id'],
            ],
            kwargs: { context: ctx }
          }, sessionId, base);
        } catch (e: any) {
          console.warn('采购数量查询失败，返回空数组:', e?.message);
          return [];
        }
      })()
    ]);

    // 处理自定义字段结果
    let customFieldsMap = new Map();
    if (customFieldsResult.status === 'fulfilled' && Array.isArray(customFieldsResult.value)) {
      customFieldsResult.value.forEach((p: any) => {
        customFieldsMap.set(p.id, {
          raytech_stock: p.raytech_stock || null,
          raytech_p3: p.raytech_p3 || null,
          raytech_web_name: p.raytech_web_name || null
        });
      });
    }

    // 处理POS类别结果
    let posCategoryMap = new Map();
    if (posCategoryResult.status === 'fulfilled' && posCategoryResult.value && !Array.isArray(posCategoryResult.value)) {
      const { templatesData, categoryMap } = posCategoryResult.value;
      if (templatesData && Array.isArray(templatesData)) {
        templatesData.forEach((t: any) => {
          let categoryName = '未分类';
          const categoryFieldValue = t.pos_categ_ids;
          
          if (categoryFieldValue && Array.isArray(categoryFieldValue) && categoryFieldValue.length > 0) {
            if (Array.isArray(categoryFieldValue[0])) {
              // Many2many格式: [[id1, name1], [id2, name2]]
              categoryName = categoryFieldValue[0][1] || categoryMap.get(categoryFieldValue[0][0]) || '未分类';
            } else {
              categoryName = categoryMap.get(categoryFieldValue[0]) || '未分类';
            }
          }
          
          // 排除"Unset"类别
          if (categoryName.toLowerCase() === 'unset') {
            categoryName = '未分类';
          }
          
          posCategoryMap.set(t.id, categoryName);
        });
      }
    }

    // 处理销售数量结果
    let salesQuantityMap = new Map();
    if (salesQuantityResult.status === 'fulfilled' && Array.isArray(salesQuantityResult.value)) {
      salesQuantityResult.value.forEach((item: any) => {
        const productId = item.product_id?.[0];
        const qty = item.qty || 0;
        if (productId) {
          // read_group返回的是聚合值，search_read返回的是原始值需要累加
          const current = salesQuantityMap.get(productId) || 0;
          salesQuantityMap.set(productId, current + qty);
        }
      });
    }

    // 处理采购数量结果
    let purchaseQuantityMap = new Map();
    if (purchaseQuantityResult.status === 'fulfilled' && Array.isArray(purchaseQuantityResult.value)) {
      purchaseQuantityResult.value.forEach((item: any) => {
        const productId = item.product_id?.[0];
        const totalQty = item.product_qty || 0;
        if (productId) {
          purchaseQuantityMap.set(productId, totalQty);
        }
      });
    }

    // 处理Lot/Serial信息结果
    let lotSerialMap = new Map<number, Array<{lot_id: number, lot_name: string, quantity: number, location_name: string}>>();
    if (lotSerialResult.status === 'fulfilled' && lotSerialResult.value instanceof Map) {
      lotSerialMap = lotSerialResult.value;
    }

    // 8. 组合数据
    // 注意：由于我们先获取所有数据并排序后再分页，finalTotal应该基于实际获取的产品数量
    let productsList = products.map((product: any) => {
      const customFields = customFieldsMap.get(product.id) || {};
      const templateId = product.product_tmpl_id?.[0];
      const productPosCategory = posCategoryMap.get(templateId) || '未分类';
      const salesQty = salesQuantityMap.get(product.id) || 0;
      const purchaseQty = purchaseQuantityMap.get(product.id) || 0;

      // 排除"Unset"类别的产品
      if (productPosCategory.toLowerCase() === 'unset') {
        return null;
      }

      return {
        id: product.id,
        name: product.name || '未知产品',
        barcode: product.barcode || '',
        default_code: product.default_code || '',
        qty_available: product.qty_available || 0,
        free_qty: product.free_qty || 0,
        list_price: product.list_price || 0,
        standard_price: product.standard_price || 0,
        raytech_stock: customFields.raytech_stock || null,
        raytech_p3: customFields.raytech_p3 || null,
        raytech_web_name: customFields.raytech_web_name || null,
        image_128: product.image_128 || null,
        pos_category: productPosCategory,
        sales_quantity: salesQty,
        purchase_quantity: purchaseQty,
        // 只在lot搜索模式下添加lot_serial_numbers字段
        ...(searchMode === 'lot' ? { lot_serial_numbers: lotSerialMap.get(product.id) || undefined } : {})
      };
    }).filter((p: any) => p !== null); // 过滤掉Unset类别的产品
    
    // 更新finalTotal：基于过滤后的实际产品数量
    // 如果获取的产品数量少于总数，说明达到了limit限制，使用实际获取的数量
    let finalTotal = productsList.length < totalCount ? productsList.length : totalCount;

     // 8.4. 精确搜索模式下的结果过滤（确保完全匹配，不区分大小写）
     // 注意：过滤应该在排序和分页之前进行
     if (searchMode === 'exact' && search.trim()) {
       const exactTerm = search.trim().toLowerCase();
       productsList = productsList.filter((p: any) => {
         const nameMatch = p.name?.toLowerCase() === exactTerm;
         const codeMatch = p.default_code?.toLowerCase() === exactTerm;
         const barcodeMatch = p.barcode?.toLowerCase() === exactTerm;
         return nameMatch || codeMatch || barcodeMatch;
       });
       // 更新总数
       finalTotal = productsList.length;
     }
     
     // 8.4.1. 按名称搜索模式下的引号短语过滤（确保精确短语完全匹配，与模糊搜索逻辑一致）
     if (searchMode === 'name' && search.trim()) {
       const searchTerm = search.trim();
       
       // 辅助函数：检查字符是否是引号（支持中英文引号）
       const isQuote = (char: string) => {
         return char === '"' || char === '"' || char === '"';
       };
       
       // 解析搜索词：分离引号短语和普通关键词（与构建搜索域时的逻辑一致）
       const parts: Array<{type: 'exact' | 'fuzzy', value: string}> = [];
       let currentPart = '';
       let inQuotes = false;
       
       for (let i = 0; i < searchTerm.length; i++) {
         const char = searchTerm[i];
         if (isQuote(char)) {
           if (inQuotes) {
             // 结束引号
             if (currentPart.trim()) {
               parts.push({ type: 'exact', value: currentPart.trim() });
             }
             currentPart = '';
             inQuotes = false;
           } else {
             // 开始引号
             if (currentPart.trim()) {
               // 将引号前的部分作为模糊关键词处理
               const fuzzyKeywords = currentPart.trim().split(/\s+/).filter(k => k.length > 0);
               fuzzyKeywords.forEach(k => parts.push({ type: 'fuzzy', value: k }));
             }
             currentPart = '';
             inQuotes = true;
           }
         } else {
           currentPart += char;
         }
       }
       
       // 处理最后一部分
       if (currentPart.trim()) {
         if (inQuotes) {
           parts.push({ type: 'exact', value: currentPart.trim() });
         } else {
           // 将剩余部分拆分为多个模糊关键词
           const fuzzyKeywords = currentPart.trim().split(/\s+/).filter(k => k.length > 0);
           fuzzyKeywords.forEach(k => parts.push({ type: 'fuzzy', value: k }));
         }
       }
       
       // 如果没有解析出任何部分，使用整个搜索词作为模糊搜索
       if (parts.length === 0) {
         const keywords = searchTerm.split(/\s+/).filter(k => k.length > 0);
         keywords.forEach(k => parts.push({ type: 'fuzzy', value: k }));
       }
       
       console.log(`[按名称搜索过滤] 搜索词: "${searchTerm}", 解析结果:`, JSON.stringify(parts, null, 2));
       console.log(`[按名称搜索过滤] 过滤前产品数量: ${productsList.length}`);
       
       // 过滤结果：确保所有部分都在名称中正确匹配（与模糊搜索逻辑一致）
       if (parts.length > 0) {
         const beforeCount = productsList.length;
         productsList = productsList.filter((p: any) => {
           const nameLower = (p.name || '').toLowerCase();
           const allMatch = parts.every(part => {
             const partValueLower = part.value.toLowerCase();
             if (part.type === 'exact') {
               // 精确短语：必须作为完整子字符串出现在名称中
               const matches = nameLower.includes(partValueLower);
               if (!matches) {
                 console.log(`[按名称搜索过滤] 产品 "${p.name}" 不匹配精确短语 "${part.value}"`);
               }
               return matches;
             } else {
               // 模糊关键词：在名称中出现即可
               const matches = nameLower.includes(partValueLower);
               if (!matches) {
                 console.log(`[按名称搜索过滤] 产品 "${p.name}" 不匹配模糊关键词 "${part.value}"`);
               }
               return matches;
             }
           });
           if (allMatch) {
             console.log(`[按名称搜索过滤] 产品 "${p.name}" 匹配所有条件`);
           }
           return allMatch;
         });
         console.log(`[按名称搜索过滤] 过滤后产品数量: ${productsList.length} (过滤前: ${beforeCount})`);
         // 更新总数
         finalTotal = productsList.length;
       }
     }

    // 8.4.2. 模糊搜索模式下的引号短语过滤（确保精确短语完全匹配）
    if (searchMode === 'fuzzy' && search.trim()) {
      const searchTerm = search.trim();
      
      // 辅助函数：检查字符是否是引号（支持中英文引号）
      const isQuote = (char: string) => {
        return char === '"' || char === '"' || char === '"';
      };
      
      const exactPhrases: string[] = [];
      let currentPart = '';
      let inQuotes = false;
      
      // 提取所有引号包裹的精确短语
      for (let i = 0; i < searchTerm.length; i++) {
        const char = searchTerm[i];
        if (isQuote(char)) {
          if (inQuotes) {
            if (currentPart.trim()) {
              exactPhrases.push(currentPart.trim().toLowerCase());
            }
            currentPart = '';
            inQuotes = false;
          } else {
            currentPart = '';
            inQuotes = true;
          }
        } else if (inQuotes) {
          currentPart += char;
        }
      }
      
      // 如果有精确短语，过滤结果确保精确短语完全匹配
      if (exactPhrases.length > 0) {
        productsList = productsList.filter((p: any) => {
          const nameLower = (p.name || '').toLowerCase();
          const codeLower = (p.default_code || '').toLowerCase();
          const barcodeLower = (p.barcode || '').toLowerCase();
          return exactPhrases.every(phrase => {
            // 精确短语必须作为完整子字符串出现在名称、SKU或条码中
            return nameLower.includes(phrase) || codeLower.includes(phrase) || barcodeLower.includes(phrase);
          });
        });
        // 更新总数
        finalTotal = productsList.length;
      }
    }

     // 8.5. 应用排序（对于需要应用层排序的字段）
     // 注意：排序应该在所有产品上进行，然后再分页
     if (needsAppSort) {
       productsList.sort((a: any, b: any) => {
         const aVal = a[sortField] ?? 0;
         const bVal = b[sortField] ?? 0;
         if (sortOrder === 'asc') {
           return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
         } else {
           return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
         }
       });
     }
     
     // 8.6. 对所有产品排序后，进行分页
     // 无论是Odoo层面排序还是应用层排序，都需要先排序后分页
     const offset = (page - 1) * pageSize;
     const startIndex = offset;
     const endIndex = offset + pageSize;
     productsList = productsList.slice(startIndex, endIndex);

    // 9. 应用前端筛选（库存筛选，因为这些无法在Odoo层面直接筛选）
    // 注意：价格筛选和POS类别筛选已经在Odoo层面完成
    // 如果应用了库存筛选，需要重新获取所有产品并筛选后再分页
    const needsClientSideFilter = filterStoreStock || filterHeadquartersStock;
    
    if (needsClientSideFilter) {
      // 需要获取所有符合条件的产品，然后筛选，再分页
      const allProductsForFilter = await rpc('/web/dataset/call_kw', {
        model: 'product.product',
        method: 'search_read',
        args: [
          searchDomain.length > 0 ? searchDomain : [],
          [
            'id',
            'name',
            'barcode',
            'default_code',
            'qty_available',
            'free_qty',
            'list_price',
            'standard_price',
            'product_tmpl_id',
            'image_128'
          ]
        ],
        kwargs: {
          limit: 10000, // 限制最大数量以避免性能问题
          order: (() => {
            if (sortField === 'name' || sortField === 'list_price' || sortField === 'qty_available') {
              return `${sortField} ${sortOrder}`;
            }
            return 'name asc';
          })(),
          context: ctx
        }
      }, sessionId, base);

      if (allProductsForFilter && Array.isArray(allProductsForFilter)) {
        // 重新获取所有相关数据（自定义字段、POS类别、销售数量、采购数量）
        const allProductIds = allProductsForFilter.map((p: any) => p.id);
        const allTemplateIds = [...new Set(allProductsForFilter.map((p: any) => p.product_tmpl_id?.[0]).filter(Boolean))];

        // 如果有多公司环境，先获取属于当前公司的订单ID（用于过滤销售数量）
        // 注意：必须确保与销售订单记录API使用相同的过滤逻辑
        let companyOrderIds: number[] = [];
        if (companyId) {
          try {
            const orderIdsResult = await rpc('/web/dataset/call_kw', {
              model: 'pos.order',
              method: 'search',
              args: [[['company_id', '=', companyId]]],
              kwargs: { 
                limit: 50000, // 限制最大订单数，避免性能问题，与sales-history API保持一致
                context: ctx 
              }
            }, sessionId, base);
            
            if (Array.isArray(orderIdsResult) && orderIdsResult.length > 0) {
              companyOrderIds = orderIdsResult;
            } else {
              console.warn(`未找到属于公司 ${companyId} 的订单，销售数量可能包含其他公司的数据`);
            }
          } catch (e) {
            console.error('获取公司订单ID失败:', e);
          }
        }

        // 并行获取所有辅助数据（自定义字段、POS类别、销售数量、采购数量）
        const [
          allCustomFieldsResult,
          allPosCategoryResult,
          allSalesQuantityResult,
          allPurchaseQuantityResult
        ] = await Promise.allSettled([
          // 获取自定义字段
          rpc('/web/dataset/call_kw', {
            model: 'product.product',
            method: 'read',
            args: [allProductIds, ['raytech_stock', 'raytech_p3']],
            kwargs: { context: ctx }
          }, sessionId, base).catch(() => []),
          // 获取POS类别（优化：只在需要时获取类别映射）
          (async () => {
            if (allTemplateIds.length === 0) return { templatesData: [], categoryMap: new Map() };
            try {
              const allTemplatesData = await rpc('/web/dataset/call_kw', {
                model: 'product.template',
                method: 'read',
                args: [allTemplateIds, ['id', 'pos_categ_ids']],
                kwargs: { context: ctx }
              }, sessionId, base);

              let categoryMap = new Map();
              let needsCategoryMap = false;
              
              if (allTemplatesData && Array.isArray(allTemplatesData)) {
                for (const t of allTemplatesData) {
                  const categoryFieldValue = t.pos_categ_ids;
                  if (categoryFieldValue && Array.isArray(categoryFieldValue) && categoryFieldValue.length > 0) {
                    if (!Array.isArray(categoryFieldValue[0])) {
                      needsCategoryMap = true;
                      break;
                    }
                  }
                }
              }

              if (needsCategoryMap) {
                try {
                  const posCategoriesData = await rpc('/web/dataset/call_kw', {
                    model: 'pos.category',
                    method: 'search_read',
                    args: [[], ['id', 'name']],
                    kwargs: { context: ctx }
                  }, sessionId, base);
                  
                  if (posCategoriesData && Array.isArray(posCategoriesData)) {
                    posCategoriesData.forEach((cat: any) => {
                      categoryMap.set(cat.id, cat.name);
                    });
                  }
                } catch (e) {
                  // 忽略错误
                }
              }

              return { templatesData: allTemplatesData || [], categoryMap };
            } catch (e) {
              return { templatesData: [], categoryMap: new Map() };
            }
          })(),
          // 获取销售数量（优先使用read_group）
          // 注意：需要应用公司过滤，确保与销售订单列表一致
          (async () => {
            // 构建查询条件：产品ID + 公司过滤（如果有多公司环境）
            // 注意：必须与sales-history API使用相同的过滤逻辑
            let salesDomain: any[] = [['product_id', 'in', allProductIds]];
            if (companyId) {
              if (companyOrderIds.length > 0) {
                salesDomain.push(['order_id', 'in', companyOrderIds]);
              } else {
                console.warn('公司订单ID为空，销售数量查询可能不准确');
                return [];
              }
            }
            
            try {
              // 添加超时控制，避免502/504错误
              const timeoutPromise = new Promise<never>((_, reject) => 
                setTimeout(() => reject(new Error('销售数量查询超时')), 10000)
              );
              
              const salesDataPromise = rpc('/web/dataset/call_kw', {
                model: 'pos.order.line',
                method: 'read_group',
                args: [
                  salesDomain,
                  ['qty'],
                  ['product_id'],
                ],
                kwargs: { context: ctx }
              }, sessionId, base);
              
              const salesData = await Promise.race([salesDataPromise, timeoutPromise]);
              return salesData || [];
            } catch (e: any) {
              // 备用方案：使用search_read（但限制更小）
              try {
                const timeoutPromise2 = new Promise<never>((_, reject) => 
                  setTimeout(() => reject(new Error('销售数量查询超时')), 10000)
                );
                
                const salesDataPromise2 = rpc('/web/dataset/call_kw', {
                  model: 'pos.order.line',
                  method: 'search_read',
                  args: [
                    salesDomain,
                    ['product_id', 'qty']
                  ],
                  kwargs: { 
                    limit: 10000, // 进一步降低限制，避免502/504错误
                    context: ctx 
                  }
                }, sessionId, base);
                
                const salesData = await Promise.race([salesDataPromise2, timeoutPromise2]);
                return salesData || [];
              } catch (e2: any) {
                console.warn('销售数量查询失败，返回空数组:', e2?.message);
                return [];
              }
            }
          })(),
          // 获取采购数量（需要应用公司过滤）
          // 注意：必须与采购订单记录API使用相同的过滤逻辑
          (async () => {
            if (allProductIds.length === 0) return [];
            
            // 构建查询条件：产品ID + 公司过滤（如果有多公司环境）
            let purchaseDomain: any[] = [['product_id', 'in', allProductIds]];
            
            // 如果有多公司环境，需要获取属于当前公司的采购订单ID
            // 注意：companyOrderIds是销售订单ID，需要单独获取采购订单ID
            let companyPurchaseOrderIds: number[] = [];
            if (companyId) {
              try {
                const orderIdsResult = await rpc('/web/dataset/call_kw', {
                  model: 'purchase.order',
                  method: 'search',
                  args: [[['company_id', '=', companyId]]],
                  kwargs: { 
                    limit: 50000, // 限制最大订单数，避免性能问题，与purchase-history API保持一致
                    context: ctx 
                  }
                }, sessionId, base);
                
                if (Array.isArray(orderIdsResult) && orderIdsResult.length > 0) {
                  companyPurchaseOrderIds = orderIdsResult;
                  purchaseDomain.push(['order_id', 'in', companyPurchaseOrderIds]);
                } else {
                  console.warn(`未找到属于公司 ${companyId} 的采购订单，采购数量可能包含其他公司的数据`);
                  return [];
                }
              } catch (e) {
                console.error('获取公司采购订单ID失败:', e);
                return [];
              }
            }
            
            try {
              return await rpc('/web/dataset/call_kw', {
                model: 'purchase.order.line',
                method: 'read_group',
                args: [
                  purchaseDomain,
                  ['product_qty'],
                  ['product_id'],
                ],
                kwargs: { context: ctx }
              }, sessionId, base);
            } catch (e: any) {
              console.warn('采购数量查询失败，返回空数组:', e?.message);
              return [];
            }
          })()
        ]);

        // 处理自定义字段结果
        let allCustomFieldsMap = new Map();
        if (allCustomFieldsResult.status === 'fulfilled' && Array.isArray(allCustomFieldsResult.value)) {
          allCustomFieldsResult.value.forEach((p: any) => {
            allCustomFieldsMap.set(p.id, {
              raytech_stock: p.raytech_stock || null,
              raytech_p3: p.raytech_p3 || null,
              raytech_web_name: p.raytech_web_name || null
            });
          });
        }

        // 处理POS类别结果
        let allPosCategoryMap = new Map();
        if (allPosCategoryResult.status === 'fulfilled' && allPosCategoryResult.value && !Array.isArray(allPosCategoryResult.value)) {
          const { templatesData, categoryMap } = allPosCategoryResult.value;
          if (templatesData && Array.isArray(templatesData)) {
            templatesData.forEach((t: any) => {
              let categoryName = '未分类';
              const categoryFieldValue = t.pos_categ_ids;
              
              if (categoryFieldValue && Array.isArray(categoryFieldValue) && categoryFieldValue.length > 0) {
                if (Array.isArray(categoryFieldValue[0])) {
                  categoryName = categoryFieldValue[0][1] || categoryMap.get(categoryFieldValue[0][0]) || '未分类';
                } else {
                  categoryName = categoryMap.get(categoryFieldValue[0]) || '未分类';
                }
              }
              
              allPosCategoryMap.set(t.id, categoryName);
            });
          }
        }

        // 处理销售数量结果
        let allSalesQuantityMap = new Map();
        if (allSalesQuantityResult.status === 'fulfilled' && Array.isArray(allSalesQuantityResult.value)) {
          allSalesQuantityResult.value.forEach((item: any) => {
            const productId = item.product_id?.[0];
            const qty = item.qty || 0;
            if (productId) {
              const current = allSalesQuantityMap.get(productId) || 0;
              allSalesQuantityMap.set(productId, current + qty);
            }
          });
        }

        // 处理采购数量结果
        let allPurchaseQuantityMap = new Map();
        if (allPurchaseQuantityResult.status === 'fulfilled' && Array.isArray(allPurchaseQuantityResult.value)) {
          allPurchaseQuantityResult.value.forEach((item: any) => {
            const productId = item.product_id?.[0];
            const totalQty = item.product_qty || 0;
            if (productId) {
              allPurchaseQuantityMap.set(productId, totalQty);
            }
          });
        }

        // 重新组合所有产品数据
        let allProductsList = allProductsForFilter.map((product: any) => {
          const customFields = allCustomFieldsMap.get(product.id) || {};
          const templateId = product.product_tmpl_id?.[0];
          const productPosCategory = allPosCategoryMap.get(templateId) || '未分类';
          const salesQty = allSalesQuantityMap.get(product.id) || 0;
          const purchaseQty = allPurchaseQuantityMap.get(product.id) || 0;

          // 排除"Unset"类别的产品
          if (productPosCategory.toLowerCase() === 'unset') {
            return null;
          }

          return {
            id: product.id,
            name: product.name || '未知产品',
            barcode: product.barcode || '',
            default_code: product.default_code || '',
            qty_available: product.qty_available || 0,
            free_qty: product.free_qty || 0,
            list_price: product.list_price || 0,
            standard_price: product.standard_price || 0,
            raytech_stock: customFields.raytech_stock || null,
            raytech_p3: customFields.raytech_p3 || null,
            image_128: product.image_128 || null,
            pos_category: productPosCategory,
            sales_quantity: salesQty,
            purchase_quantity: purchaseQty
          };
        }).filter((p: any) => p !== null); // 过滤掉Unset类别的产品

        // 应用精确搜索过滤
        if (searchMode === 'exact' && search.trim()) {
          const exactTerm = search.trim().toLowerCase();
          allProductsList = allProductsList.filter((p: any) => {
            const nameMatch = p.name?.toLowerCase() === exactTerm;
            const codeMatch = p.default_code?.toLowerCase() === exactTerm;
            const barcodeMatch = p.barcode?.toLowerCase() === exactTerm;
            return nameMatch || codeMatch || barcodeMatch;
          });
        }

        // 应用模糊搜索的引号短语过滤
        if (searchMode === 'fuzzy' && search.trim()) {
          const searchTerm = search.trim();
          const exactPhrases: string[] = [];
          let currentPart = '';
          let inQuotes = false;
          
          for (let i = 0; i < searchTerm.length; i++) {
            const char = searchTerm[i];
            if (char === '"') {
              if (inQuotes) {
                if (currentPart.trim()) {
                  exactPhrases.push(currentPart.trim().toLowerCase());
                }
                currentPart = '';
                inQuotes = false;
              } else {
                currentPart = '';
                inQuotes = true;
              }
            } else if (inQuotes) {
              currentPart += char;
            }
          }
          
          if (exactPhrases.length > 0) {
            allProductsList = allProductsList.filter((p: any) => {
              return exactPhrases.every(phrase => {
                const nameMatch = p.name?.toLowerCase() === phrase;
                const codeMatch = p.default_code?.toLowerCase() === phrase;
                const barcodeMatch = p.barcode?.toLowerCase() === phrase;
                return nameMatch || codeMatch || barcodeMatch;
              });
            });
          }
        }

        // 应用排序（对于需要应用层排序的字段）
        const needsAppSort = ['sales_quantity', 'purchase_quantity', 'raytech_p3'].includes(sortField);
        if (needsAppSort) {
          allProductsList.sort((a: any, b: any) => {
            const aVal = a[sortField] ?? 0;
            const bVal = b[sortField] ?? 0;
            if (sortOrder === 'asc') {
              return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            } else {
              return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
            }
          });
        }

        // 应用库存筛选
        if (filterStoreStock === 'true') {
          allProductsList = allProductsList.filter((p: any) => p !== null && p.qty_available > 0);
        } else if (filterStoreStock === 'false') {
          allProductsList = allProductsList.filter((p: any) => p !== null && p.qty_available <= 0);
        }

        if (filterHeadquartersStock === 'true') {
          allProductsList = allProductsList.filter((p: any) => p !== null && (p.raytech_stock ?? 0) > 0);
        } else if (filterHeadquartersStock === 'false') {
          allProductsList = allProductsList.filter((p: any) => p !== null && (p.raytech_stock ?? 0) <= 0);
        }

        // 分页
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        productsList = allProductsList.slice(startIndex, endIndex);
        finalTotal = allProductsList.length;
      }
    } else {
      // 没有客户端筛选，使用原来的逻辑
      if (filterStoreStock === 'true') {
        productsList = productsList.filter((p: any) => p.qty_available > 0);
      } else if (filterStoreStock === 'false') {
        productsList = productsList.filter((p: any) => p.qty_available <= 0);
      }

      if (filterHeadquartersStock === 'true') {
        productsList = productsList.filter((p: any) => (p.raytech_stock ?? 0) > 0);
      } else if (filterHeadquartersStock === 'false') {
        productsList = productsList.filter((p: any) => (p.raytech_stock ?? 0) <= 0);
      }
    }

    // 10. 重新计算总数（基于筛选后的结果）
    // 如果已经通过客户端筛选处理，finalTotal已经在上面设置
    // 否则需要重新计算
    if (!needsClientSideFilter && (filterStoreStock || filterHeadquartersStock)) {
      // 如果有无法在Odoo层面筛选的条件，需要获取所有产品来计算总数
      // 获取所有符合价格筛选条件的产品（价格筛选已在Odoo层面完成）
      const allProductsData = await rpc('/web/dataset/call_kw', {
        model: 'product.product',
        method: 'search_read',
        args: [
          searchDomain.length > 0 ? searchDomain : [],
          [
            'id',
            'qty_available',
            'product_tmpl_id'
          ]
        ],
        kwargs: {
          limit: 10000, // 限制最大数量以避免性能问题
          order: 'name asc',
          context: ctx
        }
      }, sessionId, base);

      if (allProductsData && Array.isArray(allProductsData)) {
        // 获取所有产品的模板ID
        const allTemplateIds = [...new Set(allProductsData.map((p: any) => p.product_tmpl_id?.[0]).filter(Boolean))];
        
        // 获取所有产品的POS类别
        let allPosCategoryMap = new Map();
        if (allTemplateIds.length > 0) {
          try {
            const allTemplatesData = await rpc('/web/dataset/call_kw', {
              model: 'product.template',
              method: 'read',
              args: [allTemplateIds, ['id', 'pos_categ_ids']],
              kwargs: { context: ctx }
            }, sessionId, base);

            if (allTemplatesData && Array.isArray(allTemplatesData)) {
              const categoryMap = new Map();
              // 获取所有POS类别
              const posCategoriesData = await rpc('/web/dataset/call_kw', {
                model: 'pos.category',
                method: 'search_read',
                args: [[], ['id', 'name']],
                kwargs: { context: ctx }
              }, sessionId, base);

              if (posCategoriesData && Array.isArray(posCategoriesData)) {
                posCategoriesData.forEach((cat: any) => {
                  categoryMap.set(cat.id, cat.name);
                });
              }

              allTemplatesData.forEach((t: any) => {
                let categoryName = '未分类';
                const categoryFieldValue = t.pos_categ_ids;
                
                if (categoryFieldValue && Array.isArray(categoryFieldValue) && categoryFieldValue.length > 0) {
                  if (Array.isArray(categoryFieldValue[0])) {
                    categoryName = categoryFieldValue[0][1] || categoryMap.get(categoryFieldValue[0][0]) || '未分类';
                  } else {
                    categoryName = categoryMap.get(categoryFieldValue[0]) || '未分类';
                  }
                }
                
                allPosCategoryMap.set(t.id, categoryName);
              });
            }
          } catch (e) {
            console.warn('获取所有POS类别失败:', e);
          }
        }

        // 获取所有产品的自定义字段
        const allProductIds = allProductsData.map((p: any) => p.id);
        let allCustomFieldsMap = new Map();
        try {
          const allCustomData = await rpc('/web/dataset/call_kw', {
            model: 'product.product',
            method: 'read',
            args: [allProductIds, ['raytech_stock']],
            kwargs: { context: ctx }
          }, sessionId, base);

          if (allCustomData && Array.isArray(allCustomData)) {
            allCustomData.forEach((p: any) => {
              allCustomFieldsMap.set(p.id, {
                raytech_stock: p.raytech_stock || null
              });
            });
          }
        } catch (e) {
          console.warn('获取所有自定义字段失败:', e);
        }

        // 应用筛选
        let filteredAll = allProductsData;
        
        if (filterStoreStock === 'true') {
          filteredAll = filteredAll.filter((p: any) => (p.qty_available || 0) > 0);
        } else if (filterStoreStock === 'false') {
          filteredAll = filteredAll.filter((p: any) => (p.qty_available || 0) <= 0);
        }

        if (filterHeadquartersStock === 'true') {
          filteredAll = filteredAll.filter((p: any) => {
            const customFields = allCustomFieldsMap.get(p.id) || {};
            return (customFields.raytech_stock ?? 0) > 0;
          });
        } else if (filterHeadquartersStock === 'false') {
          filteredAll = filteredAll.filter((p: any) => {
            const customFields = allCustomFieldsMap.get(p.id) || {};
            return (customFields.raytech_stock ?? 0) <= 0;
          });
        }

        // POS类别筛选已经在Odoo层面完成，不需要在这里再次筛选

        finalTotal = filteredAll.length;
      }
    }

    return NextResponse.json({
      products: productsList,
      total: finalTotal,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(finalTotal / pageSize)
    });

  } catch (e: any) {
    console.error('获取产品列表失败:', e);
    return NextResponse.json({
      error: e?.message || '获取产品列表失败',
      details: e?.stack
    }, { status: 500 });
  }
}

