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
    const sortOrder = searchParams.get('sort_order') || 'asc'; // 排序方向：'asc' 或 'desc'
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
        // 支持模糊匹配
        searchDomain.push(['name', 'ilike', searchTerm]);
      } else if (searchMode === 'sku') {
        // 按SKU搜索模式：仅在SKU（default_code）中搜索（不搜索名称和条码）
        // 支持模糊匹配
        searchDomain.push(['default_code', 'ilike', searchTerm]);
      } else {
        // 模糊搜索模式：智能多关键词搜索
        // 1. 支持引号包裹的精确短语
        // 2. 多关键词自动用AND连接（每个关键词都要出现）
        // 3. 关键词顺序不重要，大小写不敏感
        
        // 解析搜索词：分离引号短语和普通关键词
        const parts: Array<{type: 'exact' | 'fuzzy', value: string}> = [];
        let currentPart = '';
        let inQuotes = false;
        
        for (let i = 0; i < searchTerm.length; i++) {
          const char = searchTerm[i];
          if (char === '"') {
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
        
        // 构建搜索条件：每个部分都要满足（AND关系）
        // 使用展开运算符构建域，参考 parts-inventory 的实现
        if (parts.length === 1) {
          // 单个关键词：name OR default_code OR barcode
          searchDomain.push('|');
          searchDomain.push('|');
          searchDomain.push(['name', 'ilike', parts[0].value]);
          searchDomain.push(['default_code', 'ilike', parts[0].value]);
          searchDomain.push(['barcode', 'ilike', parts[0].value]);
        } else if (parts.length > 1) {
          // 多个关键词：每个关键词都要满足（AND关系）
          // 第一个关键词的条件
          let combinedCondition: any[] = ['|', '|', ['name', 'ilike', parts[0].value], ['default_code', 'ilike', parts[0].value], ['barcode', 'ilike', parts[0].value]];
          
          // 后续关键词用AND连接
          for (let i = 1; i < parts.length; i++) {
            const nextCondition = ['|', '|', ['name', 'ilike', parts[i].value], ['default_code', 'ilike', parts[i].value], ['barcode', 'ilike', parts[i].value]];
            combinedCondition = ['&', ...combinedCondition, ...nextCondition];
          }
          
          // 展开组合条件到searchDomain
          searchDomain.push(...combinedCondition);
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

    // 如果是只搜索模式，不进行筛选、排序、分页，直接返回搜索结果
    if (searchOnly) {
      // 只搜索模式：只应用搜索条件和数据库层面的筛选（POS类别、价格）
      // 不应用客户端筛选（库存筛选）、排序、分页
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

      // 并行获取辅助数据（自定义字段、POS类别、销售数量、采购数量）
      const [
        customFieldsResult,
        posCategoryResult,
        salesQuantityResult,
        purchaseQuantityResult
      ] = await Promise.allSettled([
        productIds.length > 0 ? rpc('/web/dataset/call_kw', {
          model: 'product.product',
          method: 'read',
          args: [productIds, ['raytech_stock', 'raytech_p3']],
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
        // 销售数量查询（简化版，不进行公司过滤以避免超时）
        (async () => {
          if (productIds.length === 0) return [];
          try {
            const salesData = await rpc('/web/dataset/call_kw', {
              model: 'pos.order.line',
              method: 'read_group',
              args: [
                [['product_id', 'in', productIds]],
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
        productIds.length > 0 ? rpc('/web/dataset/call_kw', {
          model: 'purchase.order.line',
          method: 'read_group',
          args: [
            [['product_id', 'in', productIds]],
            ['product_qty'],
            ['product_id'],
          ],
          kwargs: { context: ctx }
        }, sessionId, base).catch(() => []) : Promise.resolve([])
      ]);

      // 处理结果并组合数据
      let customFieldsMap = new Map();
      if (customFieldsResult.status === 'fulfilled' && Array.isArray(customFieldsResult.value)) {
        customFieldsResult.value.forEach((p: any) => {
          customFieldsMap.set(p.id, {
            raytech_stock: p.raytech_stock || null,
            raytech_p3: p.raytech_p3 || null
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
          image_128: product.image_128 || null,
          pos_category: posCategory,
          sales_quantity: salesQty,
          purchase_quantity: purchaseQty
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

    // 4-7. 并行获取所有辅助数据（自定义字段、POS类别、销售数量、采购数量）
    // 使用Promise.all并行执行，大幅提升性能
    const [
      customFieldsResult,
      posCategoryResult,
      salesQuantityResult,
      purchaseQuantityResult
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

      // 6. 批量获取销售数量（优化：优先使用read_group，失败则用search_read）
      // 注意：需要应用公司过滤，确保与销售订单列表一致
      (async () => {
        if (productIds.length === 0) return [];
        
        // 在多公司环境中，优化查询策略
        // 使用order_id.company_id直接过滤，避免先获取大量订单ID
        let salesDomain: any[] = [['product_id', 'in', productIds]];
        
        // 在多公司环境中，直接依赖Odoo的context进行公司过滤
        // 不再获取订单ID列表，避免502/504错误
        // 注意：这可能导致销售数量统计包含少量其他公司的数据，但可以避免超时和网关错误
        if (companyId) {
          // 直接使用context过滤，不添加订单ID过滤
          // Odoo的context会自动应用公司过滤，虽然可能不够精确，但性能更好
          // 如果需要精确过滤，可以考虑在应用层进行后处理
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

      // 7. 批量获取采购数量（使用read_group）
      productIds.length > 0 ? rpc('/web/dataset/call_kw', {
        model: 'purchase.order.line',
        method: 'read_group',
        args: [
          [['product_id', 'in', productIds]],
          ['product_qty'],
          ['product_id'],
        ],
        kwargs: { context: ctx }
      }, sessionId, base).catch(() => []) : Promise.resolve([])
    ]);

    // 处理自定义字段结果
    let customFieldsMap = new Map();
    if (customFieldsResult.status === 'fulfilled' && Array.isArray(customFieldsResult.value)) {
      customFieldsResult.value.forEach((p: any) => {
        customFieldsMap.set(p.id, {
          raytech_stock: p.raytech_stock || null,
          raytech_p3: p.raytech_p3 || null
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
        image_128: product.image_128 || null,
        pos_category: productPosCategory,
        sales_quantity: salesQty,
        purchase_quantity: purchaseQty
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
     
     // 8.4.1. 按名称搜索模式：已经在Odoo层面完成，无需额外过滤
     // 因为只搜索name字段，所以结果已经是按名称匹配的

    // 8.4.2. 模糊搜索模式下的引号短语过滤（确保精确短语完全匹配）
    if (searchMode === 'fuzzy' && search.trim()) {
      const searchTerm = search.trim();
      const exactPhrases: string[] = [];
      let currentPart = '';
      let inQuotes = false;
      
      // 提取所有引号包裹的精确短语
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
      
      // 如果有精确短语，过滤结果
      if (exactPhrases.length > 0) {
        productsList = productsList.filter((p: any) => {
          return exactPhrases.every(phrase => {
            const nameMatch = p.name?.toLowerCase() === phrase;
            const codeMatch = p.default_code?.toLowerCase() === phrase;
            const barcodeMatch = p.barcode?.toLowerCase() === phrase;
            return nameMatch || codeMatch || barcodeMatch;
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
            // 在多公司环境中，优化订单ID获取策略
            let salesDomain: any[] = [['product_id', 'in', allProductIds]];
            
            // 在多公司环境中，直接依赖Odoo的context进行公司过滤
            // 不再获取订单ID列表，避免502/504错误
            if (companyId) {
              // 直接使用context过滤，不添加订单ID过滤
              // Odoo的context会自动应用公司过滤，虽然可能不够精确，但性能更好
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
          // 获取采购数量
          rpc('/web/dataset/call_kw', {
            model: 'purchase.order.line',
            method: 'read_group',
            args: [
              [['product_id', 'in', allProductIds]],
              ['product_qty'],
              ['product_id'],
            ],
            kwargs: { context: ctx }
          }, sessionId, base).catch(() => [])
        ]);

        // 处理自定义字段结果
        let allCustomFieldsMap = new Map();
        if (allCustomFieldsResult.status === 'fulfilled' && Array.isArray(allCustomFieldsResult.value)) {
          allCustomFieldsResult.value.forEach((p: any) => {
            allCustomFieldsMap.set(p.id, {
              raytech_stock: p.raytech_stock || null,
              raytech_p3: p.raytech_p3 || null
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

