// /app/api/parts-inventory/route.ts
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

    // 获取查询参数
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '100');
    const search = searchParams.get('search') || '';
    const deviceGroup = searchParams.get('deviceGroup') || ''; // 第一类：设备类型（iPhone,iPad,Macbook,Samsung等）
    const partGroup = searchParams.get('partGroup') || ''; // 第二类：部件类型（Battery,Screen,Charging Port,Back Cover/Glass）- 用于Parts类别
    const accessoryGroup = searchParams.get('accessoryGroup') || ''; // 第二类：配件类型（Case,Screen Protector）- 用于Accessories类别
    const brandGroup = searchParams.get('brandGroup') || ''; // 第三类：品牌/材质（Kemeng,OG,DUX DUCIS,Transparent,Silicone）- 用于Accessories类别
    const category = searchParams.get('category') || ''; // 获取类别参数：Parts 或 Accessories

    const cookieStr = `session_id=${session}`;
    const ctx: any = {};
    if (companyId) { 
      ctx.company_id = companyId; 
      ctx.allowed_company_ids = [companyId]; 
    }

    // 先查找Parts和Accessories类别的ID
    const categoryFilter: any[] = [];
    if (category === 'Parts' || category === 'Accessories') {
      // 如果指定了类别，只查询该类别
      categoryFilter.push(['name', '=', category]);
    } else {
      // 如果没有指定类别，查询Parts和Accessories
      categoryFilter.push('|');
      categoryFilter.push(['name', '=', 'Parts']);
      categoryFilter.push(['name', '=', 'Accessories']);
    }

    const posCategoryData = await rpc(
      base,
      '/web/dataset/call_kw',
      {
        model: 'pos.category',
        method: 'search_read',
        args: [
          categoryFilter,
          ['id', 'name']
        ],
        kwargs: { context: ctx },
      },
      cookieStr
    );

    if (posCategoryData?.error) {
      const errorMessage = posCategoryData.error.message || posCategoryData.error.data?.message || JSON.stringify(posCategoryData.error);
      throw new Error(`查找POS类别错误: ${errorMessage}`);
    }

    const posCategories = posCategoryData?.result || [];
    const categoryIds = posCategories.map((cat: any) => cat.id);
    const categoryMap = new Map(posCategories.map((cat: any) => [cat.id, cat.name]));

    if (categoryIds.length === 0) {
      return NextResponse.json({ 
        parts: [],
        total: 0,
        message: category ? `未找到${category}类别` : '未找到Parts或Accessories类别'
      });
    }

    // 构建搜索条件
    // 第一类：设备类型（iPhone, iPad, Macbook, Samsung）- OR关系
    // 第二类：部件类型（Battery, Screen, Charging Port, Back Cover/Glass）- OR关系
    // 第一类和第二类之间是AND关系
    let templateSearchDomain: any[] = [];
    
    // 处理第一类：设备类型
    const deviceKeywords: string[] = [];
    if (deviceGroup) {
      deviceGroup.split(',').forEach(k => {
        const trimmed = k.trim();
        if (trimmed) {
          deviceKeywords.push(trimmed);
        }
      });
    }
    
    // 处理第二类：部件类型（用于Parts类别）
    const partKeywords: string[] = [];
    if (partGroup) {
      partGroup.split(',').forEach(k => {
        const trimmed = k.trim();
        if (trimmed) {
          // Back Cover/Glass特殊处理：转换为多个搜索词
          if (trimmed === 'Back Cover/Glass') {
            partKeywords.push('back cover', 'back glass', 'back glass cover', 'rear cover', 'rear glass');
          } else {
            partKeywords.push(trimmed);
          }
        }
      });
    }
    
    // 处理第二类：配件类型（用于Accessories类别）
    const accessoryKeywords: string[] = [];
    if (accessoryGroup) {
      accessoryGroup.split(',').forEach(k => {
        const trimmed = k.trim();
        if (trimmed) {
          accessoryKeywords.push(trimmed);
        }
      });
    }
    
    // 处理第三类：品牌/材质（用于Accessories类别）
    const brandKeywords: string[] = [];
    if (brandGroup) {
      brandGroup.split(',').forEach(k => {
        const trimmed = k.trim();
        if (trimmed) {
          brandKeywords.push(trimmed);
        }
      });
    }
    
    // 处理手动搜索词
    const manualKeywords: string[] = [];
    if (search.trim()) {
      search.trim().split(/\s+/).forEach(k => {
        if (k.length > 0) {
          manualKeywords.push(k);
        }
      });
    }
    
    // 构建第一类的搜索条件（OR关系）
    const buildGroupCondition = (keywords: string[]): any[] => {
      if (keywords.length === 0) return [];
      
      if (keywords.length === 1) {
        return [
          '|',
          '|',
          ['name', 'ilike', keywords[0]],
          ['default_code', 'ilike', keywords[0]],
          ['barcode', 'ilike', keywords[0]],
        ];
      }
      
      // 多个关键词：构建OR关系
      let currentGroup = [
        '|',
        '|',
        ['name', 'ilike', keywords[0]],
        ['default_code', 'ilike', keywords[0]],
        ['barcode', 'ilike', keywords[0]],
      ];
      
      for (let i = 1; i < keywords.length; i++) {
        const nextKeywordGroup = [
          '|',
          '|',
          ['name', 'ilike', keywords[i]],
          ['default_code', 'ilike', keywords[i]],
          ['barcode', 'ilike', keywords[i]],
        ];
        currentGroup = ['|', ...currentGroup, ...nextKeywordGroup];
      }
      
      return currentGroup;
    };
    
    const deviceCondition = buildGroupCondition(deviceKeywords);
    const partCondition = buildGroupCondition(partKeywords);
    const accessoryCondition = buildGroupCondition(accessoryKeywords);
    const brandCondition = buildGroupCondition(brandKeywords);
    const manualCondition = buildGroupCondition(manualKeywords);
    
    // 组合所有搜索条件
    const allSearchConditions: any[] = [];
    
    // 根据类别组合搜索条件
    if (category === 'Parts') {
      // Parts类别：deviceGroup AND partGroup AND manualSearch
      if (deviceCondition.length > 0 && partCondition.length > 0) {
        allSearchConditions.push('&', ...deviceCondition, ...partCondition);
      } else if (deviceCondition.length > 0) {
        allSearchConditions.push(...deviceCondition);
      } else if (partCondition.length > 0) {
        allSearchConditions.push(...partCondition);
      }
      
      if (manualCondition.length > 0) {
        if (allSearchConditions.length > 0) {
          const existingConditions = [...allSearchConditions];
          allSearchConditions.length = 0;
          allSearchConditions.push('&', ...existingConditions, ...manualCondition);
        } else {
          allSearchConditions.push(...manualCondition);
        }
      }
    } else if (category === 'Accessories') {
      // Accessories类别：deviceGroup AND accessoryGroup AND brandGroup AND manualSearch
      const accessoryConditions: any[] = [];
      
      // 组合三类条件，用AND连接
      if (deviceCondition.length > 0) {
        accessoryConditions.push(...deviceCondition);
      }
      if (accessoryCondition.length > 0) {
        if (accessoryConditions.length > 0) {
          const temp = [...accessoryConditions];
          accessoryConditions.length = 0;
          accessoryConditions.push('&', ...temp, ...accessoryCondition);
        } else {
          accessoryConditions.push(...accessoryCondition);
        }
      }
      if (brandCondition.length > 0) {
        if (accessoryConditions.length > 0) {
          const temp = [...accessoryConditions];
          accessoryConditions.length = 0;
          accessoryConditions.push('&', ...temp, ...brandCondition);
        } else {
          accessoryConditions.push(...brandCondition);
        }
      }
      
      if (accessoryConditions.length > 0) {
        allSearchConditions.push(...accessoryConditions);
      }
      
      if (manualCondition.length > 0) {
        if (allSearchConditions.length > 0) {
          const existingConditions = [...allSearchConditions];
          allSearchConditions.length = 0;
          allSearchConditions.push('&', ...existingConditions, ...manualCondition);
        } else {
          allSearchConditions.push(...manualCondition);
        }
      }
    } else {
      // 默认情况：兼容旧逻辑（Parts类别）
      if (deviceCondition.length > 0 && partCondition.length > 0) {
        allSearchConditions.push('&', ...deviceCondition, ...partCondition);
      } else if (deviceCondition.length > 0) {
        allSearchConditions.push(...deviceCondition);
      } else if (partCondition.length > 0) {
        allSearchConditions.push(...partCondition);
      }
      
      if (manualCondition.length > 0) {
        if (allSearchConditions.length > 0) {
          const existingConditions = [...allSearchConditions];
          allSearchConditions.length = 0;
          allSearchConditions.push('&', ...existingConditions, ...manualCondition);
        } else {
          allSearchConditions.push(...manualCondition);
        }
      }
    }
    
    // 构建最终的domain
    if (categoryIds.length > 0 && allSearchConditions.length > 0) {
      // 既有类别过滤又有搜索：需要明确AND关系
      templateSearchDomain = [
        '&',
        ['type', '=', 'product'],
        '&',
        ['pos_categ_ids', 'in', categoryIds],
        ...allSearchConditions,
      ];
    } else if (categoryIds.length > 0) {
      // 只有类别过滤
      templateSearchDomain = [
        ['type', '=', 'product'],
        ['pos_categ_ids', 'in', categoryIds],
      ];
    } else if (allSearchConditions.length > 0) {
      // 只有搜索
      templateSearchDomain = [
        ['type', '=', 'product'],
        ...allSearchConditions,
      ];
    } else {
      // 只有类型过滤
      templateSearchDomain = [
        ['type', '=', 'product'],
      ];
    }

    // 调试：输出domain结构
    console.log('产品模板搜索domain:', JSON.stringify(templateSearchDomain, null, 2));
    console.log('设备类型关键词:', deviceKeywords);
    console.log('部件类型关键词:', partKeywords);
    console.log('配件类型关键词:', accessoryKeywords);
    console.log('品牌/材质关键词:', brandKeywords);
    console.log('手动搜索关键词:', manualKeywords);

    // 先查询产品模板（过滤POS类别）
    const templatesData = await rpc(
      base,
      '/web/dataset/call_kw',
      {
        model: 'product.template',
        method: 'search_read',
        args: [
          templateSearchDomain,
          ['id']
        ],
        kwargs: { 
          limit: 5000,
          context: ctx 
        },
      },
      cookieStr
    );

    if (templatesData?.error) {
      const errorMessage = templatesData.error.message || templatesData.error.data?.message || JSON.stringify(templatesData.error);
      throw new Error(`查询产品模板错误: ${errorMessage}`);
    }

    const templateIds = (templatesData?.result || []).map((t: any) => t.id);

    if (templateIds.length === 0) {
      return NextResponse.json({ 
        parts: [],
        total: 0,
        message: '未找到Parts或Accessories类别的产品'
      });
    }

    // 查询这些模板对应的产品（product.product）
    const searchDomain: any[] = [
      ['type', '=', 'product'],
      ['product_tmpl_id', 'in', templateIds]
    ];

    // 查询所有匹配的产品
    const productsData = await rpc(
      base,
      '/web/dataset/call_kw',
      {
        model: 'product.product',
        method: 'search_read',
        args: [
          searchDomain,
          [
            'id',
            'name',
            'default_code',
            'barcode',
            'qty_available',
            'free_qty',
            'product_tmpl_id',
            'tracking' // 添加tracking字段来判断是否为设备类产品
          ]
        ],
        kwargs: { 
          limit: 5000, // 增加限制以支持更多产品
          context: ctx 
        },
      },
      cookieStr
    );

    if (productsData?.error) {
      const errorMessage = productsData.error.message || productsData.error.data?.message || JSON.stringify(productsData.error);
      throw new Error(`查询产品错误: ${errorMessage}`);
    }

    // 调试：输出第一个产品的数据结构
    if (productsData?.result && productsData.result.length > 0) {
      console.log('第一个产品数据结构:', JSON.stringify(productsData.result[0], null, 2));
    }

    // 过滤掉没有库存的产品，以及有lot/serial tracking的设备类产品
    // tracking字段: 'none' = 不需要跟踪, 'lot' = 批次跟踪, 'serial' = 序列号跟踪
    const allProducts = (productsData?.result || []).filter((p: any) => {
      const hasStock = (p.qty_available || 0) > 0;
      const isDevice = p.tracking && p.tracking !== 'none'; // 有tracking且不是'none'的产品是设备类产品
      return hasStock && !isDevice; // 只保留有库存且不是设备类的产品
    });
    
    // 手动分页（在内存中）
    const totalCount = allProducts.length;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const products = allProducts.slice(startIndex, endIndex);

    // 获取POS类别信息
    // 先获取所有产品模板ID
    const templateIdsForCategory = [...new Set(products.map((p: any) => p.product_tmpl_id[0]))];
    
    // 查询POS类别信息（使用pos_categ_ids字段）
    let templateMap = new Map();
    
    if (templateIdsForCategory.length > 0) {
      try {
        // 查询产品模板的pos_categ_ids字段
        const batchSize = 500;
        for (let i = 0; i < templateIdsForCategory.length; i += batchSize) {
          const batchIds = templateIdsForCategory.slice(i, i + batchSize);
          
          const templatesData = await rpc(
            base,
            '/web/dataset/call_kw',
            {
              model: 'product.template',
              method: 'search_read',
              args: [
                [['id', 'in', batchIds]],
                ['id', 'pos_categ_ids']
              ],
              kwargs: { context: ctx },
            },
            cookieStr
          );

          if (!templatesData?.error && templatesData?.result) {
            templatesData.result.forEach((t: any) => {
              // pos_categ_ids是Many2many字段，格式: [[id1, name1], [id2, name2]]
              let templateCategoryIds: number[] = [];
              let categoryName = '未分类';
              
              const categoryFieldValue = t.pos_categ_ids;
              
              if (categoryFieldValue && Array.isArray(categoryFieldValue) && categoryFieldValue.length > 0) {
                if (Array.isArray(categoryFieldValue[0])) {
                  // Many2many格式: [[id1, name1], [id2, name2]]
                  templateCategoryIds = categoryFieldValue.map((cat: any) => cat[0]);
                  // 查找Parts或Accessories类别（优先显示）- 检查是否在categoryIds列表中（Parts和Accessories的ID）
                  const partsOrAccessories = categoryFieldValue.find((cat: any) => 
                    categoryIds.includes(cat[0]) // categoryIds是Parts和Accessories的ID列表
                  );
                  if (partsOrAccessories) {
                    categoryName = partsOrAccessories[1] || categoryMap.get(partsOrAccessories[0]) || '未分类';
                  } else {
                    categoryName = categoryFieldValue[0][1] || categoryMap.get(templateCategoryIds[0]) || '未分类';
                  }
                } else {
                  // 单个值格式（不太可能，但处理一下）
                  templateCategoryIds = [categoryFieldValue[0]];
                  categoryName = categoryMap.get(templateCategoryIds[0]) || '未分类';
                }
              }
              
              // 如果categoryMap中有，优先使用categoryMap（Parts或Accessories）
              if (templateCategoryIds.length > 0) {
                // 优先查找Parts或Accessories类别
                const partsOrAccessoriesId = templateCategoryIds.find(id => categoryIds.includes(id));
                if (partsOrAccessoriesId && categoryMap.has(partsOrAccessoriesId)) {
                  categoryName = categoryMap.get(partsOrAccessoriesId);
                } else if (categoryMap.has(templateCategoryIds[0])) {
                  categoryName = categoryMap.get(templateCategoryIds[0]) || '未分类';
                }
              }
              
              templateMap.set(t.id, {
                categoryId: templateCategoryIds.find(id => categoryIds.includes(id)) || templateCategoryIds[0] || null,
                categoryName: categoryName
              });
            });
          } else if (templatesData?.error) {
            console.warn('查询模板失败:', JSON.stringify(templatesData.error, null, 2));
          }
        }
      } catch (e: any) {
        console.warn('查询POS类别失败，使用默认值:', e.message);
        // 如果查询失败，继续处理，使用默认值
      }
    }

    // 组合数据
    const partsInventory = products.map((product: any) => {
      const templateInfo = templateMap.get(product.product_tmpl_id[0]) || { categoryId: null, categoryName: '未分类' };
      
      return {
        id: product.id,
        product_id: product.id,
        product_name: product.name || '未知产品',
        product_code: product.default_code || '',
        product_barcode: product.barcode || '',
        category_id: templateInfo.categoryId,
        category_name: templateInfo.categoryName,
        quantity: product.qty_available || 0,
        free_quantity: product.free_qty || 0,
        // 用于扫码匹配的标识
        scan_key: product.barcode || product.default_code || `PROD-${product.id}`,
      };
    });
    
    // 调试：输出最终数据的类别统计
    const categoryStats = new Map<string, number>();
    partsInventory.forEach((part: any) => {
      const catName = part.category_name || '未分类';
      categoryStats.set(catName, (categoryStats.get(catName) || 0) + 1);
    });
    console.log('最终产品类别统计:', Array.from(categoryStats.entries()));
    console.log('templateMap大小:', templateMap.size, 'products数量:', products.length);

    return NextResponse.json({ 
      parts: partsInventory,
      total: totalCount, // 这是有库存的产品总数
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize)
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '查询失败' }, { status: 500 });
  }
}

