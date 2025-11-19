'use client';

import { useCallback, useEffect, useState } from 'react';
import { saveOfflineProducts, loadOfflineProducts, clearOfflineProducts } from '@/lib/indexedDB';

type Product = {
  id: number;
  name: string;
  barcode: string;
  default_code: string;
  qty_available: number;
  free_qty: number;
  list_price: number;
  standard_price: number;
  raytech_stock: number | null;
  raytech_p3: number | null;
  raytech_web_name: string | null;
  image_128: string | null;
  pos_category: string;
  sales_quantity: number;
  purchase_quantity: number;
  lot_serial_numbers?: Array<{
    lot_id: number;
    lot_name: string;
    quantity: number;
    location_name: string;
  }>;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]); // 当前显示的产品（经过筛选、排序、分页）
  const [cachedProducts, setCachedProducts] = useState<Product[]>([]); // 缓存的搜索结果（从API获取的完整数据）
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [apiSearchTerm, setApiSearchTerm] = useState(''); // API搜索词（防抖）
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | 'all'>(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [viewMode, setViewMode] = useState<'detailed' | 'list' | 'grid'>('detailed'); // 视图模式：详细、列表、网格
  const [showProductDetailModal, setShowProductDetailModal] = useState(false); // 显示产品详情模态框（用于网格视图）
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null); // 选中的产品（用于网格视图）
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showSalesModal, setShowSalesModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showOrderDetailModal, setShowOrderDetailModal] = useState(false); // 显示订单详情模态框
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<any | null>(null); // 选中的订单详情
  const [orderDetailLoading, setOrderDetailLoading] = useState(false); // 订单详情加载状态
  const [showStockHistoryModal, setShowStockHistoryModal] = useState(false); // 显示库存历史模态框
  const [stockHistory, setStockHistory] = useState<any[]>([]); // 库存变动历史
  const [stockHistoryLoading, setStockHistoryLoading] = useState(false); // 库存历史加载状态
  const [stockHistoryTotal, setStockHistoryTotal] = useState<number>(0); // 库存历史总记录数
  const [stockHistoryPage, setStockHistoryPage] = useState<number>(1); // 库存历史当前页码
  const [stockHistoryPageSize] = useState<number>(20); // 库存历史每页记录数
  const [selectedProductForStockHistory, setSelectedProductForStockHistory] = useState<number | null>(null); // 选中的产品ID（用于库存历史）
  const [showLotSerialModal, setShowLotSerialModal] = useState(false); // 显示Lot/Serial详情模态框
  const [selectedLotSerial, setSelectedLotSerial] = useState<{lot_id: number, product_id: number} | null>(null); // 选中的Lot/Serial
  const [lotSerialDetail, setLotSerialDetail] = useState<any | null>(null); // Lot/Serial详情
  const [lotSerialDetailLoading, setLotSerialDetailLoading] = useState(false); // Lot/Serial详情加载状态
  const [showPurchaseOrderDetailModal, setShowPurchaseOrderDetailModal] = useState(false); // 显示采购订单详情模态框
  const [selectedPurchaseOrderDetail, setSelectedPurchaseOrderDetail] = useState<any | null>(null); // 选中的采购订单详情
  const [purchaseOrderDetailLoading, setPurchaseOrderDetailLoading] = useState(false); // 采购订单详情加载状态
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [salesOrdersTotal, setSalesOrdersTotal] = useState<number>(0); // 总订单行数
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [purchaseOrdersTotal, setPurchaseOrdersTotal] = useState<number>(0); // 采购订单总行数
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [filterStoreStock, setFilterStoreStock] = useState<boolean | null>(null); // null=全部, true=有货, false=无货
  const [filterHeadquartersStock, setFilterHeadquartersStock] = useState<boolean | null>(null); // null=全部, true=有货, false=无货
  const [posCategories, setPosCategories] = useState<string[]>([]); // 所有POS类别列表
  const [selectedPosCategories, setSelectedPosCategories] = useState<string[]>([]); // 选中的POS类别（多选）
  const [minPrice, setMinPrice] = useState<string>(''); // 最低价格
  const [maxPrice, setMaxPrice] = useState<string>(''); // 最高价格
  const [quickFilter, setQuickFilter] = useState<'case' | 'screen_protector' | 'battery' | 'screen' | 'back_cover' | null>(null); // 快捷查找
  const [searchMode, setSearchMode] = useState<'fuzzy' | 'exact' | 'name' | 'sku' | 'lot'>('fuzzy'); // 搜索模式：模糊/精确/按名称/按SKU/按Lot/Serial
  const [sortField, setSortField] = useState<string>('name'); // 排序字段
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc'); // 排序方向
  const [showFilters, setShowFilters] = useState<boolean>(true); // 显示/隐藏筛选器
  const [showSort, setShowSort] = useState<boolean>(true); // 显示/隐藏排序器
  const [enableResultSearch, setEnableResultSearch] = useState<boolean>(false); // 启用"在结果中搜索"
  const [resultSearchInclude, setResultSearchInclude] = useState<string>(''); // 从结果中搜索（包含）
  const [resultSearchExclude, setResultSearchExclude] = useState<string>(''); // 从结果中排除（排除）
  const [offlineMode, setOfflineMode] = useState<boolean>(false); // 离线模式
  const [offlineData, setOfflineData] = useState<Product[]>([]); // 离线数据
  const [downloadingOfflineData, setDownloadingOfflineData] = useState<boolean>(false); // 正在下载离线数据

  // 防抖搜索
  useEffect(() => {
    const timer = setTimeout(() => {
      setApiSearchTerm(searchTerm);
      setCurrentPage(1); // 搜索时重置到第一页
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // 筛选条件变化时重置到第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStoreStock, filterHeadquartersStock, selectedPosCategories, minPrice, maxPrice, quickFilter, searchMode, sortField, sortOrder, resultSearchInclude, resultSearchExclude, pageSize]);

  // 当搜索词变化时，重置缓存和分页
  useEffect(() => {
    if (apiSearchTerm !== searchTerm) {
      setCachedProducts([]);
      setCurrentPage(1);
    }
  }, [apiSearchTerm, searchTerm]);

  // 当API搜索词变化时，重置"在结果中搜索"（包括防抖后的搜索词）
  useEffect(() => {
    // 当API搜索词变化时，重置"在结果中搜索"
    setEnableResultSearch(false);
    setResultSearchInclude('');
    setResultSearchExclude('');
  }, [apiSearchTerm]);

  // 从API加载搜索结果（只传递搜索相关参数，不进行筛选、排序、分页）
  const loadSearchResults = useCallback(async () => {
    // 如果没有搜索词，不进行搜索
    if (!apiSearchTerm.trim() && selectedPosCategories.length === 0 && !minPrice && !maxPrice) {
      setCachedProducts([]);
      setProducts([]);
      setTotalCount(0);
      setTotalPages(1);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (apiSearchTerm.trim()) {
        params.append('search', apiSearchTerm.trim());
        params.append('search_mode', searchMode);
      }
      
      // 只传递搜索相关的筛选（这些需要在数据库层面进行，因为涉及关联查询）
      // POS类别和价格范围需要在数据库层面筛选
      if (selectedPosCategories.length > 0) {
        selectedPosCategories.forEach(cat => {
          params.append('pos_category', cat);
        });
      }
      if (minPrice) {
        params.append('min_price', minPrice);
      }
      if (maxPrice) {
        params.append('max_price', maxPrice);
      }
      
      // 添加标志：只返回搜索结果，不进行客户端筛选、排序、分页
      params.append('search_only', 'true');
      params.append('page_size', '5000'); // 减少一次性获取的数量，避免超时

      // 添加超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时

      try {
        const res = await fetch(`/api/products?${params.toString()}`, { 
          cache: 'no-store',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!res.ok) {
          if (res.status === 401) {
            // 未登录，重定向到登录页
            window.location.href = '/';
            return;
          }
          if (res.status === 504) {
            throw new Error('请求超时，请尝试缩小搜索范围或稍后重试');
          }
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();

        if (data.error) {
          // 检查是否是未登录错误
          if (data.error.includes('未登录') || data.error.includes('未认证') || data.error.includes('Unauthorized')) {
            window.location.href = '/';
            return;
          }
          throw new Error(data.error);
        }

        // 缓存搜索结果
        const searchResults = Array.isArray(data.products) ? data.products : [];
        setCachedProducts(searchResults);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('请求超时，请尝试缩小搜索范围或稍后重试');
        }
        throw fetchError;
      }
    } catch (e: any) {
      const errorMessage = e?.message || '加载产品列表失败';
      // 如果是超时或504错误，提供更友好的提示
      if (errorMessage.includes('504') || errorMessage.includes('超时') || errorMessage.includes('timeout')) {
        setError('请求超时：数据量过大。建议缩小搜索范围（添加更多筛选条件）或使用更具体的搜索关键词。');
      } else {
        setError(errorMessage);
      }
      setCachedProducts([]);
    } finally {
      setLoading(false);
    }
  }, [apiSearchTerm, searchMode, selectedPosCategories, minPrice, maxPrice]);

  // 在客户端进行筛选、排序和分页
  const applyFiltersAndPagination = useCallback(() => {
    let filtered = [...cachedProducts];

    // 应用门店库存筛选
    if (filterStoreStock !== null) {
      if (filterStoreStock === true) {
        filtered = filtered.filter(p => p.qty_available > 0);
      } else {
        filtered = filtered.filter(p => p.qty_available <= 0);
      }
    }

    // 应用总部库存筛选
    if (filterHeadquartersStock !== null) {
      if (filterHeadquartersStock === true) {
        filtered = filtered.filter(p => (p.raytech_stock ?? 0) > 0);
      } else {
        filtered = filtered.filter(p => (p.raytech_stock ?? 0) <= 0);
      }
    }

    // 应用快捷查找筛选
    if (quickFilter !== null) {
      const nameLower = (product: Product) => product.name.toLowerCase();
      const categoryLower = (product: Product) => product.pos_category.toLowerCase();
      
      switch (quickFilter) {
        case 'case':
          filtered = filtered.filter(p => 
            nameLower(p).includes('case') && categoryLower(p) === 'accessories'
          );
          break;
        case 'screen_protector':
          filtered = filtered.filter(p => 
            nameLower(p).includes('screen protector') && categoryLower(p) === 'accessories'
          );
          break;
        case 'battery':
          filtered = filtered.filter(p => 
            nameLower(p).includes('battery') && categoryLower(p) === 'parts'
          );
          break;
        case 'screen':
          filtered = filtered.filter(p => 
            nameLower(p).includes('screen') && categoryLower(p) === 'parts'
          );
          break;
        case 'back_cover':
          filtered = filtered.filter(p => {
            const name = nameLower(p);
            const category = categoryLower(p);
            return category === 'parts' && (
              name.includes('back cover') || 
              name.includes('back glass') || 
              name.includes('backglass') || 
              name.includes('backcover')
            );
          });
          break;
      }
    }

    // 应用"在结果中搜索"筛选
    if (enableResultSearch) {
      // 从结果中搜索（包含）：产品名称或SKU中包含关键词
      if (resultSearchInclude.trim()) {
        const includeKeywords = resultSearchInclude.trim().toLowerCase().split(/\s+/).filter(k => k.length > 0);
        filtered = filtered.filter(p => {
          const nameLower = p.name.toLowerCase();
          const skuLower = (p.default_code || '').toLowerCase();
          
          // 所有关键词都要在名称或SKU中出现（不要求顺序和连续）
          return includeKeywords.every(keyword => 
            nameLower.includes(keyword) || 
            skuLower.includes(keyword)
          );
        });
      }
      
      // 从结果中排除：产品名称或SKU中不包含关键词
      if (resultSearchExclude.trim()) {
        const excludeKeywords = resultSearchExclude.trim().toLowerCase().split(/\s+/).filter(k => k.length > 0);
        filtered = filtered.filter(p => {
          const nameLower = p.name.toLowerCase();
          const skuLower = (p.default_code || '').toLowerCase();
          
          // 排除包含任何排除关键词的产品
          return !excludeKeywords.some(keyword => 
            nameLower.includes(keyword) || 
            skuLower.includes(keyword)
          );
        });
      }
    }

    // 应用排序
    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'default_code':
          aValue = (a.default_code || '').toLowerCase();
          bValue = (b.default_code || '').toLowerCase();
          break;
        case 'pos_category':
          aValue = a.pos_category.toLowerCase();
          bValue = b.pos_category.toLowerCase();
          break;
        case 'list_price':
          aValue = a.list_price;
          bValue = b.list_price;
          break;
        case 'standard_price':
          aValue = a.standard_price;
          bValue = b.standard_price;
          break;
        case 'raytech_p3':
          aValue = a.raytech_p3 ?? 0;
          bValue = b.raytech_p3 ?? 0;
          break;
        case 'qty_available':
          aValue = a.qty_available;
          bValue = b.qty_available;
          break;
        case 'raytech_stock':
          aValue = a.raytech_stock ?? 0;
          bValue = b.raytech_stock ?? 0;
          break;
        case 'sales_quantity':
          aValue = a.sales_quantity;
          bValue = b.sales_quantity;
          break;
        case 'purchase_quantity':
          aValue = a.purchase_quantity;
          bValue = b.purchase_quantity;
          break;
        default:
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    // 计算分页
    const total = filtered.length;
    let paginated: Product[];
    let totalPages: number;
    
    if (pageSize === 'all') {
      // 显示全部产品
      paginated = filtered;
      totalPages = 1;
    } else {
      totalPages = Math.ceil(total / pageSize);
      const startIndex = (currentPage - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      paginated = filtered.slice(startIndex, endIndex);
    }

    setProducts(paginated);
    setTotalCount(total);
    setTotalPages(totalPages);
  }, [cachedProducts, filterStoreStock, filterHeadquartersStock, quickFilter, enableResultSearch, resultSearchInclude, resultSearchExclude, sortField, sortOrder, currentPage, pageSize]);

  // 从IndexedDB加载离线数据
  useEffect(() => {
    if (typeof window !== 'undefined') {
      loadOfflineProducts().then((data) => {
        if (data && data.products && data.products.length > 0) {
          setOfflineData(data.products);
          setOfflineMode(true); // 如果有离线数据，自动启用离线模式
          if (data.timestamp) {
            const age = Date.now() - data.timestamp;
            const oneDay = 24 * 60 * 60 * 1000;
            // 如果数据超过1天，提示用户更新
            if (age > oneDay) {
              console.warn('离线数据已超过1天，建议更新');
            }
          }
        }
      }).catch((e) => {
        console.error('加载离线数据失败:', e);
      });
    }
  }, []);

  // 下载所有产品数据到本地
  const downloadOfflineData = useCallback(async () => {
    setDownloadingOfflineData(true);
    setError(null);
    try {
      // 获取所有产品数据（不进行筛选）
      const params = new URLSearchParams();
      params.append('search_only', 'true');
      params.append('page_size', '50000'); // 获取尽可能多的数据

      const res = await fetch(`/api/products?${params.toString()}`, { 
        cache: 'no-store'
      });
      
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/';
          return;
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();

      if (data.error) {
        if (data.error.includes('未登录') || data.error.includes('未认证') || data.error.includes('Unauthorized')) {
          window.location.href = '/';
          return;
        }
        throw new Error(data.error);
      }

      const allProducts = Array.isArray(data.products) ? data.products : [];
      
      // 保存到IndexedDB（支持更大的数据量）
      if (typeof window !== 'undefined') {
        try {
          await saveOfflineProducts(allProducts);
          setOfflineData(allProducts);
          setOfflineMode(true);
          alert(`成功下载 ${allProducts.length} 个产品数据到本地！`);
        } catch (saveError: any) {
          throw new Error(`保存数据失败: ${saveError?.message || '未知错误'}`);
        }
      }
    } catch (e: any) {
      const errorMessage = e?.message || '下载离线数据失败';
      setError(errorMessage);
      alert(`下载失败: ${errorMessage}`);
    } finally {
      setDownloadingOfflineData(false);
    }
  }, []);

  // 在离线模式下进行本地搜索
  const searchOfflineData = useCallback(() => {
    if (!offlineMode || offlineData.length === 0) {
      setCachedProducts([]);
      setProducts([]);
      setTotalCount(0);
      setTotalPages(1);
      return;
    }

    setLoading(false); // 离线模式不需要loading状态
    let filtered = [...offlineData];

    // 应用搜索条件（如果没有搜索条件，显示所有产品）
    // 注意：离线模式下，如果搜索模式是lot，应该提示用户切换到在线模式
    if (apiSearchTerm.trim()) {
      if (searchMode === 'lot') {
        // Lot/Serial搜索模式在离线模式下不支持，返回空结果
        filtered = [];
      } else {
        const searchTerm = apiSearchTerm.trim();
        
        filtered = filtered.filter(p => {
        const nameLower = p.name.toLowerCase();
        const skuLower = (p.default_code || '').toLowerCase();
        
        if (searchMode === 'exact') {
          // 精确搜索：搜索词必须作为完整子字符串出现在名称或SKU中
          const searchTermLower = searchTerm.toLowerCase();
          return nameLower.includes(searchTermLower) || skuLower.includes(searchTermLower);
        } else if (searchMode === 'name') {
          // 按名称搜索：支持引号包裹的精确短语（支持中英文引号）
          // 使用与API端完全相同的逻辑，但只匹配名称字段
          // 辅助函数：检查字符是否是引号（支持中英文引号）
          const isQuote = (char: string) => {
            return char === '"' || char === '"' || char === '"';
          };
          
          // 解析搜索词：分离引号短语和普通关键词（与API端逻辑一致）
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
          
          // 检查所有部分是否都在名称中匹配（与API端逻辑一致）
          return parts.every(part => {
            const partValueLower = part.value.toLowerCase();
            if (part.type === 'exact') {
              // 精确短语：必须作为完整子字符串出现在名称中
              return nameLower.includes(partValueLower);
            } else {
              // 模糊关键词：在名称中出现即可
              return nameLower.includes(partValueLower);
            }
          });
        } else if (searchMode === 'sku') {
          // 按SKU搜索
          const keywords = searchTerm.toLowerCase().split(/\s+/).filter(k => k.length > 0);
          return keywords.every(k => skuLower.includes(k));
        } else {
          // 模糊搜索：支持引号包裹的精确短语（支持中英文引号）
          // 辅助函数：检查字符是否是引号（支持中英文引号）
          const isQuote = (char: string) => {
            return char === '"' || char === '"' || char === '"';
          };
          
          // 解析搜索词：分离引号短语和普通关键词
          const parts: Array<{type: 'exact' | 'fuzzy', value: string}> = [];
          let currentPart = '';
          let inQuotes = false;
          
          for (let i = 0; i < searchTerm.length; i++) {
            const char = searchTerm[i];
            if (isQuote(char)) {
              if (inQuotes) {
                // 结束引号
                if (currentPart.trim()) {
                  parts.push({ type: 'exact', value: currentPart.trim().toLowerCase() });
                }
                currentPart = '';
                inQuotes = false;
              } else {
                // 开始引号
                if (currentPart.trim()) {
                  // 将引号前的部分作为模糊关键词处理
                  const fuzzyKeywords = currentPart.trim().toLowerCase().split(/\s+/).filter(k => k.length > 0);
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
              parts.push({ type: 'exact', value: currentPart.trim().toLowerCase() });
            } else {
              // 将剩余部分拆分为多个模糊关键词
              const fuzzyKeywords = currentPart.trim().toLowerCase().split(/\s+/).filter(k => k.length > 0);
              fuzzyKeywords.forEach(k => parts.push({ type: 'fuzzy', value: k }));
            }
          }
          
          // 如果没有解析出任何部分，使用整个搜索词作为模糊搜索
          if (parts.length === 0) {
            const keywords = searchTerm.toLowerCase().split(/\s+/).filter(k => k.length > 0);
            keywords.forEach(k => parts.push({ type: 'fuzzy', value: k }));
          }
          
          // 检查所有部分是否匹配
          return parts.every(part => {
            if (part.type === 'exact') {
              // 精确短语：必须作为完整子字符串出现在名称或SKU中
              return nameLower.includes(part.value) || skuLower.includes(part.value);
            } else {
              // 模糊关键词：在名称或SKU中出现即可
              return nameLower.includes(part.value) || skuLower.includes(part.value);
            }
          });
        }
        });
      }
    }

    // 应用POS类别筛选
    if (selectedPosCategories.length > 0) {
      filtered = filtered.filter(p => 
        selectedPosCategories.includes(p.pos_category)
      );
    }

    // 应用价格筛选
    if (minPrice && !isNaN(parseFloat(minPrice))) {
      filtered = filtered.filter(p => p.list_price >= parseFloat(minPrice));
    }
    if (maxPrice && !isNaN(parseFloat(maxPrice))) {
      filtered = filtered.filter(p => p.list_price <= parseFloat(maxPrice));
    }

    // 设置缓存产品（用于后续筛选）
    setCachedProducts(filtered);
  }, [offlineMode, offlineData, apiSearchTerm, searchMode, selectedPosCategories, minPrice, maxPrice]);

  // 当搜索词变化时，从API加载（只在有搜索条件时）
  useEffect(() => {
    // Lot/Serial搜索模式始终使用实时查询，不使用离线数据
    if (searchMode === 'lot') {
      if (apiSearchTerm.trim()) {
        loadSearchResults();
      } else {
        setCachedProducts([]);
        setProducts([]);
        setTotalCount(0);
        setTotalPages(1);
      }
    } else if (offlineMode && offlineData.length > 0) {
      // 离线模式：使用本地数据搜索（即使没有搜索条件也显示所有产品）
      searchOfflineData();
    } else {
      // 在线模式：从API加载
      if (apiSearchTerm.trim() || selectedPosCategories.length > 0 || minPrice || maxPrice) {
        loadSearchResults();
      } else {
        // 如果没有搜索条件，清空缓存和产品列表
        setCachedProducts([]);
        setProducts([]);
        setTotalCount(0);
        setTotalPages(1);
      }
    }
  }, [offlineMode, offlineData, apiSearchTerm, searchMode, selectedPosCategories, minPrice, maxPrice, loadSearchResults, searchOfflineData]);

  // 当筛选、排序、分页变化时，在客户端处理
  useEffect(() => {
    if (cachedProducts.length > 0) {
      applyFiltersAndPagination();
    } else {
      // 如果没有缓存数据，清空产品列表
      setProducts([]);
      setTotalCount(0);
      setTotalPages(1);
    }
  }, [cachedProducts, filterStoreStock, filterHeadquartersStock, sortField, sortOrder, currentPage, applyFiltersAndPagination]);

  // 加载库存变动历史
  const loadStockHistory = useCallback(async (productId: number, page: number = 1) => {
    setStockHistoryLoading(true);
    setSelectedProductForStockHistory(productId);
    try {
      const res = await fetch(`/api/inventory?product_id=${productId}&page=${page}&page_size=${stockHistoryPageSize}`, { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/';
          return;
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      if (data.error) {
        if (data.error.includes('未登录') || data.error.includes('未认证') || data.error.includes('Unauthorized')) {
          window.location.href = '/';
          return;
        }
        throw new Error(data.error);
      }
      setStockHistory(data.history || []);
      setStockHistoryTotal(data.total || 0);
      setStockHistoryPage(page);
      setShowStockHistoryModal(true);
    } catch (e: any) {
      console.error('加载库存历史失败:', e);
      setError(e?.message || '加载库存历史失败');
    } finally {
      setStockHistoryLoading(false);
    }
  }, [stockHistoryPageSize]);

  // 加载产品的所有Lot/Serial详情
  const loadProductLotSerials = useCallback(async (productId: number, includeZero: boolean = true) => {
    setLotSerialDetailLoading(true);
    setSelectedLotSerial({ lot_id: 0, product_id: productId });
    try {
      const res = await fetch(`/api/product-lot-serials/${productId}?include_zero=${includeZero}`, { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/';
          return;
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      if (data.error) {
        if (data.error.includes('未登录') || data.error.includes('未认证') || data.error.includes('Unauthorized')) {
          window.location.href = '/';
          return;
        }
        throw new Error(data.error);
      }
      console.log('API返回的完整数据:', JSON.stringify(data, null, 2));
      if (data && data.product) {
        console.log(`成功加载产品信息: ${data.product.name}`);
        if (data.lot_serials) {
          console.log(`成功加载 ${data.lot_serials.length} 个Lot/Serial`);
        } else {
          console.warn('API返回的数据中没有lot_serials字段');
        }
        setLotSerialDetail(data || null);
        setShowLotSerialModal(true);
      } else {
        console.error('API返回的数据格式不正确，缺少product字段:', data);
        setLotSerialDetail(data || null);
        setShowLotSerialModal(true);
      }
    } catch (e: any) {
      console.error('加载产品Lot/Serial详情失败:', e);
      setError(e?.message || '加载Lot/Serial详情失败');
      // 即使出错也显示模态框，显示错误信息
      setLotSerialDetail({
        product: {
          id: productId,
          name: '',
          code: '',
          barcode: ''
        },
        lot_serials: [],
        error: e?.message || '加载失败'
      });
      setShowLotSerialModal(true);
    } finally {
      setLotSerialDetailLoading(false);
    }
  }, []);

  // 加载采购订单详情
  const loadPurchaseOrderDetail = useCallback(async (orderId: number) => {
    setPurchaseOrderDetailLoading(true);
    setSelectedPurchaseOrderDetail(null);
    try {
      const res = await fetch(`/api/purchase-order/${orderId}`, { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/';
          return;
        }
        if (res.status === 404) {
          setError('订单不存在或无法访问');
          return;
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      if (data.error) {
        if (data.error.includes('未登录') || data.error.includes('未认证') || data.error.includes('Unauthorized')) {
          window.location.href = '/';
          return;
        }
        throw new Error(data.error);
      }
      setSelectedPurchaseOrderDetail(data.order);
      setShowPurchaseOrderDetailModal(true);
    } catch (e: any) {
      console.error('加载采购订单详情失败:', e);
      setError(e?.message || '加载采购订单详情失败');
    } finally {
      setPurchaseOrderDetailLoading(false);
    }
  }, []);

  // 加载订单详情
  const loadOrderDetail = useCallback(async (orderId: number, orderType: 'POS' | 'INV' | 'SO' = 'POS') => {
    setOrderDetailLoading(true);
    setSelectedOrderDetail(null);
    try {
      // 目前只支持POS订单
      if (orderType !== 'POS') {
        setError('暂不支持查看此类型订单的详情');
        return;
      }

      const res = await fetch(`/api/pos-order/${orderId}`, { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/';
          return;
        }
        if (res.status === 404) {
          setError('订单不存在或无法访问');
          return;
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      if (data.error) {
        if (data.error.includes('未登录') || data.error.includes('未认证') || data.error.includes('Unauthorized')) {
          window.location.href = '/';
          return;
        }
        throw new Error(data.error);
      }
      setSelectedOrderDetail(data.order);
      setShowOrderDetailModal(true);
    } catch (e: any) {
      console.error('加载订单详情失败:', e);
      setError(e?.message || '加载订单详情失败');
    } finally {
      setOrderDetailLoading(false);
    }
  }, []);

  // 加载销售订单
  const loadSalesOrders = useCallback(async (productId: number) => {
    setOrdersLoading(true);
    try {
      const res = await fetch(`/api/sales-history?product_id=${productId}&page=1&page_size=500`, { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/';
          return;
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      if (data.error) {
        if (data.error.includes('未登录') || data.error.includes('未认证') || data.error.includes('Unauthorized')) {
          window.location.href = '/';
          return;
        }
        throw new Error(data.error);
      }
      setSalesOrders(Array.isArray(data.salesHistory) ? data.salesHistory : []);
      setSalesOrdersTotal(data.total || 0);
    } catch (e: any) {
      console.error('加载销售订单失败:', e);
      setSalesOrders([]);
      setSalesOrdersTotal(0);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  // 清除所有筛选条件
  const clearAllFilters = useCallback(() => {
    setFilterStoreStock(null);
    setFilterHeadquartersStock(null);
    setSelectedPosCategories([]);
    setMinPrice('');
    setMaxPrice('');
    setQuickFilter(null);
    setEnableResultSearch(false);
    setResultSearchInclude('');
    setResultSearchExclude('');
    setCurrentPage(1);
  }, []);

  // 加载采购订单
  const loadPurchaseOrders = useCallback(async (productId: number) => {
    setOrdersLoading(true);
    try {
      const res = await fetch(`/api/purchase-history?product_id=${productId}&page=1&page_size=500`, { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/';
          return;
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      if (data.error) {
        if (data.error.includes('未登录') || data.error.includes('未认证') || data.error.includes('Unauthorized')) {
          window.location.href = '/';
          return;
        }
        throw new Error(data.error);
      }
      // API返回的字段是purchases，不是purchaseHistory
      setPurchaseOrders(Array.isArray(data.purchases) ? data.purchases : []);
      setPurchaseOrdersTotal(data.total || 0);
    } catch (e: any) {
      console.error('加载采购订单失败:', e);
      setPurchaseOrders([]);
      setPurchaseOrdersTotal(0);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  // 加载POS类别列表
  const loadPosCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/pos-categories', { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/';
          return;
        }
        console.warn('加载POS类别失败:', `HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      if (data.error) {
        if (data.error.includes('未登录') || data.error.includes('未认证') || data.error.includes('Unauthorized')) {
          window.location.href = '/';
          return;
        }
        console.warn('加载POS类别失败:', data.error);
        return;
      }
      const categories = Array.isArray(data.categories) ? (data.categories as string[]) : [];
      // 过滤掉"Unset"和"Others"类别，去重
      const filteredCategories = categories.filter((cat: string) => cat !== 'Unset' && cat !== 'Others');
      const uniqueCategories = [...new Set(filteredCategories)];
      
      // 定义排序顺序
      const sortOrder = ['Phone', 'Tablets', 'Laptop & Others', 'Accessories', 'Parts', 'Repairs'];
      
      // 按照指定顺序排序
      const sortedCategories = uniqueCategories.sort((a, b) => {
        const indexA = sortOrder.indexOf(a);
        const indexB = sortOrder.indexOf(b);
        
        // 如果两个都在排序列表中，按照列表顺序排序
        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB;
        }
        // 如果只有a在排序列表中，a排在前面
        if (indexA !== -1) {
          return -1;
        }
        // 如果只有b在排序列表中，b排在前面
        if (indexB !== -1) {
          return 1;
        }
        // 如果都不在排序列表中，按字母顺序排序
        return a.localeCompare(b);
      });
      
      setPosCategories(sortedCategories);
    } catch (e) {
      console.warn('加载POS类别失败:', e);
    }
  }, []);

  useEffect(() => {
    // 页面加载时只加载POS类别列表，不加载产品
    loadPosCategories();
  }, [loadPosCategories]);

  // 查看大图
  const handleImageClick = useCallback(async (imageData: string | null, productId?: number) => {
    if (!imageData) return;
    
    // 先显示小图
    setSelectedImage(`data:image/png;base64,${imageData}`);
    setShowImageModal(true);
    
    // 如果有产品ID，尝试获取大图（即使离线模式也可以调用远端图片）
    if (productId) {
      try {
        const res = await fetch(`/api/product-image?product_id=${productId}`, { 
          cache: 'no-store' 
        });
        if (res.ok) {
          const data = await res.json();
          if (data.image_1920) {
            // 使用大图替换小图
            setSelectedImage(`data:image/png;base64,${data.image_1920}`);
          }
        } else {
          // 404或其他错误，记录但不影响用户体验（继续使用小图）
          const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
          console.warn(`获取产品 ${productId} 大图失败 (${res.status}):`, errorData.error);
        }
      } catch (error) {
        // 获取大图失败，继续使用小图
        console.warn('获取大图失败，使用小图:', error);
      }
    }
  }, []);

  // 分页处理
  const handlePageChange = useCallback((newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [totalPages]);

  // 表格列排序处理
  const handleColumnSort = useCallback((field: string) => {
    if (sortField === field) {
      // 如果点击的是当前排序字段，切换排序方向
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // 如果点击的是新字段，设置该字段为排序字段，默认降序
      setSortField(field);
      setSortOrder('desc');
    }
    setCurrentPage(1); // 排序后重置到第一页
  }, [sortField, sortOrder]);

  // 筛选已在API层面完成，这里直接使用products
  const filteredProducts = products;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        /* 产品信息项基础样式 - 确保标签和内容对齐 */
        .product-info-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .product-info-item > span:first-child {
          min-width: 90px;
          flex-shrink: 0;
        }
        /* 网格视图优化 */
        .grid-view-container {
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)) !important;
        }
        @media (min-width: 1024px) {
          .grid-view-container {
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)) !important;
          }
          .grid-product-name {
            font-size: 14px !important;
            min-height: 42px !important;
            -webkit-line-clamp: 3 !important;
          }
        }
        @media (min-width: 1440px) {
          .grid-view-container {
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)) !important;
          }
        }
        /* 列表视图移动端优化 */
        @media (max-width: 768px) {
          .list-view-table {
            display: none !important;
          }
          .list-view-mobile {
            display: flex !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
          }
          .list-view-mobile > div {
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
          }
          .list-view-mobile > div > div:first-child {
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            overflow-wrap: break-word !important;
            word-break: break-word !important;
          }
          .list-view-mobile > div > div:last-child {
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
          }
          /* 移除表格中名称列的sticky定位 */
          .list-view-table th:first-child,
          .list-view-table td:first-child {
            position: static !important;
            left: auto !important;
            z-index: auto !important;
          }
        }
        @media (min-width: 769px) {
          .list-view-table {
            display: block !important;
          }
          .list-view-mobile {
            display: none !important;
          }
        }
        @media (max-width: 768px) {
          .products-container {
            padding: 10px !important;
            background: #f9fafb !important;
          }
          /* 顶部导航栏 */
          .top-nav {
            flex-wrap: wrap !important;
            gap: 10px !important;
            padding: 14px 12px !important;
            background: #fff !important;
            border-radius: 12px !important;
            margin-bottom: 12px !important;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05) !important;
          }
          .top-nav-button {
            padding: 10px 16px !important;
            font-size: 13px !important;
            min-height: 44px !important;
            border-radius: 8px !important;
            font-weight: 500 !important;
          }
          /* 搜索区域 */
          .products-header {
            flex-direction: column !important;
            gap: 14px !important;
            padding: 16px 12px !important;
            background: #fff !important;
            border-radius: 12px !important;
            margin-bottom: 12px !important;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05) !important;
          }
          .search-mode-buttons {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px !important;
            width: 100% !important;
          }
          .search-mode-buttons button {
            font-size: 13px !important;
            padding: 12px 14px !important;
            white-space: nowrap !important;
            min-height: 44px !important;
            border-radius: 8px !important;
            font-weight: 500 !important;
            transition: all 0.2s ease !important;
          }
          .products-search {
            width: 100% !important;
            min-width: 100% !important;
          }
          .products-search input {
            font-size: 16px !important;
            padding: 14px 18px !important;
            border: 2px solid #667eea !important;
            box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15) !important;
            border-radius: 10px !important;
            min-height: 48px !important;
          }
          .products-search > div:last-child {
            font-size: 12px !important;
            line-height: 1.5 !important;
            margin-top: 8px !important;
            color: #6b7280 !important;
          }
          .products-search > div:last-child code {
            font-size: 11px !important;
            padding: 2px 6px !important;
            background: #f3f4f6 !important;
            border-radius: 4px !important;
          }
          /* 产品总数显示 */
          .products-header > div:last-child {
            width: 100% !important;
            align-items: flex-start !important;
            min-width: auto !important;
            padding: 12px !important;
            background: #f0f4ff !important;
            border-radius: 8px !important;
          }
          .products-header > div:last-child > div:first-child {
            font-size: 15px !important;
            font-weight: 600 !important;
            color: #667eea !important;
          }
          /* 筛选栏 */
          .filter-bar {
            margin-bottom: 12px !important;
            background: #fff !important;
            border-radius: 12px !important;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05) !important;
            overflow: hidden !important;
          }
          .filter-bar > div:first-child {
            padding: 14px 16px !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            color: #374151 !important;
            background: #f9fafb !important;
            border-bottom: 1px solid #e5e7eb !important;
          }
          .filter-bar > div:last-child {
            padding: 16px !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 16px !important;
          }
          .filter-group {
            width: 100% !important;
            flex-direction: column !important;
            gap: 14px !important;
          }
          .filter-group > div {
            width: 100% !important;
            flex-wrap: wrap !important;
            gap: 8px !important;
          }
          .filter-group > div > span:first-child {
            width: 100% !important;
            margin-bottom: 8px !important;
            font-size: 13px !important;
            font-weight: 500 !important;
            color: #6b7280 !important;
          }
          .filter-buttons {
            font-size: 13px !important;
            padding: 10px 14px !important;
            min-height: 44px !important;
            border-radius: 8px !important;
            font-weight: 500 !important;
          }
          .pos-category-button {
            font-size: 12px !important;
            padding: 10px 14px !important;
            min-height: 44px !important;
            border-radius: 8px !important;
            font-weight: 500 !important;
          }
          .price-filter-input {
            width: 100% !important;
            font-size: 15px !important;
            padding: 12px 14px !important;
            min-height: 44px !important;
            border-radius: 8px !important;
          }
          /* 排序栏 */
          .sort-bar {
            padding: 14px 16px !important;
            flex-direction: column !important;
            gap: 14px !important;
            background: #fff !important;
            border-radius: 12px !important;
            margin-bottom: 12px !important;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05) !important;
          }
          .sort-bar > div:first-child {
            width: 100% !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            color: #374151 !important;
            padding-bottom: 12px !important;
            border-bottom: 1px solid #e5e7eb !important;
          }
          .sort-controls {
            width: 100% !important;
            flex-direction: column !important;
            gap: 10px !important;
          }
          .sort-controls select {
            width: 100% !important;
            font-size: 15px !important;
            padding: 12px 14px !important;
            min-height: 44px !important;
            border-radius: 8px !important;
          }
          .sort-controls button {
            width: 100% !important;
            font-size: 14px !important;
            padding: 12px 16px !important;
            min-height: 44px !important;
            border-radius: 8px !important;
            font-weight: 500 !important;
          }
          /* 筛选结果显示 */
          .filter-results {
            padding: 14px 16px !important;
            font-size: 14px !important;
            margin-top: 12px !important;
            margin-bottom: 12px !important;
            background: #fff !important;
            border-radius: 12px !important;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05) !important;
            font-weight: 500 !important;
          }
          /* 产品卡片 */
          .product-card {
            padding: 16px !important;
            margin-bottom: 12px !important;
            border-radius: 12px !important;
            box-shadow: 0 2px 6px rgba(0,0,0,0.08) !important;
            transition: all 0.2s ease !important;
          }
          .product-card:active {
            transform: scale(0.98) !important;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important;
          }
          .product-info-grid {
            grid-template-columns: 1fr !important;
            gap: 14px !important;
          }
          .product-image-container {
            width: 100% !important;
            max-width: 180px !important;
            height: 180px !important;
            margin: 0 auto 16px !important;
            border-radius: 10px !important;
            overflow: hidden !important;
          }
          .product-name {
            font-size: 16px !important;
            margin-bottom: 12px !important;
            font-weight: 600 !important;
            line-height: 1.5 !important;
          }
          .product-info-grid > div:last-child {
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .product-info-item {
            font-size: 13px !important;
            padding: 10px 0 !important;
            border-bottom: 1px solid #f3f4f6 !important;
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
          }
          .product-info-item > span:first-child {
            min-width: 85px !important;
            flex-shrink: 0 !important;
            font-weight: 500 !important;
          }
          .product-info-item:last-child {
            border-bottom: none !important;
          }
          /* 移动端卡片视图优化 */
          .list-view-mobile > div {
            border-radius: 12px !important;
            box-shadow: 0 2px 6px rgba(0,0,0,0.08) !important;
            transition: all 0.2s ease !important;
          }
          .list-view-mobile > div:active {
            transform: scale(0.98) !important;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important;
          }
          /* 分页控件 */
          .pagination {
            flex-wrap: wrap !important;
            gap: 10px !important;
            padding: 20px 0 !important;
            background: #fff !important;
            border-radius: 12px !important;
            margin-top: 12px !important;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05) !important;
          }
          .pagination button {
            flex: 1 1 calc(50% - 5px) !important;
            min-width: calc(50% - 5px) !important;
            font-size: 14px !important;
            padding: 12px 16px !important;
            min-height: 44px !important;
            border-radius: 8px !important;
            font-weight: 500 !important;
          }
          .pagination > div {
            width: 100% !important;
            justify-content: center !important;
            margin: 12px 0 !important;
            font-size: 14px !important;
            font-weight: 500 !important;
          }
          .pagination input {
            width: 80px !important;
            font-size: 15px !important;
            padding: 10px 12px !important;
            min-height: 44px !important;
            border-radius: 8px !important;
          }
        }
        @media (max-width: 480px) {
          .products-container {
            padding: 8px !important;
          }
          .top-nav {
            padding: 10px 12px !important;
          }
          .top-nav-button {
            padding: 6px 10px !important;
            font-size: 11px !important;
          }
          .products-header {
            padding: 12px !important;
          }
          .search-mode-buttons {
            grid-template-columns: 1fr !important;
            gap: 6px !important;
          }
          .search-mode-buttons button {
            font-size: 11px !important;
            padding: 8px 10px !important;
          }
          .products-search input {
            font-size: 18px !important;
            padding: 14px 16px !important;
            border: 2px solid #667eea !important;
            box-shadow: 0 3px 8px rgba(102, 126, 234, 0.2) !important;
          }
          .products-search > div:last-child {
            font-size: 10px !important;
          }
          .filter-bar > div:first-child {
            padding: 8px 12px !important;
            font-size: 12px !important;
          }
          .filter-bar > div:last-child {
            padding: 10px 12px !important;
          }
          .filter-group > div > span:first-child {
            font-size: 11px !important;
          }
          .filter-buttons {
            font-size: 11px !important;
            padding: 6px 8px !important;
            min-height: 32px !important;
          }
          .pos-category-button {
            font-size: 10px !important;
            padding: 5px 8px !important;
            min-height: 32px !important;
          }
          .price-filter-input {
            width: 90px !important;
            font-size: 13px !important;
            padding: 6px 8px !important;
          }
          .sort-bar {
            padding: 10px 12px !important;
          }
          .sort-bar > div:first-child {
            font-size: 12px !important;
          }
          .sort-controls select,
          .sort-controls button {
            font-size: 13px !important;
            padding: 8px 10px !important;
          }
          .product-card {
            padding: 10px !important;
          }
          .product-image-container {
            max-width: 120px !important;
            height: 120px !important;
          }
          .product-name {
            font-size: 14px !important;
            margin-bottom: 8px !important;
          }
          .product-info-item {
            font-size: 11px !important;
            padding: 5px 0 !important;
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
          }
          .product-info-item > span:first-child {
            min-width: 70px !important;
            flex-shrink: 0 !important;
          }
          .pagination {
            padding: 12px 0 !important;
          }
          .pagination button {
            font-size: 12px !important;
            padding: 8px 10px !important;
          }
          .pagination > div {
            font-size: 12px !important;
          }
          .pagination input {
            width: 60px !important;
            font-size: 13px !important;
            padding: 6px !important;
          }
        }
        /* 模态框移动端样式 */
        @media (max-width: 768px) {
          .order-modal-content {
            max-width: 95% !important;
            max-height: 85vh !important;
            margin: 10px !important;
          }
          .order-modal-title {
            font-size: 18px !important;
            padding: 16px !important;
          }
          .order-modal-title h2 {
            font-size: 18px !important;
          }
          .order-modal-body {
            padding: 16px !important;
          }
          .order-item {
            padding: 12px !important;
            font-size: 13px !important;
          }
          .order-item > div:first-child {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 8px !important;
          }
          .order-item > div:first-child > span:last-child {
            font-size: 18px !important;
          }
        }
        @media (max-width: 480px) {
          .order-modal-content {
            max-width: 100% !important;
            max-height: 90vh !important;
            margin: 0 !important;
            border-radius: 0 !important;
          }
          .order-modal-title {
            font-size: 16px !important;
            padding: 12px !important;
          }
          .order-modal-title h2 {
            font-size: 16px !important;
          }
          .order-modal-body {
            padding: 12px !important;
          }
          .order-item {
            padding: 10px !important;
            font-size: 12px !important;
          }
          .order-item > div:first-child > span:last-child {
            font-size: 16px !important;
          }
        }
        /* 触摸设备优化 */
        @media (hover: none) and (pointer: coarse) {
          button {
            min-height: 44px !important;
          }
          input, select {
            min-height: 44px !important;
            font-size: 16px !important;
          }
          .filter-buttons,
          .pos-category-button,
          .search-mode-buttons button {
            min-height: 44px !important;
          }
        }
        /* Lot/Serial模态框移动端优化 */
        @media (max-width: 768px) {
          .lot-serial-modal-overlay {
            padding: 10px !important;
            align-items: flex-start !important;
          }
          .lot-serial-modal-content {
            max-width: 100% !important;
            max-height: 95vh !important;
            border-radius: 12px 12px 0 0 !important;
            margin: 0 !important;
          }
          .lot-serial-modal-header {
            padding: 16px !important;
          }
          .lot-serial-modal-header h2 {
            font-size: 18px !important;
          }
          .lot-serial-modal-body {
            padding: 16px !important;
          }
          .lot-serial-list-header {
            flex-direction: column !important;
            align-items: flex-start !important;
          }
          .lot-serial-list-header h3 {
            font-size: 15px !important;
            width: 100% !important;
          }
          .lot-serial-item {
            flex-direction: column !important;
            align-items: flex-start !important;
            padding: 12px !important;
            gap: 10px !important;
          }
          .lot-serial-item > div:last-child {
            width: 100% !important;
            display: flex !important;
            justify-content: flex-start !important;
          }
        }
        @media (max-width: 480px) {
          .lot-serial-modal-overlay {
            padding: 0 !important;
          }
          .lot-serial-modal-content {
            max-height: 100vh !important;
            border-radius: 0 !important;
            height: 100vh !important;
          }
          .lot-serial-modal-header {
            padding: 14px 16px !important;
            position: sticky !important;
            top: 0 !important;
            background: #fff !important;
            z-index: 10 !important;
          }
          .lot-serial-modal-header h2 {
            font-size: 16px !important;
          }
          .lot-serial-modal-body {
            padding: 14px !important;
          }
        }
      ` }} />

      <div className="products-container" style={{ 
        maxWidth: '95%', 
        width: '100%',
        margin: '0 auto', 
        padding: '20px',
        minHeight: '100vh',
        background: '#f9fafb'
      }}>
        {/* 顶部导航栏 */}
        <div className="top-nav" style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap'
        }}>
          <a href="/" className="top-nav-button" style={{
            padding: '8px 16px',
            background: '#f3f4f6',
            borderRadius: '8px',
            color: '#374151',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#e5e7eb';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#f3f4f6';
          }}
          >
            ← 返回首页
          </a>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#111827' }}>
              产品查询
            </h1>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {offlineMode && (
              <div style={{
                padding: '6px 12px',
                background: '#d1fae5',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span>📱</span>
                <span>离线模式</span>
                {offlineData.length > 0 && (
                  <span style={{ fontSize: '11px', opacity: 0.8 }}>
                    ({offlineData.length} 个产品)
                  </span>
                )}
              </div>
            )}
            <button
              onClick={downloadOfflineData}
              disabled={downloadingOfflineData}
              style={{
                padding: '8px 16px',
                background: downloadingOfflineData 
                  ? '#d1d5db' 
                  : offlineMode 
                    ? '#f3f4f6' 
                    : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '8px',
                border: 'none',
                color: downloadingOfflineData 
                  ? '#9ca3af' 
                  : offlineMode 
                    ? '#374151' 
                    : '#fff',
                fontSize: '13px',
                fontWeight: 500,
                cursor: downloadingOfflineData ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                boxShadow: !downloadingOfflineData && !offlineMode ? '0 2px 8px rgba(102, 126, 234, 0.3)' : 'none'
              }}
              onMouseEnter={(e) => {
                if (!downloadingOfflineData && !offlineMode) {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                if (!downloadingOfflineData && !offlineMode) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)';
                }
              }}
            >
              {downloadingOfflineData ? (
                <>⏳ 下载中...</>
              ) : offlineMode ? (
                <>🔄 更新离线数据</>
              ) : (
                <>💾 下载离线数据</>
              )}
            </button>
            {offlineMode && (
              <button
                onClick={() => {
                  setOfflineMode(false);
                  setCachedProducts([]);
                  setProducts([]);
                  setTotalCount(0);
                  setTotalPages(1);
                }}
                style={{
                  padding: '8px 16px',
                  background: '#fff',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  color: '#374151',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f3f4f6';
                  e.currentTarget.style.borderColor = '#9ca3af';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#fff';
                  e.currentTarget.style.borderColor = '#d1d5db';
                }}
              >
                🌐 切换在线模式
              </button>
            )}
          </div>
        </div>

        {/* 搜索栏 */}
        <div className="products-header" style={{
          background: 'linear-gradient(135deg, #ffffff 0%, #f8f9ff 100%)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: '0 4px 16px rgba(102, 126, 234, 0.12)',
          border: '1px solid rgba(102, 126, 234, 0.1)'
        }}>
          {/* 搜索模式选择 */}
          <div className="search-mode-buttons" style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '16px',
            paddingBottom: '16px',
            borderBottom: '1px solid #e5e7eb',
            alignItems: 'center'
          }}>
            <div style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#374151',
              marginRight: '8px',
              whiteSpace: 'nowrap'
            }}>
              搜索模式：
            </div>
            <button
              onClick={() => setSearchMode('fuzzy')}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: searchMode === 'fuzzy' 
                  ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
                  : '#f3f4f6',
                color: searchMode === 'fuzzy' ? '#fff' : '#6b7280',
                fontSize: '13px',
                fontWeight: searchMode === 'fuzzy' ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: searchMode === 'fuzzy' ? '0 2px 8px rgba(102, 126, 234, 0.3)' : 'none',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                if (searchMode !== 'fuzzy') {
                  e.currentTarget.style.background = '#e5e7eb';
                  e.currentTarget.style.color = '#374151';
                }
              }}
              onMouseLeave={(e) => {
                if (searchMode !== 'fuzzy') {
                  e.currentTarget.style.background = '#f3f4f6';
                  e.currentTarget.style.color = '#6b7280';
                }
              }}
            >
              🔍 模糊搜索
            </button>
            <button
              onClick={() => setSearchMode('exact')}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: searchMode === 'exact' 
                  ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
                  : '#f3f4f6',
                color: searchMode === 'exact' ? '#fff' : '#6b7280',
                fontSize: '13px',
                fontWeight: searchMode === 'exact' ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: searchMode === 'exact' ? '0 2px 8px rgba(102, 126, 234, 0.3)' : 'none',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                if (searchMode !== 'exact') {
                  e.currentTarget.style.background = '#e5e7eb';
                  e.currentTarget.style.color = '#374151';
                }
              }}
              onMouseLeave={(e) => {
                if (searchMode !== 'exact') {
                  e.currentTarget.style.background = '#f3f4f6';
                  e.currentTarget.style.color = '#6b7280';
                }
              }}
            >
              🎯 精确搜索
            </button>
            <button
              onClick={() => setSearchMode('name')}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: searchMode === 'name' 
                  ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
                  : '#f3f4f6',
                color: searchMode === 'name' ? '#fff' : '#6b7280',
                fontSize: '13px',
                fontWeight: searchMode === 'name' ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: searchMode === 'name' ? '0 2px 8px rgba(102, 126, 234, 0.3)' : 'none',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                if (searchMode !== 'name') {
                  e.currentTarget.style.background = '#e5e7eb';
                  e.currentTarget.style.color = '#374151';
                }
              }}
              onMouseLeave={(e) => {
                if (searchMode !== 'name') {
                  e.currentTarget.style.background = '#f3f4f6';
                  e.currentTarget.style.color = '#6b7280';
                }
              }}
            >
              📝 按名称搜索
            </button>
            <button
              onClick={() => setSearchMode('sku')}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: searchMode === 'sku' 
                  ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
                  : '#f3f4f6',
                color: searchMode === 'sku' ? '#fff' : '#6b7280',
                fontSize: '13px',
                fontWeight: searchMode === 'sku' ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: searchMode === 'sku' ? '0 2px 8px rgba(102, 126, 234, 0.3)' : 'none',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                if (searchMode !== 'sku') {
                  e.currentTarget.style.background = '#e5e7eb';
                  e.currentTarget.style.color = '#374151';
                }
              }}
              onMouseLeave={(e) => {
                if (searchMode !== 'sku') {
                  e.currentTarget.style.background = '#f3f4f6';
                  e.currentTarget.style.color = '#6b7280';
                }
              }}
            >
              🏷️ 按SKU搜索
            </button>
            <button
              onClick={() => setSearchMode('lot')}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: searchMode === 'lot' 
                  ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
                  : '#f3f4f6',
                color: searchMode === 'lot' ? '#fff' : '#6b7280',
                fontSize: '13px',
                fontWeight: searchMode === 'lot' ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: searchMode === 'lot' ? '0 2px 8px rgba(102, 126, 234, 0.3)' : 'none',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                if (searchMode !== 'lot') {
                  e.currentTarget.style.background = '#e5e7eb';
                  e.currentTarget.style.color = '#374151';
                }
              }}
              onMouseLeave={(e) => {
                if (searchMode !== 'lot') {
                  e.currentTarget.style.background = '#f3f4f6';
                  e.currentTarget.style.color = '#6b7280';
                }
              }}
            >
              🔢 按Lot/Serial搜索
            </button>
          </div>

          {/* 搜索输入区域 */}
          <div style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start',
            flexWrap: 'wrap'
          }}>
            <div className="products-search" style={{ 
              flex: 1, 
              minWidth: '300px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <input
                  type="text"
                  placeholder={
                    searchMode === 'fuzzy' 
                      ? '🔍 输入关键词搜索...' 
                      : searchMode === 'exact'
                      ? '🎯 输入完整的产品名称或SKU...'
                      : searchMode === 'name'
                      ? '📝 输入产品名称搜索...'
                      : searchMode === 'sku'
                      ? '🏷️ 输入SKU搜索...'
                      : '🔢 输入Lot/Serial Number搜索...'
                  }
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '18px 24px',
                    paddingBottom: !searchTerm ? '50px' : '18px',
                    borderRadius: '12px',
                    border: '3px solid #667eea',
                    outline: 'none',
                    fontSize: '16px',
                    fontWeight: 500,
                    transition: 'all 0.3s ease',
                    background: '#fff',
                    boxShadow: '0 4px 12px rgba(102, 126, 234, 0.15)',
                    color: '#111827'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#5568d3';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.25)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.background = '#fff';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#667eea';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.15)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.background = '#fff';
                  }}
                />
                {/* 搜索提示 - 只在输入框为空时显示在输入框内部底部 */}
                {!searchTerm && (
                  <div style={{
                    position: 'absolute',
                    bottom: '14px',
                    left: '24px',
                    right: '24px',
                    fontSize: '11px',
                    color: '#9ca3af',
                    lineHeight: '1.4',
                    pointerEvents: 'none',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {searchMode === 'fuzzy' ? (
                      <>💡 支持多关键词（空格分隔），用引号包裹精确短语，如 "iPhone 15" battery</>
                    ) : searchMode === 'exact' ? (
                      <>💡 完全匹配产品名称或SKU（不区分大小写）</>
                    ) : searchMode === 'name' ? (
                      <>💡 仅在产品名称中搜索，支持模糊匹配</>
                    ) : searchMode === 'sku' ? (
                      <>💡 仅在SKU中搜索，支持模糊匹配</>
                    ) : (
                      <>💡 通过Lot/Serial Number搜索产品，支持模糊匹配</>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '4px',
              minWidth: '120px'
            }}>
              <div style={{ 
                fontSize: '16px', 
                fontWeight: 600,
                color: '#111827' 
              }}>
                共 {totalCount} 个产品
              </div>
              {searchTerm && (
                <div style={{ 
                  fontSize: '12px', 
                  color: '#9ca3af' 
                }}>
                  {searchMode === 'fuzzy' ? '模糊匹配' : searchMode === 'exact' ? '精确匹配' : searchMode === 'name' ? '名称搜索' : searchMode === 'sku' ? 'SKU搜索' : 'Lot/Serial搜索'}
                </div>
              )}
            </div>
          </div>

          {/* 在结果中搜索 - 只在有搜索结果时显示 */}
          {cachedProducts.length > 0 && (
          <div style={{
            width: '100%',
            marginTop: '16px',
            padding: '16px',
            background: enableResultSearch ? '#f0f4ff' : '#f9fafb',
            borderRadius: '12px',
            border: enableResultSearch ? '2px solid #667eea' : '1px solid #e5e7eb',
            transition: 'all 0.3s ease'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: enableResultSearch ? '16px' : '0',
              cursor: 'pointer'
            }}
            onClick={() => setEnableResultSearch(!enableResultSearch)}
            >
              <input
                type="checkbox"
                checked={enableResultSearch}
                onChange={(e) => {
                  e.stopPropagation();
                  setEnableResultSearch(e.target.checked);
                }}
                style={{
                  width: '18px',
                  height: '18px',
                  cursor: 'pointer',
                  accentColor: '#667eea'
                }}
              />
              <label style={{
                fontSize: '14px',
                fontWeight: 600,
                color: enableResultSearch ? '#667eea' : '#374151',
                cursor: 'pointer',
                userSelect: 'none'
              }}>
                🔎 在结果中搜索
              </label>
            </div>
            
            {enableResultSearch && (
              <div style={{
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
                alignItems: 'center'
              }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#6b7280',
                    marginBottom: '6px'
                  }}>
                    从结果中搜索（包含）：
                  </label>
                  <input
                    type="text"
                    placeholder="输入关键词，支持多关键词（空格分隔）"
                    value={resultSearchInclude}
                    onChange={(e) => setResultSearchInclude(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      outline: 'none',
                      fontSize: '14px',
                      background: '#fff',
                      transition: 'all 0.2s ease'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#667eea';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>
                
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#6b7280',
                    marginBottom: '6px'
                  }}>
                    从结果中排除：
                  </label>
                  <input
                    type="text"
                    placeholder="输入关键词，支持多关键词（空格分隔），排除产品名称或SKU"
                    value={resultSearchExclude}
                    onChange={(e) => setResultSearchExclude(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      outline: 'none',
                      fontSize: '14px',
                      background: '#fff',
                      transition: 'all 0.2s ease'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#667eea';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          )}
        </div>

        {/* 筛选栏 */}
        <div className="filter-bar" style={{
          background: '#fff',
          borderRadius: '12px',
          marginBottom: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden',
          transition: 'all 0.3s ease'
        }}>
          {/* 筛选栏头部 */}
          <div style={{
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: showFilters ? '1px solid #e5e7eb' : 'none',
            cursor: 'pointer',
            background: showFilters ? '#fff' : '#f9fafb',
            transition: 'all 0.2s ease'
          }}
          onClick={() => setShowFilters(!showFilters)}
          >
            <div style={{ 
              fontSize: '14px', 
              fontWeight: 600, 
              color: '#374151',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ 
                transform: showFilters ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 0.3s ease',
                display: 'inline-block',
                fontSize: '12px'
              }}>▼</span>
              <span>筛选条件</span>
              {(filterStoreStock !== null || filterHeadquartersStock !== null || selectedPosCategories.length > 0 || minPrice || maxPrice || quickFilter !== null || (enableResultSearch && (resultSearchInclude.trim() || resultSearchExclude.trim()))) && (
                <span style={{
                  fontSize: '11px',
                  padding: '2px 6px',
                  borderRadius: '10px',
                  background: '#667eea',
                  color: '#fff',
                  fontWeight: 500
                }}>
                  {[
                    filterStoreStock !== null ? 1 : 0,
                    filterHeadquartersStock !== null ? 1 : 0,
                    selectedPosCategories.length,
                    minPrice ? 1 : 0,
                    maxPrice ? 1 : 0,
                    quickFilter !== null ? 1 : 0,
                    (enableResultSearch && (resultSearchInclude.trim() || resultSearchExclude.trim())) ? 1 : 0
                  ].reduce((a, b) => a + b, 0)}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {(filterStoreStock !== null || filterHeadquartersStock !== null || selectedPosCategories.length > 0 || minPrice || maxPrice || quickFilter !== null || (enableResultSearch && (resultSearchInclude.trim() || resultSearchExclude.trim()))) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearAllFilters();
                  }}
                  style={{
                    padding: '4px 12px',
                    borderRadius: '6px',
                    border: '1px solid #dc2626',
                    background: '#fee2e2',
                    color: '#dc2626',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#fecaca';
                    e.currentTarget.style.borderColor = '#b91c1c';
                    e.currentTarget.style.color = '#b91c1c';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#fee2e2';
                    e.currentTarget.style.borderColor = '#dc2626';
                    e.currentTarget.style.color = '#dc2626';
                  }}
                >
                  🗑️ 清除筛选
                </button>
              )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowFilters(!showFilters);
              }}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid #e5e7eb',
                background: 'transparent',
                color: '#6b7280',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f3f4f6';
                e.currentTarget.style.borderColor = '#d1d5db';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = '#e5e7eb';
              }}
            >
              {showFilters ? '收起' : '展开'}
            </button>
            </div>
          </div>
          
          {/* 筛选内容 */}
          {showFilters && (
            <div style={{
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              flexWrap: 'wrap'
            }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#374151', flexShrink: 0 }}>
                筛选：
              </div>
              <div className="filter-group" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
            {/* 门店库存筛选 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#6b7280' }}>门店库存：</span>
              <button
                className="filter-buttons"
                onClick={() => setFilterStoreStock(null)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                  background: filterStoreStock === null ? '#667eea' : '#fff',
                  color: filterStoreStock === null ? '#fff' : '#374151',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap'
                }}
              >
                全部
              </button>
              <button
                className="filter-buttons"
                onClick={() => setFilterStoreStock(true)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                  background: filterStoreStock === true ? '#059669' : '#fff',
                  color: filterStoreStock === true ? '#fff' : '#374151',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap'
                }}
              >
                有货
              </button>
              <button
                className="filter-buttons"
                onClick={() => setFilterStoreStock(false)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                  background: filterStoreStock === false ? '#dc2626' : '#fff',
                  color: filterStoreStock === false ? '#fff' : '#374151',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap'
                }}
              >
                无货
              </button>
            </div>

            {/* 总部库存筛选 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#6b7280' }}>总部库存：</span>
              <button
                className="filter-buttons"
                onClick={() => setFilterHeadquartersStock(null)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                  background: filterHeadquartersStock === null ? '#667eea' : '#fff',
                  color: filterHeadquartersStock === null ? '#fff' : '#374151',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap'
                }}
              >
                全部
              </button>
              <button
                className="filter-buttons"
                onClick={() => setFilterHeadquartersStock(true)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                  background: filterHeadquartersStock === true ? '#059669' : '#fff',
                  color: filterHeadquartersStock === true ? '#fff' : '#374151',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap'
                }}
              >
                有货
              </button>
              <button
                className="filter-buttons"
                onClick={() => setFilterHeadquartersStock(false)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                  background: filterHeadquartersStock === false ? '#dc2626' : '#fff',
                  color: filterHeadquartersStock === false ? '#fff' : '#374151',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap'
                }}
              >
                无货
              </button>
            </div>

            {/* POS类别筛选（多选标签按钮） */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
              <span style={{ fontSize: '13px', color: '#6b7280', flexShrink: 0 }}>POS类别：</span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1, alignItems: 'center' }}>
                <button
                  className="filter-buttons pos-category-button"
                  onClick={() => setSelectedPosCategories([])}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                    background: selectedPosCategories.length === 0 ? '#667eea' : '#fff',
                    color: selectedPosCategories.length === 0 ? '#fff' : '#374151',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                    boxShadow: selectedPosCategories.length === 0 ? '0 1px 3px rgba(102, 126, 234, 0.3)' : 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedPosCategories.length !== 0) {
                      e.currentTarget.style.background = '#f3f4f6';
                      e.currentTarget.style.borderColor = '#d1d5db';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedPosCategories.length !== 0) {
                      e.currentTarget.style.background = '#fff';
                      e.currentTarget.style.borderColor = '#e5e7eb';
                    }
                  }}
                >
                  全部
                </button>
                {posCategories.map((cat) => {
                  const isSelected = selectedPosCategories.includes(cat);
                  return (
                    <button
                      key={cat}
                      className="filter-buttons pos-category-button"
                      onClick={() => {
                        if (isSelected) {
                          setSelectedPosCategories(selectedPosCategories.filter(c => c !== cat));
                        } else {
                          setSelectedPosCategories([...selectedPosCategories, cat]);
                        }
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: `1px solid ${isSelected ? '#667eea' : '#e5e7eb'}`,
                        background: isSelected ? '#667eea' : '#fff',
                        color: isSelected ? '#fff' : '#374151',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        whiteSpace: 'nowrap',
                        boxShadow: isSelected ? '0 1px 3px rgba(102, 126, 234, 0.3)' : 'none',
                        position: 'relative'
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = '#f3f4f6';
                          e.currentTarget.style.borderColor = '#d1d5db';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = '#fff';
                          e.currentTarget.style.borderColor = '#e5e7eb';
                        }
                      }}
                    >
                      {cat}
                      {isSelected && (
                        <span style={{ 
                          marginLeft: '4px',
                          fontSize: '10px'
                        }}>✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {selectedPosCategories.length > 0 && (
                <div style={{ 
                  fontSize: '11px', 
                  color: '#667eea', 
                  fontWeight: 500,
                  flexShrink: 0
                }}>
                  已选 {selectedPosCategories.length} 项
                </div>
              )}
            </div>

            {/* 快捷查找筛选 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
              <span style={{ fontSize: '13px', color: '#6b7280', flexShrink: 0 }}>快捷查找：</span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1, alignItems: 'center' }}>
                <button
                  className="filter-buttons"
                  onClick={() => setQuickFilter(null)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                    background: quickFilter === null ? '#667eea' : '#fff',
                    color: quickFilter === null ? '#fff' : '#374151',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap'
                  }}
                >
                  全部
                </button>
                <button
                  className="filter-buttons"
                  onClick={() => setQuickFilter('case')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${quickFilter === 'case' ? '#667eea' : '#e5e7eb'}`,
                    background: quickFilter === 'case' ? '#667eea' : '#fff',
                    color: quickFilter === 'case' ? '#fff' : '#374151',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                    boxShadow: quickFilter === 'case' ? '0 1px 3px rgba(102, 126, 234, 0.3)' : 'none'
                  }}
                >
                  Case
                </button>
                <button
                  className="filter-buttons"
                  onClick={() => setQuickFilter('screen_protector')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${quickFilter === 'screen_protector' ? '#667eea' : '#e5e7eb'}`,
                    background: quickFilter === 'screen_protector' ? '#667eea' : '#fff',
                    color: quickFilter === 'screen_protector' ? '#fff' : '#374151',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                    boxShadow: quickFilter === 'screen_protector' ? '0 1px 3px rgba(102, 126, 234, 0.3)' : 'none'
                  }}
                >
                  Screen Protector
                </button>
                <button
                  className="filter-buttons"
                  onClick={() => setQuickFilter('battery')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${quickFilter === 'battery' ? '#667eea' : '#e5e7eb'}`,
                    background: quickFilter === 'battery' ? '#667eea' : '#fff',
                    color: quickFilter === 'battery' ? '#fff' : '#374151',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                    boxShadow: quickFilter === 'battery' ? '0 1px 3px rgba(102, 126, 234, 0.3)' : 'none'
                  }}
                >
                  Battery
                </button>
                <button
                  className="filter-buttons"
                  onClick={() => setQuickFilter('screen')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${quickFilter === 'screen' ? '#667eea' : '#e5e7eb'}`,
                    background: quickFilter === 'screen' ? '#667eea' : '#fff',
                    color: quickFilter === 'screen' ? '#fff' : '#374151',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                    boxShadow: quickFilter === 'screen' ? '0 1px 3px rgba(102, 126, 234, 0.3)' : 'none'
                  }}
                >
                  Screen
                </button>
                <button
                  className="filter-buttons"
                  onClick={() => setQuickFilter('back_cover')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${quickFilter === 'back_cover' ? '#667eea' : '#e5e7eb'}`,
                    background: quickFilter === 'back_cover' ? '#667eea' : '#fff',
                    color: quickFilter === 'back_cover' ? '#fff' : '#374151',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                    boxShadow: quickFilter === 'back_cover' ? '0 1px 3px rgba(102, 126, 234, 0.3)' : 'none'
                  }}
                >
                  Back Cover/Glass
                </button>
              </div>
            </div>

            {/* 价格筛选 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', color: '#6b7280' }}>价格范围：</span>
              <input
                className="price-filter-input"
                type="number"
                placeholder="最低价"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                min="0"
                step="0.01"
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                  background: '#fff',
                  color: '#374151',
                  fontSize: '12px',
                  width: '100px',
                  outline: 'none',
                  transition: 'all 0.2s ease'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(102, 126, 234, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>~</span>
              <input
                className="price-filter-input"
                type="number"
                placeholder="最高价"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                min="0"
                step="0.01"
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                  background: '#fff',
                  color: '#374151',
                  fontSize: '12px',
                  width: '100px',
                  outline: 'none',
                  transition: 'all 0.2s ease'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(102, 126, 234, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>
              </div>
            </div>
          )}
        </div>

        {/* 排序控件 */}
        <div className="sort-bar" style={{
          background: '#fff',
          borderRadius: '12px',
          marginBottom: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden',
          transition: 'all 0.3s ease'
        }}>
          {/* 排序栏头部 */}
          <div style={{
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: showSort ? '1px solid #e5e7eb' : 'none',
            cursor: 'pointer',
            background: showSort ? '#fff' : '#f9fafb',
            transition: 'all 0.2s ease'
          }}
          onClick={() => setShowSort(!showSort)}
          >
            <div style={{ 
              fontSize: '14px', 
              fontWeight: 600, 
              color: '#374151',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ 
                transform: showSort ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 0.3s ease',
                display: 'inline-block',
                fontSize: '12px'
              }}>▼</span>
              <span>排序设置</span>
              {sortField !== 'name' && (
                <span style={{
                  fontSize: '11px',
                  padding: '2px 6px',
                  borderRadius: '10px',
                  background: '#667eea',
                  color: '#fff',
                  fontWeight: 500
                }}>
                  已设置
                </span>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSort(!showSort);
              }}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid #e5e7eb',
                background: 'transparent',
                color: '#6b7280',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f3f4f6';
                e.currentTarget.style.borderColor = '#d1d5db';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = '#e5e7eb';
              }}
            >
              {showSort ? '收起' : '展开'}
            </button>
          </div>
          
          {/* 排序内容 */}
          {showSort && (
            <div style={{
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap'
            }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', flexShrink: 0 }}>
                排序：
              </div>
              <div className="sort-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #e5e7eb',
                background: '#fff',
                color: '#374151',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                minWidth: '140px'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#667eea';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
              }}
            >
              <option value="name">产品名称</option>
              <option value="list_price">售价</option>
              <option value="raytech_p3">总部零售价</option>
              <option value="qty_available">当前库存</option>
              <option value="sales_quantity">销售数量</option>
              <option value="purchase_quantity">采购数量</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #e5e7eb',
                background: sortOrder === 'desc' ? '#f0f4ff' : '#fff',
                color: sortOrder === 'desc' ? '#667eea' : '#374151',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#667eea';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
              }}
            >
              {sortOrder === 'asc' ? '↑ 升序' : '↓ 降序'}
            </button>
            </div>
            
            {/* 视图模式切换 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151', flexShrink: 0 }}>视图：</span>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <button
                  onClick={() => setViewMode('detailed')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${viewMode === 'detailed' ? '#667eea' : '#e5e7eb'}`,
                    background: viewMode === 'detailed' ? '#667eea' : '#fff',
                    color: viewMode === 'detailed' ? '#fff' : '#374151',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap'
                  }}
                  title="详细模式"
                >
                  📋 详细
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${viewMode === 'list' ? '#667eea' : '#e5e7eb'}`,
                    background: viewMode === 'list' ? '#667eea' : '#fff',
                    color: viewMode === 'list' ? '#fff' : '#374151',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap'
                  }}
                  title="列表模式（无照片）"
                >
                  📝 列表
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${viewMode === 'grid' ? '#667eea' : '#e5e7eb'}`,
                    background: viewMode === 'grid' ? '#667eea' : '#fff',
                    color: viewMode === 'grid' ? '#fff' : '#374151',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap'
                  }}
                  title="网格模式（小图标）"
                >
                  🖼️ 网格
                </button>
              </div>
            </div>
            
            {/* 分页数量选择 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151', flexShrink: 0 }}>每页：</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'all') {
                    setPageSize('all');
                  } else {
                    setPageSize(parseInt(value));
                  }
                  setCurrentPage(1);
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                  background: '#fff',
                  color: '#374151',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  minWidth: '80px'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                }}
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
                <option value="500">500</option>
                <option value="all">全部</option>
              </select>
            </div>
          </div>
          )}
        </div>

        {/* 筛选结果统计 - 显示在筛选栏下方 */}
        {!loading && totalCount > 0 && (
          <div className="filter-results" style={{
            marginTop: '0',
            marginBottom: '20px',
            padding: '12px 20px',
            background: '#fff',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            textAlign: 'center',
            fontSize: '14px',
            color: '#374151',
            fontWeight: 500
          }}>
            <span style={{ color: '#667eea', fontWeight: 600 }}>筛选结果：</span>
            <span style={{ color: '#111827', fontWeight: 600 }}>{totalCount}</span>
            <span style={{ color: '#6b7280' }}> 个产品</span>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div style={{
            background: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '20px',
            color: '#dc2626',
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}

        {/* 加载状态 */}
        {loading && (
          <div style={{
            textAlign: 'center',
            padding: '40px 0',
            color: '#6b7280',
            fontSize: '14px'
          }}>
            加载中...
          </div>
        )}

        {/* 产品列表 */}
        {!loading && products.length > 0 && (
          viewMode === 'list' ? (
            filteredProducts.length > 0 ? (
              <>
              {/* 桌面端表格视图 */}
              <div className="list-view-table" style={{
                background: '#fff',
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '13px'
                  }}>
                    <thead>
                      <tr style={{
                        background: '#f9fafb',
                        borderBottom: '2px solid #e5e7eb'
                      }}>
                        <th 
                          onClick={() => handleColumnSort('name')}
                          style={{
                            padding: '10px 12px',
                            textAlign: 'left',
                            fontWeight: 600,
                            color: '#374151',
                            fontSize: '12px',
                            whiteSpace: 'nowrap',
                            position: 'sticky',
                            left: 0,
                            background: sortField === 'name' ? '#f0f4ff' : '#f9fafb',
                            zIndex: 10,
                            cursor: 'pointer',
                            userSelect: 'none',
                            transition: 'all 0.2s ease',
                            minWidth: '300px',
                            width: '25%'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = sortField === 'name' ? '#e0e7ff' : '#f3f4f6';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = sortField === 'name' ? '#f0f4ff' : '#f9fafb';
                          }}
                        >
                          产品名称{sortField === 'name' && (
                            <span style={{ color: '#667eea', fontSize: '10px', marginLeft: '4px' }}>
                              {sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </th>
                        <th 
                          onClick={() => handleColumnSort('default_code')}
                          style={{
                            padding: '10px 12px',
                            textAlign: 'left',
                            fontWeight: 600,
                            color: '#374151',
                            fontSize: '12px',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                            userSelect: 'none',
                            transition: 'all 0.2s ease',
                            background: sortField === 'default_code' ? '#f0f4ff' : '#f9fafb'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = sortField === 'default_code' ? '#e0e7ff' : '#f3f4f6';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = sortField === 'default_code' ? '#f0f4ff' : '#f9fafb';
                          }}
                        >
                          SKU{sortField === 'default_code' && (
                            <span style={{ color: '#667eea', fontSize: '10px', marginLeft: '4px' }}>
                              {sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </th>
                        <th 
                          onClick={() => handleColumnSort('pos_category')}
                          style={{
                            padding: '10px 12px',
                            textAlign: 'left',
                            fontWeight: 600,
                            color: '#374151',
                            fontSize: '12px',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                            userSelect: 'none',
                            transition: 'all 0.2s ease',
                            background: sortField === 'pos_category' ? '#f0f4ff' : '#f9fafb'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = sortField === 'pos_category' ? '#e0e7ff' : '#f3f4f6';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = sortField === 'pos_category' ? '#f0f4ff' : '#f9fafb';
                          }}
                        >
                          POS类别{sortField === 'pos_category' && (
                            <span style={{ color: '#667eea', fontSize: '10px', marginLeft: '4px' }}>
                              {sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </th>
                        <th 
                          onClick={() => handleColumnSort('list_price')}
                          style={{
                            padding: '10px 12px',
                            textAlign: 'right',
                            fontWeight: 600,
                            color: '#374151',
                            fontSize: '12px',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                            userSelect: 'none',
                            transition: 'all 0.2s ease',
                            background: sortField === 'list_price' ? '#f0f4ff' : '#f9fafb'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = sortField === 'list_price' ? '#e0e7ff' : '#f3f4f6';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = sortField === 'list_price' ? '#f0f4ff' : '#f9fafb';
                          }}
                        >
                          售价{sortField === 'list_price' && (
                            <span style={{ color: '#667eea', fontSize: '10px', marginLeft: '4px' }}>
                              {sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </th>
                        <th 
                          onClick={() => handleColumnSort('standard_price')}
                          style={{
                            padding: '10px 12px',
                            textAlign: 'right',
                            fontWeight: 600,
                            color: '#374151',
                            fontSize: '12px',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                            userSelect: 'none',
                            transition: 'all 0.2s ease',
                            background: sortField === 'standard_price' ? '#f0f4ff' : '#f9fafb'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = sortField === 'standard_price' ? '#e0e7ff' : '#f3f4f6';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = sortField === 'standard_price' ? '#f0f4ff' : '#f9fafb';
                          }}
                        >
                          成本{sortField === 'standard_price' && (
                            <span style={{ color: '#667eea', fontSize: '10px', marginLeft: '4px' }}>
                              {sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </th>
                        <th 
                          onClick={() => handleColumnSort('qty_available')}
                          style={{
                            padding: '10px 12px',
                            textAlign: 'right',
                            fontWeight: 600,
                            color: '#374151',
                            fontSize: '12px',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                            userSelect: 'none',
                            transition: 'all 0.2s ease',
                            background: sortField === 'qty_available' ? '#f0f4ff' : '#f9fafb'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = sortField === 'qty_available' ? '#e0e7ff' : '#f3f4f6';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = sortField === 'qty_available' ? '#f0f4ff' : '#f9fafb';
                          }}
                        >
                          当前库存{sortField === 'qty_available' && (
                            <span style={{ color: '#667eea', fontSize: '10px', marginLeft: '4px' }}>
                              {sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </th>
                        <th 
                          onClick={() => handleColumnSort('raytech_stock')}
                          style={{
                            padding: '10px 12px',
                            textAlign: 'right',
                            fontWeight: 600,
                            color: '#374151',
                            fontSize: '12px',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                            userSelect: 'none',
                            transition: 'all 0.2s ease',
                            background: sortField === 'raytech_stock' ? '#f0f4ff' : '#f9fafb'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = sortField === 'raytech_stock' ? '#e0e7ff' : '#f3f4f6';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = sortField === 'raytech_stock' ? '#f0f4ff' : '#f9fafb';
                          }}
                        >
                          总部库存{sortField === 'raytech_stock' && (
                            <span style={{ color: '#667eea', fontSize: '10px', marginLeft: '4px' }}>
                              {sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </th>
                        <th 
                          onClick={() => handleColumnSort('sales_quantity')}
                          style={{
                            padding: '10px 12px',
                            textAlign: 'right',
                            fontWeight: 600,
                            color: '#374151',
                            fontSize: '12px',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                            userSelect: 'none',
                            transition: 'all 0.2s ease',
                            background: sortField === 'sales_quantity' ? '#f0f4ff' : '#f9fafb'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = sortField === 'sales_quantity' ? '#e0e7ff' : '#f3f4f6';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = sortField === 'sales_quantity' ? '#f0f4ff' : '#f9fafb';
                          }}
                        >
                          销售数量{sortField === 'sales_quantity' && (
                            <span style={{ color: '#667eea', fontSize: '10px', marginLeft: '4px' }}>
                              {sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </th>
                        <th 
                          onClick={() => handleColumnSort('purchase_quantity')}
                          style={{
                            padding: '10px 12px',
                            textAlign: 'right',
                            fontWeight: 600,
                            color: '#374151',
                            fontSize: '12px',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                            userSelect: 'none',
                            transition: 'all 0.2s ease',
                            background: sortField === 'purchase_quantity' ? '#f0f4ff' : '#f9fafb'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = sortField === 'purchase_quantity' ? '#e0e7ff' : '#f3f4f6';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = sortField === 'purchase_quantity' ? '#f0f4ff' : '#f9fafb';
                          }}
                        >
                          采购数量{sortField === 'purchase_quantity' && (
                            <span style={{ color: '#667eea', fontSize: '10px', marginLeft: '4px' }}>
                              {sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </th>
                        {searchMode === 'lot' && (
                          <th style={{
                            padding: '10px 12px',
                            fontWeight: 600,
                            color: '#374151',
                            fontSize: '12px',
                            whiteSpace: 'nowrap'
                          }}>
                            Lot/Serial
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((product, index) => (
                        <tr
                          key={product.id}
                          style={{
                            borderBottom: '1px solid #f3f4f6',
                            transition: 'all 0.15s ease',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#f9fafb';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#fff';
                          }}
                        >
                          <td style={{
                            padding: '10px 12px',
                            color: '#111827',
                            fontWeight: 500,
                            minWidth: '300px',
                            width: '25%',
                            wordBreak: 'break-word',
                            position: 'sticky',
                            left: 0,
                            background: 'inherit',
                            zIndex: 5
                          }}>{product.name}</td>
                          <td style={{
                            padding: '10px 12px',
                            color: '#374151',
                            whiteSpace: 'nowrap'
                          }}>{product.default_code || '-'}</td>
                          <td style={{
                            padding: '10px 12px',
                            color: '#374151',
                            whiteSpace: 'nowrap'
                          }}>{product.pos_category}</td>
                          <td style={{
                            padding: '10px 12px',
                            color: '#059669',
                            fontWeight: 600,
                            textAlign: 'right',
                            whiteSpace: 'nowrap'
                          }}>${product.list_price.toFixed(2)}</td>
                          <td style={{
                            padding: '10px 12px',
                            color: '#dc2626',
                            fontWeight: 600,
                            textAlign: 'right',
                            whiteSpace: 'nowrap'
                          }}>${product.standard_price.toFixed(2)}</td>
                          <td style={{
                            padding: '10px 12px',
                            color: '#0369a1',
                            fontWeight: 600,
                            textAlign: 'right',
                            whiteSpace: 'nowrap'
                          }}>
                            <span
                              onClick={() => loadStockHistory(product.id)}
                              style={{
                                color: '#667eea',
                                cursor: 'pointer',
                                textDecoration: 'underline',
                                transition: 'all 0.2s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = '#5568d3';
                                e.currentTarget.style.textDecoration = 'none';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = '#667eea';
                                e.currentTarget.style.textDecoration = 'underline';
                              }}
                            >
                              {product.qty_available}
                            </span>
                          </td>
                          <td style={{
                            padding: '10px 12px',
                            color: (product.raytech_stock ?? 0) > 0 ? '#059669' : '#6b7280',
                            fontWeight: 600,
                            textAlign: 'right',
                            whiteSpace: 'nowrap'
                          }}>
                            <span
                              onClick={() => {
                                if (product.raytech_web_name) {
                                  if (window.confirm(`即将跳转到 Raytech 网站搜索 "${product.raytech_web_name}"，是否继续？`)) {
                                    window.open(`https://www.raytech.co.nz/index.php?route=product/search&search=${encodeURIComponent(product.raytech_web_name)}`, '_blank');
                                  }
                                }
                              }}
                              style={{
                                color: (product.raytech_stock ?? 0) > 0 ? '#059669' : '#6b7280',
                                cursor: product.raytech_web_name ? 'pointer' : 'default',
                                textDecoration: product.raytech_web_name ? 'underline' : 'none',
                                transition: 'all 0.2s ease'
                              }}
                              onMouseEnter={(e) => {
                                if (product.raytech_web_name) {
                                  e.currentTarget.style.color = '#047857';
                                  e.currentTarget.style.textDecoration = 'none';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (product.raytech_web_name) {
                                  e.currentTarget.style.color = (product.raytech_stock ?? 0) > 0 ? '#059669' : '#6b7280';
                                  e.currentTarget.style.textDecoration = 'underline';
                                }
                              }}
                            >
                              {product.raytech_stock ?? 0}
                            </span>
                          </td>
                          <td style={{
                            padding: '10px 12px',
                            textAlign: 'right',
                            whiteSpace: 'nowrap'
                          }}>
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProductId(product.id);
                                setShowSalesModal(true);
                                loadSalesOrders(product.id);
                              }}
                              style={{
                                color: '#667eea',
                                fontWeight: 600,
                                cursor: 'pointer',
                                textDecoration: 'underline',
                                transition: 'all 0.2s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = '#5568d3';
                                e.currentTarget.style.textDecoration = 'none';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = '#667eea';
                                e.currentTarget.style.textDecoration = 'underline';
                              }}
                            >
                              {product.sales_quantity.toFixed(0)}
                            </span>
                          </td>
                          <td style={{
                            padding: '10px 12px',
                            textAlign: 'right',
                            whiteSpace: 'nowrap'
                          }}>
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProductId(product.id);
                                setShowPurchaseModal(true);
                                loadPurchaseOrders(product.id);
                              }}
                              style={{
                                color: '#f59e0b',
                                fontWeight: 600,
                                cursor: 'pointer',
                                textDecoration: 'underline',
                                transition: 'all 0.2s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = '#d97706';
                                e.currentTarget.style.textDecoration = 'none';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = '#f59e0b';
                                e.currentTarget.style.textDecoration = 'underline';
                              }}
                            >
                              {product.purchase_quantity.toFixed(0)}
                            </span>
                          </td>
                          <td style={{
                            padding: '10px 12px',
                            whiteSpace: 'nowrap'
                          }}>
                            {searchMode === 'lot' ? (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  loadProductLotSerials(product.id);
                                }}
                                title="查看所有Lot/Serial"
                                style={{
                                  color: '#6366f1',
                                  fontWeight: 500,
                                  cursor: 'pointer',
                                  fontSize: '16px',
                                  padding: '2px 4px',
                                  borderRadius: '4px',
                                  background: '#eef2ff',
                                  transition: 'all 0.2s ease',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '24px',
                                  height: '24px'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = '#4f46e5';
                                  e.currentTarget.style.background = '#e0e7ff';
                                  e.currentTarget.style.transform = 'scale(1.1)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = '#6366f1';
                                  e.currentTarget.style.background = '#eef2ff';
                                  e.currentTarget.style.transform = 'scale(1)';
                                }}
                              >
                                🔢
                              </span>
                            ) : (
                              <span style={{ color: '#9ca3af' }}>-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              
              {/* 移动端卡片视图 */}
              <div className="list-view-mobile" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box'
              }}>
                {filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    style={{
                      background: '#fff',
                      borderRadius: '12px',
                      padding: '16px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      border: '1px solid #e5e7eb',
                      width: '100%',
                      maxWidth: '100%',
                      boxSizing: 'border-box',
                      overflow: 'hidden'
                    }}
                  >
                    <div style={{
                      fontSize: '15px',
                      fontWeight: 600,
                      color: '#111827',
                      marginBottom: '12px',
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      lineHeight: '1.4',
                      width: '100%',
                      maxWidth: '100%',
                      boxSizing: 'border-box'
                    }}>
                      {product.name}
                    </div>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: '10px',
                      fontSize: '13px',
                      width: '100%',
                      maxWidth: '100%',
                      boxSizing: 'border-box'
                    }}>
                      <div>
                        <span style={{ color: '#6b7280' }}>SKU：</span>
                        <span style={{ color: '#374151', fontWeight: 500 }}>{product.default_code || '-'}</span>
                      </div>
                      <div>
                        <span style={{ color: '#6b7280' }}>POS类别：</span>
                        <span style={{ color: '#374151', fontWeight: 500 }}>{product.pos_category}</span>
                      </div>
                      <div>
                        <span style={{ color: '#6b7280' }}>售价：</span>
                        <span style={{ color: '#059669', fontWeight: 600 }}>${product.list_price.toFixed(2)}</span>
                      </div>
                      <div>
                        <span style={{ color: '#6b7280' }}>成本：</span>
                        <span style={{ color: '#dc2626', fontWeight: 600 }}>${product.standard_price.toFixed(2)}</span>
                      </div>
                      <div>
                        <span style={{ color: '#6b7280' }}>当前库存：</span>
                        <span
                          onClick={() => loadStockHistory(product.id)}
                          style={{
                            color: '#667eea',
                            fontWeight: 600,
                            cursor: 'pointer',
                            textDecoration: 'underline'
                          }}
                        >
                          {product.qty_available}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: '#6b7280' }}>总部库存：</span>
                        <span
                          onClick={() => {
                            if (product.raytech_web_name) {
                              if (window.confirm(`即将跳转到 Raytech 网站搜索 "${product.raytech_web_name}"，是否继续？`)) {
                                window.open(`https://www.raytech.co.nz/index.php?route=product/search&search=${encodeURIComponent(product.raytech_web_name)}`, '_blank');
                              }
                            }
                          }}
                          style={{
                            color: (product.raytech_stock ?? 0) > 0 ? '#059669' : '#6b7280',
                            fontWeight: 600,
                            cursor: product.raytech_web_name ? 'pointer' : 'default',
                            textDecoration: product.raytech_web_name ? 'underline' : 'none'
                          }}
                        >
                          {product.raytech_stock ?? 0}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: '#6b7280' }}>销售数量：</span>
                        <span
                          onClick={() => {
                            setSelectedProductId(product.id);
                            setShowSalesModal(true);
                            loadSalesOrders(product.id);
                          }}
                          style={{
                            color: '#667eea',
                            fontWeight: 600,
                            cursor: 'pointer',
                            textDecoration: 'underline'
                          }}
                        >
                          {product.sales_quantity.toFixed(0)}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: '#6b7280' }}>采购数量：</span>
                        <span
                          onClick={() => {
                            setSelectedProductId(product.id);
                            setShowPurchaseModal(true);
                            loadPurchaseOrders(product.id);
                          }}
                          style={{
                            color: '#f59e0b',
                            fontWeight: 600,
                            cursor: 'pointer',
                            textDecoration: 'underline'
                          }}
                        >
                          {product.purchase_quantity.toFixed(0)}
                        </span>
                      </div>
                      {searchMode === 'lot' && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <span style={{ color: '#6b7280' }}>Lot/Serial：</span>
                          <span
                            onClick={() => loadProductLotSerials(product.id)}
                            title="查看所有Lot/Serial"
                            style={{
                              color: '#6366f1',
                              fontWeight: 600,
                              cursor: 'pointer',
                              fontSize: '18px',
                              marginLeft: '8px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: '#eef2ff',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '28px',
                              height: '28px'
                            }}
                          >
                            🔢
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              </>
            ) : (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: '#6b7280',
                fontSize: '14px',
                background: '#fff',
                borderRadius: '12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                没有符合筛选条件的产品
              </div>
            )
          ) : (
            <div className={viewMode === 'grid' ? 'grid-view-container' : ''} style={{ 
              display: viewMode === 'grid' ? 'grid' : 'flex',
              flexDirection: viewMode === 'grid' ? 'row' : 'column',
              gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(180px, 1fr))' : 'none',
              gap: viewMode === 'grid' ? '16px' : '16px'
            }}>
            {filteredProducts.length > 0 ? (
                filteredProducts.map((product) => {
                  // 详细模式
                  if (viewMode === 'detailed') {
                  return (
              <div
                key={product.id}
                className="product-card"
                style={{
                  background: '#fff',
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  transition: 'all 0.2s ease',
                  border: '1px solid #e5e7eb'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div className="product-info-grid" style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: '20px',
                  alignItems: 'start'
                }}>
                  {/* 产品图片 */}
                  {product.image_128 && (
                    <div className="product-image-container" style={{
                      width: '120px',
                      height: '120px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      background: '#f3f4f6',
                      border: '1px solid #e5e7eb',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                    onClick={() => handleImageClick(product.image_128, product.id)}
                    >
                      <img
                        src={`data:image/png;base64,${product.image_128}`}
                        alt={product.name}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain'
                        }}
                      />
                    </div>
                  )}

                  {/* 产品信息 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="product-name" style={{
                      fontSize: '16px',
                      fontWeight: 600,
                      color: '#111827',
                      marginBottom: '12px',
                      wordBreak: 'break-word'
                    }}>
                      {product.name}
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '12px',
                      fontSize: '13px'
                    }}>
                      {/* 基本信息 */}
                      <div className="product-info-item">
                        <span style={{ color: '#6b7280' }}>SKU：</span>
                        <span style={{ color: '#374151', fontWeight: 500 }}>{product.default_code || '-'}</span>
                      </div>
                      <div className="product-info-item">
                        <span style={{ color: '#6b7280' }}>POS类别：</span>
                        <span style={{ color: '#374151', fontWeight: 500 }}>{product.pos_category}</span>
                      </div>

                      {/* 价格信息 */}
                      <div className="product-info-item">
                        <span style={{ color: '#6b7280' }}>售价：</span>
                        <span style={{ color: '#059669', fontWeight: 600 }}>
                          ${product.list_price.toFixed(2)}
                        </span>
                      </div>
                      <div className="product-info-item">
                        <span style={{ color: '#6b7280' }}>成本：</span>
                        <span style={{ color: '#dc2626', fontWeight: 600 }}>
                          ${product.standard_price.toFixed(2)}
                        </span>
                      </div>
                      {product.raytech_p3 !== null && (
                        <div className="product-info-item">
                          <span style={{ color: '#6b7280' }}>总部零售价：</span>
                          <span style={{ color: '#059669', fontWeight: 600 }}>
                            ${product.raytech_p3.toFixed(2)}
                          </span>
                        </div>
                      )}

                      {/* 库存信息 */}
                      <div className="product-info-item">
                        <span style={{ color: '#6b7280' }}>当前库存：</span>
                        <span
                          onClick={() => loadStockHistory(product.id)}
                          style={{
                            color: '#667eea',
                            fontWeight: 600,
                            fontSize: '15px',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#5568d3';
                            e.currentTarget.style.textDecoration = 'none';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = '#667eea';
                            e.currentTarget.style.textDecoration = 'underline';
                          }}
                        >
                          {product.qty_available}
                        </span>
                        {product.free_qty > 0 && (
                          <span style={{ marginLeft: 8, color: '#6b7280', fontSize: '12px' }}>
                            (可用: {product.free_qty})
                          </span>
                        )}
                      </div>
                      <div className="product-info-item">
                        <span style={{ color: '#6b7280' }}>总部库存：</span>
                        <span
                          onClick={() => {
                            if (product.raytech_web_name) {
                              if (window.confirm(`即将跳转到 Raytech 网站搜索 "${product.raytech_web_name}"，是否继续？`)) {
                                window.open(`https://www.raytech.co.nz/index.php?route=product/search&search=${encodeURIComponent(product.raytech_web_name)}`, '_blank');
                              }
                            }
                          }}
                          style={{
                            color: (product.raytech_stock ?? 0) > 0 ? '#059669' : '#6b7280',
                            fontWeight: 600,
                            cursor: product.raytech_web_name ? 'pointer' : 'default',
                            textDecoration: product.raytech_web_name ? 'underline' : 'none',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (product.raytech_web_name) {
                              e.currentTarget.style.color = '#047857';
                              e.currentTarget.style.textDecoration = 'none';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (product.raytech_web_name) {
                              e.currentTarget.style.color = (product.raytech_stock ?? 0) > 0 ? '#059669' : '#6b7280';
                              e.currentTarget.style.textDecoration = 'underline';
                            }
                          }}
                        >
                          {product.raytech_stock ?? 0}
                        </span>
                      </div>

                      {/* 销售和采购数量 */}
                      <div className="product-info-item">
                        <span style={{ color: '#6b7280' }}>销售数量：</span>
                        <span 
                          onClick={() => {
                            setSelectedProductId(product.id);
                            setShowSalesModal(true);
                            loadSalesOrders(product.id);
                          }}
                          style={{ 
                            color: '#667eea', 
                            fontWeight: 600,
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#5568d3';
                            e.currentTarget.style.textDecoration = 'none';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = '#667eea';
                            e.currentTarget.style.textDecoration = 'underline';
                          }}
                        >
                          {product.sales_quantity.toFixed(0)}
                        </span>
                      </div>
                      <div className="product-info-item">
                        <span style={{ color: '#6b7280' }}>采购数量：</span>
                        <span 
                          onClick={() => {
                            setSelectedProductId(product.id);
                            setShowPurchaseModal(true);
                            loadPurchaseOrders(product.id);
                          }}
                          style={{ 
                            color: '#f59e0b', 
                            fontWeight: 600,
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#d97706';
                            e.currentTarget.style.textDecoration = 'none';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = '#f59e0b';
                            e.currentTarget.style.textDecoration = 'underline';
                          }}
                        >
                          {product.purchase_quantity.toFixed(0)}
                        </span>
                      </div>

                      {/* Lot/Serial信息 - 只在lot搜索模式下显示 */}
                      {searchMode === 'lot' && (
                        <div className="product-info-item">
                          <span style={{ color: '#6b7280' }}>Lot/Serial：</span>
                          <span
                            onClick={() => loadProductLotSerials(product.id)}
                            title="查看所有Lot/Serial"
                            style={{
                              color: '#6366f1',
                              fontWeight: 600,
                              cursor: 'pointer',
                              fontSize: '18px',
                              marginLeft: '8px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: '#eef2ff',
                              transition: 'all 0.2s ease',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '28px',
                              height: '28px'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = '#4f46e5';
                              e.currentTarget.style.background = '#e0e7ff';
                              e.currentTarget.style.transform = 'scale(1.1)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = '#6366f1';
                              e.currentTarget.style.background = '#eef2ff';
                              e.currentTarget.style.transform = 'scale(1)';
                            }}
                          >
                            🔢
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
                  );
                }
                
                
                // 网格模式（小图标）
                if (viewMode === 'grid') {
                  return (
                    <div
                      key={product.id}
                      onClick={() => {
                        setSelectedProduct(product);
                        setShowProductDetailModal(true);
                      }}
                      style={{
                        background: '#fff',
                        borderRadius: '8px',
                        padding: '12px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        transition: 'all 0.2s ease',
                        border: '1px solid #e5e7eb',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.borderColor = '#667eea';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.borderColor = '#e5e7eb';
                      }}
                    >
                      {product.image_128 ? (
                        <div style={{
                          width: '100%',
                          aspectRatio: '1',
                          borderRadius: '6px',
                          overflow: 'hidden',
                          background: '#f3f4f6',
                          border: '1px solid #e5e7eb',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <img
                            src={`data:image/png;base64,${product.image_128}`}
                            alt={product.name}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'contain'
                            }}
                          />
                        </div>
                      ) : (
                        <div style={{
                          width: '100%',
                          aspectRatio: '1',
                          borderRadius: '6px',
                          background: '#f3f4f6',
                          border: '1px solid #e5e7eb',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#9ca3af',
                          fontSize: '24px'
                        }}>
                          📦
                        </div>
                      )}
                      <div 
                        title={product.name}
                        className="grid-product-name"
                        style={{
                          fontSize: '13px',
                          fontWeight: 500,
                          color: '#111827',
                          textAlign: 'center',
                          wordBreak: 'break-word',
                          width: '100%',
                          lineHeight: '1.5',
                          minHeight: '39px',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}>
                        {product.name}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: '#059669',
                        fontWeight: 600
                      }}>
                        ${product.list_price.toFixed(2)}
                      </div>
                    </div>
                  );
                }
                
                return null;
              })
            ) : (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: '#6b7280',
                fontSize: '14px',
                background: '#fff',
                borderRadius: '12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                没有符合筛选条件的产品
              </div>
            )}
          </div>
          )
        )}

        {/* 空状态 */}
        {!loading && products.length === 0 && !error && (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: '#6b7280',
            fontSize: '14px',
            background: '#fff',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            {apiSearchTerm ? '未找到匹配的产品' : '暂无产品数据'}
          </div>
        )}

        {/* 分页控件 */}
        {!loading && totalPages > 1 && (
          <div className="pagination" style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px',
            padding: '20px 0',
            marginTop: '20px'
          }}>
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                background: currentPage <= 1 ? '#f3f4f6' : '#fff',
                color: currentPage <= 1 ? '#9ca3af' : '#374151',
                fontSize: '14px',
                fontWeight: 500,
                cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                if (currentPage > 1) {
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.color = '#667eea';
                }
              }}
              onMouseLeave={(e) => {
                if (currentPage > 1) {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.color = '#374151';
                }
              }}
            >
              上一页
            </button>

            <div style={{
              display: 'flex',
              gap: '4px',
              alignItems: 'center',
              fontSize: '14px',
              color: '#374151'
            }}>
              <span>第</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={currentPage}
                onChange={(e) => {
                  const page = parseInt(e.target.value);
                  if (page >= 1 && page <= totalPages) {
                    handlePageChange(page);
                  }
                }}
                style={{
                  width: '60px',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                  textAlign: 'center',
                  fontSize: '14px',
                  outline: 'none'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                }}
              />
              <span>页，共 {totalPages} 页</span>
            </div>

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                background: currentPage >= totalPages ? '#f3f4f6' : '#fff',
                color: currentPage >= totalPages ? '#9ca3af' : '#374151',
                fontSize: '14px',
                fontWeight: 500,
                cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                if (currentPage < totalPages) {
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.color = '#667eea';
                }
              }}
              onMouseLeave={(e) => {
                if (currentPage < totalPages) {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.color = '#374151';
                }
              }}
            >
              下一页
            </button>
          </div>
        )}
      </div>

      {/* 图片查看模态框 */}
      {showImageModal && selectedImage && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
          onClick={() => {
            setShowImageModal(false);
            setSelectedImage(null);
          }}
        >
          <img
            src={selectedImage}
            alt="产品图片"
            style={{
              maxWidth: '90%',
              maxHeight: '90%',
              objectFit: 'contain',
              borderRadius: '8px'
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* 销售订单模态框 */}
      {showSalesModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
          onClick={() => {
            setShowSalesModal(false);
            setSalesOrders([]);
            setSalesOrdersTotal(0);
            setSelectedProductId(null);
          }}
        >
          <div
            className="order-modal-content"
            style={{
              background: '#fff',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '800px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="order-modal-title" style={{
              padding: '20px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#111827' }}>
                💰 销售订单记录
                {salesOrdersTotal > 0 && (
                  <span style={{ 
                    fontSize: '14px', 
                    fontWeight: 400, 
                    color: '#6b7280',
                    marginLeft: '8px'
                  }}>
                    （共 {salesOrdersTotal} 条记录，显示 {salesOrders.length} 条）
                  </span>
                )}
              </h2>
              <button
                onClick={() => {
                  setShowSalesModal(false);
                  setSalesOrders([]);
                  setSalesOrdersTotal(0);
                  setSelectedProductId(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f3f4f6';
                  e.currentTarget.style.color = '#111827';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'none';
                  e.currentTarget.style.color = '#6b7280';
                }}
              >
                ×
              </button>
            </div>

            {/* 内容区域 */}
            <div className="order-modal-body" style={{
              padding: '20px',
              overflowY: 'auto',
              flex: 1
            }}>
              {ordersLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                  加载中...
                </div>
              ) : salesOrders.length > 0 ? (
                <div>
                  {/* 统计信息 */}
                  {selectedProductId && (
                    <div style={{ 
                      marginBottom: '16px', 
                      padding: '12px', 
                      background: '#f0f4ff', 
                      borderRadius: '8px',
                      border: '1px solid #dbeafe'
                    }}>
                      <div style={{ fontSize: '13px', color: '#374151', marginBottom: '4px' }}>
                        <strong>统计信息：</strong>
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        <span>总订单行数：{salesOrdersTotal}</span>
                        <span>显示订单行数：{salesOrders.length}</span>
                        <span>显示数量总和：{salesOrders.reduce((sum, sale) => sum + (sale.quantity || 0), 0).toFixed(0)}</span>
                        {selectedProductId && products.find(p => p.id === selectedProductId) && (
                          <span style={{ color: salesOrders.reduce((sum, sale) => sum + (sale.quantity || 0), 0) === products.find(p => p.id === selectedProductId)!.sales_quantity ? '#059669' : '#dc2626' }}>
                            产品销售数量：{products.find(p => p.id === selectedProductId)!.sales_quantity.toFixed(0)}
                            {salesOrders.reduce((sum, sale) => sum + (sale.quantity || 0), 0) !== products.find(p => p.id === selectedProductId)!.sales_quantity && (
                              <span style={{ marginLeft: '8px', fontSize: '11px' }}>
                                {salesOrders.reduce((sum, sale) => sum + (sale.quantity || 0), 0) < products.find(p => p.id === selectedProductId)!.sales_quantity ? '（部分记录未显示）' : '（数据不一致）'}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {salesOrders.map((sale: any) => (
                    <div
                      key={sale.id}
                      className="order-item"
                      style={{
                        padding: '16px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        background: '#f9fafb',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f3f4f6';
                        e.currentTarget.style.borderColor = '#d1d5db';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#f9fafb';
                        e.currentTarget.style.borderColor = '#e5e7eb';
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, color: '#374151', fontSize: 15 }}>
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              if (sale.order_id) {
                                loadOrderDetail(sale.order_id, sale.type);
                              }
                            }}
                            style={{
                              color: '#667eea',
                              cursor: 'pointer',
                              textDecoration: 'underline',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = '#5568d3';
                              e.currentTarget.style.textDecoration = 'none';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = '#667eea';
                              e.currentTarget.style.textDecoration = 'underline';
                            }}
                          >
                            {sale.order_name}
                          </span>
                          {sale.type && (
                            <span style={{ 
                              fontSize: 10, 
                              color: sale.type === 'POS' ? '#059669' : sale.type === 'INV' ? '#dc2626' : '#3b82f6',
                              marginLeft: 6,
                              padding: '2px 6px',
                              borderRadius: 4,
                              backgroundColor: sale.type === 'POS' ? '#d1fae5' : sale.type === 'INV' ? '#fee2e2' : '#dbeafe'
                            }}>
                              {sale.type === 'POS' ? 'POS' : sale.type === 'INV' ? '发票' : 'SO'}
                            </span>
                          )}
                        </span>
                        <span style={{ color: '#059669', fontWeight: 700, fontSize: 16 }}>
                          {/* 优先显示税后价格，如果没有则显示税前价格 */}
                          {sale.total_amount && sale.total_amount_before_tax && sale.total_amount !== sale.total_amount_before_tax ? (
                            <>
                              ${sale.total_amount.toFixed(2)}
                              <span style={{ fontSize: '12px', fontWeight: 400, color: '#6b7280', marginLeft: '4px' }}>
                                (税前: ${sale.total_amount_before_tax.toFixed(2)})
                              </span>
                            </>
                          ) : (
                            `$${(sale.total_amount || sale.total_amount_before_tax || 0).toFixed(2)}`
                          )}
                        </span>
                      </div>
                      <div style={{ color: '#6b7280', marginBottom: 6, fontSize: 13 }}>
                        客户: {sale.customer || 'POS客户'}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280', fontSize: 13 }}>
                        <span>{sale.date || '未知日期'}</span>
                        <span style={{ color: '#667eea', fontWeight: 600 }}>
                          {sale.quantity || 0} × ${sale.unit_price?.toFixed(2) || '0.00'}
                        </span>
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                  暂无销售订单记录
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 采购订单模态框 */}
      {showPurchaseModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
          onClick={() => {
            setShowPurchaseModal(false);
            setPurchaseOrders([]);
            setSelectedProductId(null);
          }}
        >
          <div
            className="order-modal-content"
            style={{
              background: '#fff',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '800px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="order-modal-title" style={{
              padding: '20px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#111827' }}>
                📦 采购订单记录
                {purchaseOrdersTotal > 0 && (
                  <span style={{ fontSize: '14px', fontWeight: 400, color: '#6b7280', marginLeft: '8px' }}>
                    （共 {purchaseOrdersTotal} 条记录，显示 {purchaseOrders.length} 条）
                  </span>
                )}
              </h2>
              <button
                onClick={() => {
                  setShowPurchaseModal(false);
                  setPurchaseOrders([]);
                  setPurchaseOrdersTotal(0);
                  setSelectedProductId(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f3f4f6';
                  e.currentTarget.style.color = '#111827';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'none';
                  e.currentTarget.style.color = '#6b7280';
                }}
              >
                ×
              </button>
            </div>

            {/* 内容区域 */}
            <div className="order-modal-body" style={{
              padding: '20px',
              overflowY: 'auto',
              flex: 1
            }}>
              {ordersLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                  加载中...
                </div>
              ) : purchaseOrders.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* 统计信息 */}
                  {purchaseOrdersTotal > 0 && selectedProductId && (
                    <div style={{
                      padding: '12px',
                      background: '#fef3c7',
                      borderRadius: '8px',
                      border: '1px solid #fde68a',
                      marginBottom: '8px'
                    }}>
                      <div style={{
                        fontSize: '13px',
                        color: '#374151',
                        marginBottom: '4px'
                      }}>
                        <strong>统计信息：</strong>
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: '#6b7280',
                        display: 'flex',
                        gap: '16px',
                        flexWrap: 'wrap'
                      }}>
                        <span>总订单行数：{purchaseOrdersTotal}</span>
                        <span>显示订单行数：{purchaseOrders.length}</span>
                        <span>显示数量总和：{purchaseOrders.reduce((sum, purchase) => sum + (purchase.quantity || 0), 0).toFixed(0)}</span>
                        {products.find(p => p.id === selectedProductId) && (
                          <span style={{
                            color: purchaseOrders.reduce((sum, purchase) => sum + (purchase.quantity || 0), 0) === products.find(p => p.id === selectedProductId)!.purchase_quantity ? '#059669' : '#dc2626'
                          }}>
                            产品采购数量：{products.find(p => p.id === selectedProductId)!.purchase_quantity.toFixed(0)}
                            {purchaseOrders.reduce((sum, purchase) => sum + (purchase.quantity || 0), 0) !== products.find(p => p.id === selectedProductId)!.purchase_quantity && (
                              <span style={{ marginLeft: '8px', fontSize: '11px' }}>
                                {purchaseOrders.reduce((sum, purchase) => sum + (purchase.quantity || 0), 0) < products.find(p => p.id === selectedProductId)!.purchase_quantity ? '（部分记录未显示）' : '（数据不一致）'}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {purchaseOrders.map((purchase: any) => (
                    <div
                      key={purchase.id}
                      className="order-item"
                      style={{
                        padding: '16px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        background: '#f9fafb',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f3f4f6';
                        e.currentTarget.style.borderColor = '#d1d5db';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#f9fafb';
                        e.currentTarget.style.borderColor = '#e5e7eb';
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, color: '#374151', fontSize: 15 }}>
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              if (purchase.order_id) {
                                loadPurchaseOrderDetail(purchase.order_id);
                              }
                            }}
                            style={{
                              color: '#667eea',
                              cursor: 'pointer',
                              textDecoration: 'underline',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = '#5568d3';
                              e.currentTarget.style.textDecoration = 'none';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = '#667eea';
                              e.currentTarget.style.textDecoration = 'underline';
                            }}
                          >
                            {purchase.order_name}
                          </span>
                          <span style={{ 
                            fontSize: 10, 
                            color: purchase.state === 'done' ? '#059669' : purchase.state === 'cancel' ? '#dc2626' : '#6b7280',
                            marginLeft: 6,
                            padding: '2px 6px',
                            borderRadius: 4,
                            backgroundColor: purchase.state === 'done' ? '#d1fae5' : purchase.state === 'cancel' ? '#fee2e2' : '#f3f4f6'
                          }}>
                            {purchase.state === 'done' ? '已完成' : purchase.state === 'cancel' ? '已取消' : purchase.state || '未知'}
                          </span>
                        </span>
                        <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 16 }}>
                          {/* 优先显示税前价格，如果有税后价格且不同则显示税后价格 */}
                          {purchase.total_amount && purchase.total_amount_incl && purchase.total_amount !== purchase.total_amount_incl ? (
                            <>
                              ${purchase.total_amount.toFixed(2)}
                              <span style={{ fontSize: '12px', fontWeight: 400, color: '#6b7280', marginLeft: '4px' }}>
                                (税后: ${purchase.total_amount_incl.toFixed(2)})
                              </span>
                            </>
                          ) : (
                            `$${(purchase.total_amount || purchase.total_amount_incl || 0).toFixed(2)}`
                          )}
                        </span>
                      </div>
                      <div style={{ color: '#6b7280', marginBottom: 6, fontSize: 13 }}>
                        供应商: {purchase.supplier || '未知供应商'}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280', fontSize: 13 }}>
                        <span>{purchase.date || '未知日期'}</span>
                        <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                          {purchase.quantity || 0} × ${purchase.unit_price?.toFixed(2) || '0.00'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                  暂无采购订单记录
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 订单详情模态框 */}
      {showOrderDetailModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
          onClick={() => {
            setShowOrderDetailModal(false);
            setSelectedOrderDetail(null);
          }}
        >
          <div
            className="order-modal-content"
            style={{
              background: '#fff',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '900px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="order-modal-title" style={{
              padding: '20px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#111827' }}>
                📋 订单详情
              </h2>
              <button
                onClick={() => {
                  setShowOrderDetailModal(false);
                  setSelectedOrderDetail(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f3f4f6';
                  e.currentTarget.style.color = '#111827';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'none';
                  e.currentTarget.style.color = '#6b7280';
                }}
              >
                ×
              </button>
            </div>

            {/* 内容区域 */}
            <div className="order-modal-body" style={{
              padding: '20px',
              overflowY: 'auto',
              flex: 1
            }}>
              {orderDetailLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                  加载中...
                </div>
              ) : selectedOrderDetail ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* 订单基本信息 */}
                  <div style={{
                    padding: '16px',
                    background: '#f9fafb',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                      <div>
                        <span style={{ color: '#6b7280', fontSize: '13px' }}>订单号：</span>
                        <span style={{ fontWeight: 600, color: '#111827' }}>{selectedOrderDetail.name}</span>
                      </div>
                      <div>
                        <span style={{ color: '#6b7280', fontSize: '13px' }}>日期：</span>
                        <span style={{ fontWeight: 500 }}>{selectedOrderDetail.date_order || '未知日期'}</span>
                      </div>
                      <div>
                        <span style={{ color: '#6b7280', fontSize: '13px' }}>客户：</span>
                        <span style={{ fontWeight: 500 }}>{selectedOrderDetail.customer || 'POS客户'}</span>
                      </div>
                      <div>
                        <span style={{ color: '#6b7280', fontSize: '13px' }}>状态：</span>
                        <span style={{
                          fontWeight: 500,
                          color: selectedOrderDetail.state === 'paid' ? '#059669' : selectedOrderDetail.state === 'done' ? '#3b82f6' : '#6b7280'
                        }}>
                          {selectedOrderDetail.state === 'paid' ? '已支付' : selectedOrderDetail.state === 'done' ? '已完成' : selectedOrderDetail.state || '未知'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 订单行列表 */}
                  {selectedOrderDetail.lines && selectedOrderDetail.lines.length > 0 ? (
                    <div>
                      <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600, color: '#111827' }}>
                        订单明细
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {selectedOrderDetail.lines.map((line: any) => (
                          <div
                            key={line.id}
                            style={{
                              padding: '12px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              background: '#fff'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '4px' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                                  {line.product_name}
                                </div>
                                {(line.product_code || line.product_barcode) && (
                                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                    {line.product_code && <span>SKU: {line.product_code}</span>}
                                    {line.product_code && line.product_barcode && <span> | </span>}
                                    {line.product_barcode && <span>条码: {line.product_barcode}</span>}
                                  </div>
                                )}
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 600, color: '#059669', fontSize: '15px' }}>
                                  ${(line.price_subtotal_incl || line.price_subtotal || 0).toFixed(2)}
                                  {line.price_subtotal_incl && line.price_subtotal && line.price_subtotal_incl !== line.price_subtotal && (
                                    <span style={{ fontSize: '11px', fontWeight: 400, color: '#6b7280', marginLeft: '4px' }}>
                                      (税前: ${line.price_subtotal.toFixed(2)})
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                                  {line.quantity} × ${line.unit_price?.toFixed(2) || '0.00'}
                                  {line.discount > 0 && (
                                    <span style={{ color: '#dc2626', marginLeft: '4px' }}>
                                      (折扣: {line.discount}%)
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                      暂无订单明细
                    </div>
                  )}

                  {/* 订单总计 */}
                  <div style={{
                    padding: '16px',
                    background: '#f0f4ff',
                    borderRadius: '8px',
                    border: '1px solid #dbeafe'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '14px', color: '#6b7280' }}>税前总额：</span>
                      <span style={{ fontWeight: 600, color: '#374151' }}>
                        ${(selectedOrderDetail.amount_untaxed || 0).toFixed(2)}
                      </span>
                    </div>
                    {selectedOrderDetail.amount_tax > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '14px', color: '#6b7280' }}>税额：</span>
                        <span style={{ fontWeight: 600, color: '#374151' }}>
                          ${(selectedOrderDetail.amount_tax || 0).toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid #dbeafe' }}>
                      <span style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>总计：</span>
                      <span style={{ fontSize: '20px', fontWeight: 700, color: '#059669' }}>
                        ${(selectedOrderDetail.amount_total || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                  无法加载订单详情
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 库存变动历史模态框 */}
      {showStockHistoryModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
          onClick={() => {
            setShowStockHistoryModal(false);
            setStockHistory([]);
            setSelectedProductForStockHistory(null);
          }}
        >
          <div
            className="stock-history-modal-content"
            style={{
              background: '#fff',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '900px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="stock-history-modal-title" style={{
              padding: '20px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#111827' }}>
                📦 库存变动历史
                {stockHistoryTotal > 0 && (
                  <span style={{ fontSize: '14px', fontWeight: 400, color: '#6b7280', marginLeft: '8px' }}>
                    (共 {stockHistoryTotal} 条记录)
                  </span>
                )}
              </h2>
              <button
                onClick={() => {
                  setShowStockHistoryModal(false);
                  setStockHistory([]);
                  setSelectedProductForStockHistory(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f3f4f6';
                  e.currentTarget.style.color = '#111827';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'none';
                  e.currentTarget.style.color = '#6b7280';
                }}
              >
                ×
              </button>
            </div>

            {/* 内容区域 */}
            <div className="stock-history-modal-body" style={{
              padding: '20px',
              overflowY: 'auto',
              flex: 1
            }}>
              {stockHistoryLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                  加载中...
                </div>
              ) : stockHistory.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {stockHistory.map((item: any) => {
                    const isIn = item.move_type === 'in';
                    const isOut = item.move_type === 'out';
                    const isTransfer = item.move_type === 'transfer';
                    
                    return (
                      <div
                        key={item.id}
                        style={{
                          padding: '16px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          background: '#f9fafb',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#f3f4f6';
                          e.currentTarget.style.borderColor = '#d1d5db';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#f9fafb';
                          e.currentTarget.style.borderColor = '#e5e7eb';
                        }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', alignItems: 'start' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                              <span style={{ fontWeight: 600, color: '#111827', fontSize: '14px' }}>
                                {item.date || '未知日期'}
                              </span>
                              {isIn && (
                                <span style={{
                                  fontSize: '10px',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: '#d1fae5',
                                  color: '#059669',
                                  fontWeight: 600
                                }}>
                                  入库
                                </span>
                              )}
                              {isOut && (
                                <span style={{
                                  fontSize: '10px',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: '#fee2e2',
                                  color: '#dc2626',
                                  fontWeight: 600
                                }}>
                                  出库
                                </span>
                              )}
                              {isTransfer && (
                                <span style={{
                                  fontSize: '10px',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: '#e0e7ff',
                                  color: '#6366f1',
                                  fontWeight: 600
                                }}>
                                  转移
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                              {item.from && item.to ? (
                                <>
                                  <span style={{ color: '#dc2626' }}>{item.from}</span>
                                  <span style={{ margin: '0 6px' }}>→</span>
                                  <span style={{ color: '#059669' }}>{item.to}</span>
                                </>
                              ) : (
                                <span>{item.from || item.to || '未知位置'}</span>
                              )}
                            </div>
                            {item.ref && (
                              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                                参考: {item.ref}
                              </div>
                            )}
                          </div>
                          
                          {/* 变动数量 */}
                          <div style={{ textAlign: 'right', minWidth: '80px' }}>
                            <div style={{
                              fontWeight: 700,
                              fontSize: '16px',
                              color: isIn ? '#059669' : isOut ? '#dc2626' : '#6366f1'
                            }}>
                              {isIn ? '+' : isOut ? '-' : ''}{item.qty_absolute || 0} {item.uom || 'Units'}
                            </div>
                          </div>
                          
                          {/* 库存余额 */}
                          <div style={{ textAlign: 'right', minWidth: '100px' }}>
                            <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '2px' }}>
                              余额
                            </div>
                            <div style={{
                              fontWeight: 600,
                              fontSize: '14px',
                              color: '#374151'
                            }}>
                              {item.balance_after?.toFixed(0) || '0'} {item.uom || 'Units'}
                            </div>
                            {item.balance_before !== undefined && item.balance_before !== item.balance_after && (
                              <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>
                                变动前: {item.balance_before?.toFixed(0) || '0'}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {(item.created_by || item.updated_by) && (
                          <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e5e7eb' }}>
                            {item.created_by && <span>创建: {item.created_by}</span>}
                            {item.created_by && item.updated_by && <span> | </span>}
                            {item.updated_by && <span>更新: {item.updated_by}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                  暂无库存变动记录
                </div>
              )}
            </div>

            {/* 分页栏 */}
            {stockHistoryTotal > stockHistoryPageSize && (
              <div className="stock-history-modal-footer" style={{
                padding: '16px 20px',
                borderTop: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ fontSize: '13px', color: '#6b7280' }}>
                  第 {stockHistoryPage} 页，共 {Math.ceil(stockHistoryTotal / stockHistoryPageSize)} 页
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => {
                      if (stockHistoryPage > 1 && selectedProductForStockHistory) {
                        loadStockHistory(selectedProductForStockHistory, stockHistoryPage - 1);
                      }
                    }}
                    disabled={stockHistoryPage <= 1 || stockHistoryLoading}
                    style={{
                      padding: '6px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      background: stockHistoryPage <= 1 ? '#f3f4f6' : '#fff',
                      color: stockHistoryPage <= 1 ? '#9ca3af' : '#374151',
                      cursor: stockHistoryPage <= 1 ? 'not-allowed' : 'pointer',
                      fontSize: '13px',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (stockHistoryPage > 1) {
                        e.currentTarget.style.background = '#f9fafb';
                        e.currentTarget.style.borderColor = '#9ca3af';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (stockHistoryPage > 1) {
                        e.currentTarget.style.background = '#fff';
                        e.currentTarget.style.borderColor = '#d1d5db';
                      }
                    }}
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => {
                      if (stockHistoryPage < Math.ceil(stockHistoryTotal / stockHistoryPageSize) && selectedProductForStockHistory) {
                        loadStockHistory(selectedProductForStockHistory, stockHistoryPage + 1);
                      }
                    }}
                    disabled={stockHistoryPage >= Math.ceil(stockHistoryTotal / stockHistoryPageSize) || stockHistoryLoading}
                    style={{
                      padding: '6px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      background: stockHistoryPage >= Math.ceil(stockHistoryTotal / stockHistoryPageSize) ? '#f3f4f6' : '#fff',
                      color: stockHistoryPage >= Math.ceil(stockHistoryTotal / stockHistoryPageSize) ? '#9ca3af' : '#374151',
                      cursor: stockHistoryPage >= Math.ceil(stockHistoryTotal / stockHistoryPageSize) ? 'not-allowed' : 'pointer',
                      fontSize: '13px',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (stockHistoryPage < Math.ceil(stockHistoryTotal / stockHistoryPageSize)) {
                        e.currentTarget.style.background = '#f9fafb';
                        e.currentTarget.style.borderColor = '#9ca3af';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (stockHistoryPage < Math.ceil(stockHistoryTotal / stockHistoryPageSize)) {
                        e.currentTarget.style.background = '#fff';
                        e.currentTarget.style.borderColor = '#d1d5db';
                      }
                    }}
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 采购订单详情模态框 */}
      {showPurchaseOrderDetailModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
          onClick={() => {
            setShowPurchaseOrderDetailModal(false);
            setSelectedPurchaseOrderDetail(null);
          }}
        >
          <div
            className="purchase-order-modal-content"
            style={{
              background: '#fff',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '900px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="purchase-order-modal-title" style={{
              padding: '20px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#111827' }}>
                📋 采购订单详情
              </h2>
              <button
                onClick={() => {
                  setShowPurchaseOrderDetailModal(false);
                  setSelectedPurchaseOrderDetail(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f3f4f6';
                  e.currentTarget.style.color = '#111827';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'none';
                  e.currentTarget.style.color = '#6b7280';
                }}
              >
                ×
              </button>
            </div>

            {/* 内容区域 */}
            <div className="purchase-order-modal-body" style={{
              padding: '20px',
              overflowY: 'auto',
              flex: 1
            }}>
              {purchaseOrderDetailLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                  加载中...
                </div>
              ) : selectedPurchaseOrderDetail ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* 订单基本信息 */}
                  <div style={{
                    padding: '16px',
                    background: '#f9fafb',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                      <div>
                        <span style={{ color: '#6b7280', fontSize: '13px' }}>订单号：</span>
                        <span style={{ fontWeight: 600, color: '#111827' }}>{selectedPurchaseOrderDetail.name}</span>
                      </div>
                      <div>
                        <span style={{ color: '#6b7280', fontSize: '13px' }}>日期：</span>
                        <span style={{ fontWeight: 500 }}>{selectedPurchaseOrderDetail.date_order || '未知日期'}</span>
                      </div>
                      <div>
                        <span style={{ color: '#6b7280', fontSize: '13px' }}>供应商：</span>
                        <span style={{ fontWeight: 500 }}>{selectedPurchaseOrderDetail.supplier || '未知供应商'}</span>
                      </div>
                      <div>
                        <span style={{ color: '#6b7280', fontSize: '13px' }}>状态：</span>
                        <span style={{
                          fontWeight: 500,
                          color: selectedPurchaseOrderDetail.state === 'done' ? '#059669' : selectedPurchaseOrderDetail.state === 'cancel' ? '#dc2626' : '#6b7280'
                        }}>
                          {selectedPurchaseOrderDetail.state === 'done' ? '已完成' : selectedPurchaseOrderDetail.state === 'cancel' ? '已取消' : selectedPurchaseOrderDetail.state || '未知'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 订单行列表 */}
                  {selectedPurchaseOrderDetail.lines && selectedPurchaseOrderDetail.lines.length > 0 ? (
                    <div>
                      <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600, color: '#111827' }}>
                        订单明细
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {selectedPurchaseOrderDetail.lines.map((line: any) => (
                          <div
                            key={line.id}
                            style={{
                              padding: '12px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              background: '#fff'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '4px' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                                  {line.product_name}
                                </div>
                                {(line.product_code || line.product_barcode) && (
                                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                    {line.product_code && <span>SKU: {line.product_code}</span>}
                                    {line.product_code && line.product_barcode && <span> | </span>}
                                    {line.product_barcode && <span>条码: {line.product_barcode}</span>}
                                  </div>
                                )}
                                {line.date_planned && (
                                  <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                                    计划日期: {line.date_planned}
                                  </div>
                                )}
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 600, color: '#f59e0b', fontSize: '15px' }}>
                                  {/* 优先显示税前价格，如果有税后价格且不同则显示税后价格 */}
                                  {line.price_subtotal && line.price_subtotal_incl && line.price_subtotal !== line.price_subtotal_incl ? (
                                    <>
                                      ${line.price_subtotal.toFixed(2)}
                                      <span style={{ fontSize: '11px', fontWeight: 400, color: '#6b7280', marginLeft: '4px' }}>
                                        (税后: ${line.price_subtotal_incl.toFixed(2)})
                                      </span>
                                    </>
                                  ) : (
                                    `$${(line.price_subtotal || line.price_subtotal_incl || 0).toFixed(2)}`
                                  )}
                                </div>
                                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                                  {line.quantity} × ${line.unit_price?.toFixed(2) || '0.00'}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                      暂无订单明细
                    </div>
                  )}

                  {/* 订单总计 */}
                  <div style={{
                    padding: '16px',
                    background: '#fef3c7',
                    borderRadius: '8px',
                    border: '1px solid #fde68a'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '14px', color: '#6b7280' }}>税前总额：</span>
                      <span style={{ fontWeight: 600, color: '#374151' }}>
                        ${(selectedPurchaseOrderDetail.amount_untaxed || 0).toFixed(2)}
                      </span>
                    </div>
                    {selectedPurchaseOrderDetail.amount_tax > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '14px', color: '#6b7280' }}>税额：</span>
                        <span style={{ fontWeight: 600, color: '#374151' }}>
                          ${(selectedPurchaseOrderDetail.amount_tax || 0).toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid #fde68a' }}>
                      <span style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>总计：</span>
                      <span style={{ fontSize: '20px', fontWeight: 700, color: '#f59e0b' }}>
                        ${(selectedPurchaseOrderDetail.amount_total || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                  无法加载订单详情
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 产品详情模态框（用于网格视图） */}
      {showProductDetailModal && selectedProduct && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px'
          }}
          onClick={() => {
            setShowProductDetailModal(false);
            setSelectedProduct(null);
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '800px',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
              position: 'relative',
              width: '100%'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              borderBottom: '1px solid #e5e7eb',
              paddingBottom: '16px'
            }}>
              <h2 style={{
                margin: 0,
                fontSize: '20px',
                fontWeight: 600,
                color: '#111827'
              }}>
                产品详情
              </h2>
              <button
                onClick={() => {
                  setShowProductDetailModal(false);
                  setSelectedProduct(null);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '24px',
                  color: '#6b7280',
                  cursor: 'pointer',
                  padding: '0',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '6px',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f3f4f6';
                  e.currentTarget.style.color = '#111827';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = '#6b7280';
                }}
              >
                ×
              </button>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '24px',
              alignItems: 'start'
            }}>
              {/* 产品图片 */}
              {selectedProduct.image_128 && (
                <div style={{
                  width: '200px',
                  height: '200px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  background: '#f3f4f6',
                  border: '1px solid #e5e7eb',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
                onClick={() => handleImageClick(selectedProduct.image_128, selectedProduct.id)}
                >
                  <img
                    src={`data:image/png;base64,${selectedProduct.image_128}`}
                    alt={selectedProduct.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain'
                    }}
                  />
                </div>
              )}

              {/* 产品信息 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  color: '#111827',
                  marginBottom: '16px',
                  wordBreak: 'break-word'
                }}>
                  {selectedProduct.name}
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '12px',
                  fontSize: '14px'
                }}>
                  <div>
                    <span style={{ color: '#6b7280' }}>SKU：</span>
                    <span style={{ color: '#374151', fontWeight: 500 }}>{selectedProduct.default_code || '-'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#6b7280' }}>POS类别：</span>
                    <span style={{ color: '#374151', fontWeight: 500 }}>{selectedProduct.pos_category}</span>
                  </div>
                  <div>
                    <span style={{ color: '#6b7280' }}>售价：</span>
                    <span style={{ color: '#059669', fontWeight: 600 }}>
                      ${selectedProduct.list_price.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#6b7280' }}>成本：</span>
                    <span style={{ color: '#dc2626', fontWeight: 600 }}>
                      ${selectedProduct.standard_price.toFixed(2)}
                    </span>
                  </div>
                  {selectedProduct.raytech_p3 !== null && (
                    <div>
                      <span style={{ color: '#6b7280' }}>总部零售价：</span>
                      <span style={{ color: '#059669', fontWeight: 600 }}>
                        ${selectedProduct.raytech_p3.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div>
                    <span style={{ color: '#6b7280' }}>当前库存：</span>
                    <span
                      onClick={() => loadStockHistory(selectedProduct.id)}
                      style={{
                        color: '#667eea',
                        fontWeight: 600,
                        fontSize: '16px',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#5568d3';
                        e.currentTarget.style.textDecoration = 'none';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#667eea';
                        e.currentTarget.style.textDecoration = 'underline';
                      }}
                    >
                      {selectedProduct.qty_available}
                    </span>
                    {selectedProduct.free_qty > 0 && (
                      <span style={{ marginLeft: 8, color: '#6b7280', fontSize: '12px' }}>
                        (可用: {selectedProduct.free_qty})
                      </span>
                    )}
                  </div>
                  <div>
                    <span style={{ color: '#6b7280' }}>总部库存：</span>
                    <span
                      onClick={() => {
                        if (selectedProduct.raytech_web_name) {
                          if (window.confirm(`即将跳转到 Raytech 网站搜索 "${selectedProduct.raytech_web_name}"，是否继续？`)) {
                            window.open(`https://www.raytech.co.nz/index.php?route=product/search&search=${encodeURIComponent(selectedProduct.raytech_web_name)}`, '_blank');
                          }
                        }
                      }}
                      style={{
                        color: (selectedProduct.raytech_stock ?? 0) > 0 ? '#059669' : '#6b7280',
                        fontWeight: 600,
                        cursor: selectedProduct.raytech_web_name ? 'pointer' : 'default',
                        textDecoration: selectedProduct.raytech_web_name ? 'underline' : 'none',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (selectedProduct.raytech_web_name) {
                          e.currentTarget.style.color = '#047857';
                          e.currentTarget.style.textDecoration = 'none';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedProduct.raytech_web_name) {
                          e.currentTarget.style.color = (selectedProduct.raytech_stock ?? 0) > 0 ? '#059669' : '#6b7280';
                          e.currentTarget.style.textDecoration = 'underline';
                        }
                      }}
                    >
                      {selectedProduct.raytech_stock ?? 0}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#6b7280' }}>销售数量：</span>
                    <span 
                      onClick={() => {
                        setSelectedProductId(selectedProduct.id);
                        setShowSalesModal(true);
                        setShowProductDetailModal(false);
                        loadSalesOrders(selectedProduct.id);
                      }}
                      style={{ 
                        color: '#667eea', 
                        fontWeight: 600,
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#5568d3';
                        e.currentTarget.style.textDecoration = 'none';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#667eea';
                        e.currentTarget.style.textDecoration = 'underline';
                      }}
                    >
                      {selectedProduct.sales_quantity.toFixed(0)}
                    </span>
                  </div>
                  <div className="product-info-item">
                    <span style={{ color: '#6b7280' }}>采购数量：</span>
                    <span 
                      onClick={() => {
                        setSelectedProductId(selectedProduct.id);
                        setShowPurchaseModal(true);
                        setShowProductDetailModal(false);
                        loadPurchaseOrders(selectedProduct.id);
                      }}
                      style={{ 
                        color: '#f59e0b', 
                        fontWeight: 600,
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#d97706';
                        e.currentTarget.style.textDecoration = 'none';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#f59e0b';
                        e.currentTarget.style.textDecoration = 'underline';
                      }}
                    >
                      {selectedProduct.purchase_quantity.toFixed(0)}
                    </span>
                  </div>
                  {searchMode === 'lot' && (
                    <div className="product-info-item">
                      <span style={{ color: '#6b7280' }}>Lot/Serial：</span>
                      <span
                        onClick={() => {
                          setShowProductDetailModal(false);
                          loadProductLotSerials(selectedProduct.id);
                        }}
                        title="查看所有Lot/Serial"
                        style={{
                          color: '#6366f1',
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontSize: '18px',
                          marginLeft: '8px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: '#eef2ff',
                          transition: 'all 0.2s ease',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '28px',
                          height: '28px'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#4f46e5';
                          e.currentTarget.style.background = '#e0e7ff';
                          e.currentTarget.style.transform = 'scale(1.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#6366f1';
                          e.currentTarget.style.background = '#eef2ff';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                      >
                        🔢
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lot/Serial详情模态框 */}
      {showLotSerialModal && (
        <div
          className="lot-serial-modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
            overflow: 'auto'
          }}
          onClick={() => {
            setShowLotSerialModal(false);
            setLotSerialDetail(null);
            setSelectedLotSerial(null);
          }}
        >
          <div
            className="lot-serial-modal-content"
            style={{
              background: '#fff',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '900px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              margin: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="lot-serial-modal-header" style={{
              padding: '20px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0
            }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#111827' }}>
                🔢 Lot/Serial详情
              </h2>
              <button
                onClick={() => {
                  setShowLotSerialModal(false);
                  setLotSerialDetail(null);
                  setSelectedLotSerial(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '28px',
                  lineHeight: '1',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '4px 12px',
                  borderRadius: '6px',
                  transition: 'all 0.2s ease',
                  minWidth: '44px',
                  minHeight: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f3f4f6';
                  e.currentTarget.style.color = '#111827';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'none';
                  e.currentTarget.style.color = '#6b7280';
                }}
              >
                ×
              </button>
            </div>

            {/* 内容区域 */}
            <div className="lot-serial-modal-body" style={{ 
              padding: '20px', 
              overflow: 'auto', 
              flex: 1,
              WebkitOverflowScrolling: 'touch'
            }}>
              {lotSerialDetailLoading ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
                  <div style={{ fontSize: '16px', marginBottom: '8px' }}>加载中...</div>
                  <div style={{ fontSize: '12px', color: '#9ca3af' }}>正在获取Lot/Serial信息</div>
                </div>
              ) : lotSerialDetail && lotSerialDetail.product ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* 产品信息 */}
                  <div style={{
                    padding: '16px',
                    background: 'linear-gradient(135deg, #f0f4ff 0%, #e0e7ff 100%)',
                    borderRadius: '10px',
                    border: '1px solid #dbeafe',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
                  }}>
                    <h3 style={{ margin: '0 0 14px 0', fontSize: '16px', fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>📦</span>
                      <span>产品信息</span>
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                      <div>
                        <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: '6px', fontWeight: 500 }}>产品名称</div>
                        <div style={{ color: '#111827', fontWeight: 600, fontSize: '15px', lineHeight: '1.4', wordBreak: 'break-word' }}>
                          {lotSerialDetail.product.name}
                        </div>
                      </div>
                      {lotSerialDetail.product.code && (
                        <div>
                          <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: '6px', fontWeight: 500 }}>产品编码</div>
                          <div style={{ color: '#374151', fontSize: '14px', fontFamily: 'monospace', fontWeight: 500 }}>
                            {lotSerialDetail.product.code}
                          </div>
                        </div>
                      )}
                      {lotSerialDetail.product.barcode && (
                        <div>
                          <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: '6px', fontWeight: 500 }}>条码</div>
                          <div style={{ color: '#374151', fontSize: '14px', fontFamily: 'monospace', fontWeight: 500 }}>
                            {lotSerialDetail.product.barcode}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Lot/Serial列表 */}
                  {(() => {
                    const lotSerials = lotSerialDetail.lot_serials;
                    const hasLotSerials = lotSerials && Array.isArray(lotSerials) && lotSerials.length > 0;
                    return hasLotSerials;
                  })() ? (
                    <div>
                      <div className="lot-serial-list-header" style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        marginBottom: '16px',
                        flexWrap: 'wrap',
                        gap: '12px'
                      }}>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>🔢</span>
                          <span>Lot/Serial列表 ({lotSerialDetail.lot_serials.length} 个)</span>
                        </h3>
                        <div style={{ 
                          display: 'flex', 
                          gap: '12px', 
                          alignItems: 'center',
                          flexWrap: 'wrap'
                        }}>
                          <span style={{ 
                            fontSize: '12px', 
                            color: '#6b7280',
                            padding: '4px 10px',
                            background: '#f3f4f6',
                            borderRadius: '12px',
                            whiteSpace: 'nowrap'
                          }}>
                            <span style={{ color: '#10b981', fontWeight: 600 }}>
                              在库: {lotSerialDetail.lot_serials.filter((ls: any) => (ls.summary?.total_quantity || 0) > 0).length}
                            </span>
                            {' | '}
                            <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                              不在库: {lotSerialDetail.lot_serials.filter((ls: any) => (ls.summary?.total_quantity || 0) === 0).length}
                            </span>
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {lotSerialDetail.lot_serials.map((lotSerial: any, idx: number) => {
                          // 在库 = 有库存（total_quantity > 0）
                          const inStock = (lotSerial.summary?.total_quantity || 0) > 0;
                          return (
                          <div
                            key={idx}
                            className="lot-serial-item"
                            style={{
                              padding: '14px 16px',
                              border: `2px solid ${inStock ? '#10b981' : '#f59e0b'}`,
                              borderRadius: '8px',
                              background: inStock ? 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)' : 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '12px',
                              transition: 'all 0.2s ease',
                              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'translateY(-2px)';
                              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.15)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ 
                                color: '#111827', 
                                fontWeight: 600, 
                                fontSize: '15px', 
                                marginBottom: '6px',
                                wordBreak: 'break-word',
                                lineHeight: '1.4'
                              }}>
                                {lotSerial.lot.name}
                              </div>
                              {lotSerial.lot.ref && (
                                <div style={{ 
                                  color: '#6b7280', 
                                  fontSize: '12px',
                                  wordBreak: 'break-word'
                                }}>
                                  参考号: {lotSerial.lot.ref}
                                </div>
                              )}
                            </div>
                            <div style={{ flexShrink: 0 }}>
                              {inStock ? (
                                <span style={{
                                  fontSize: '13px',
                                  padding: '8px 14px',
                                  borderRadius: '20px',
                                  background: '#10b981',
                                  color: '#fff',
                                  fontWeight: 600,
                                  whiteSpace: 'nowrap',
                                  boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)'
                                }}>
                                  在库
                                </span>
                              ) : (
                                <span style={{
                                  fontSize: '13px',
                                  padding: '8px 14px',
                                  borderRadius: '20px',
                                  background: '#f59e0b',
                                  color: '#fff',
                                  fontWeight: 600,
                                  whiteSpace: 'nowrap',
                                  boxShadow: '0 2px 4px rgba(245, 158, 11, 0.3)'
                                }}>
                                  不在库
                                </span>
                              )}
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : lotSerialDetail?.error ? (
                    <div style={{ 
                      textAlign: 'center', 
                      padding: '60px 20px',
                      background: '#fef2f2',
                      borderRadius: '10px',
                      border: '1px solid #fecaca'
                    }}>
                      <div style={{ fontSize: '24px', marginBottom: '12px' }}>❌</div>
                      <div style={{ color: '#dc2626', marginBottom: '8px', fontWeight: 600, fontSize: '16px' }}>
                        加载失败
                      </div>
                      <div style={{ color: '#6b7280', fontSize: '14px' }}>
                        {lotSerialDetail.error}
                      </div>
                    </div>
                  ) : (
                    <div style={{ 
                      textAlign: 'center', 
                      padding: '60px 20px', 
                      color: '#6b7280',
                      background: '#f9fafb',
                      borderRadius: '10px',
                      border: '1px solid #e5e7eb'
                    }}>
                      <div style={{ fontSize: '48px', marginBottom: '16px' }}>📦</div>
                      <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '8px' }}>
                        该产品没有Lot/Serial信息
                      </div>
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                        请检查服务器日志以获取更多信息
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '60px 20px', 
                  color: '#6b7280',
                  background: '#f9fafb',
                  borderRadius: '10px'
                }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
                  <div style={{ fontSize: '16px', fontWeight: 500 }}>
                    无法加载Lot/Serial详情
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

