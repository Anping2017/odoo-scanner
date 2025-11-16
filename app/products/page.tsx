'use client';

import { useCallback, useEffect, useState } from 'react';

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
  image_128: string | null;
  pos_category: string;
  sales_quantity: number;
  purchase_quantity: number;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]); // 当前显示的产品（经过筛选、排序、分页）
  const [cachedProducts, setCachedProducts] = useState<Product[]>([]); // 缓存的搜索结果（从API获取的完整数据）
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [apiSearchTerm, setApiSearchTerm] = useState(''); // API搜索词（防抖）
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showSalesModal, setShowSalesModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [filterStoreStock, setFilterStoreStock] = useState<boolean | null>(null); // null=全部, true=有货, false=无货
  const [filterHeadquartersStock, setFilterHeadquartersStock] = useState<boolean | null>(null); // null=全部, true=有货, false=无货
  const [posCategories, setPosCategories] = useState<string[]>([]); // 所有POS类别列表
  const [selectedPosCategories, setSelectedPosCategories] = useState<string[]>([]); // 选中的POS类别（多选）
  const [minPrice, setMinPrice] = useState<string>(''); // 最低价格
  const [maxPrice, setMaxPrice] = useState<string>(''); // 最高价格
  const [searchMode, setSearchMode] = useState<'fuzzy' | 'exact' | 'name' | 'sku'>('fuzzy'); // 搜索模式：模糊/精确/按名称/按SKU
  const [sortField, setSortField] = useState<string>('name'); // 排序字段
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc'); // 排序方向
  const [showFilters, setShowFilters] = useState<boolean>(true); // 显示/隐藏筛选器
  const [showSort, setShowSort] = useState<boolean>(true); // 显示/隐藏排序器

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
  }, [filterStoreStock, filterHeadquartersStock, selectedPosCategories, minPrice, maxPrice, searchMode, sortField, sortOrder]);

  // 当搜索词变化时，重置缓存和分页
  useEffect(() => {
    if (apiSearchTerm !== searchTerm) {
      setCachedProducts([]);
      setCurrentPage(1);
    }
  }, [apiSearchTerm, searchTerm]);

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
          if (res.status === 504) {
            throw new Error('请求超时，请尝试缩小搜索范围或稍后重试');
          }
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();

        if (data.error) {
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

    // 应用排序
    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'list_price':
          aValue = a.list_price;
          bValue = b.list_price;
          break;
        case 'raytech_p3':
          aValue = a.raytech_p3 ?? 0;
          bValue = b.raytech_p3 ?? 0;
          break;
        case 'qty_available':
          aValue = a.qty_available;
          bValue = b.qty_available;
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
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginated = filtered.slice(startIndex, endIndex);

    setProducts(paginated);
    setTotalCount(total);
    setTotalPages(totalPages);
  }, [cachedProducts, filterStoreStock, filterHeadquartersStock, sortField, sortOrder, currentPage, pageSize]);

  // 当搜索词变化时，从API加载（只在有搜索条件时）
  useEffect(() => {
    // 只有当有搜索条件时才加载
    if (apiSearchTerm.trim() || selectedPosCategories.length > 0 || minPrice || maxPrice) {
      loadSearchResults();
    } else {
      // 如果没有搜索条件，清空缓存和产品列表
      setCachedProducts([]);
      setProducts([]);
      setTotalCount(0);
      setTotalPages(1);
    }
  }, [apiSearchTerm, searchMode, selectedPosCategories, minPrice, maxPrice, loadSearchResults]);

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

  // 加载销售订单
  const loadSalesOrders = useCallback(async (productId: number) => {
    setOrdersLoading(true);
    try {
      const res = await fetch(`/api/sales-history?product_id=${productId}&page=1&page_size=500`, { cache: 'no-store' });
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setSalesOrders(Array.isArray(data.salesHistory) ? data.salesHistory : []);
    } catch (e: any) {
      console.error('加载销售订单失败:', e);
      setSalesOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  // 加载采购订单
  const loadPurchaseOrders = useCallback(async (productId: number) => {
    setOrdersLoading(true);
    try {
      const res = await fetch(`/api/purchase-history?product_id=${productId}&page=1&page_size=500`, { cache: 'no-store' });
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      // API返回的字段是purchases，不是purchaseHistory
      setPurchaseOrders(Array.isArray(data.purchases) ? data.purchases : []);
    } catch (e: any) {
      console.error('加载采购订单失败:', e);
      setPurchaseOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  // 加载POS类别列表
  const loadPosCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/pos-categories', { cache: 'no-store' });
      const data = await res.json();
      if (data.error) {
        console.warn('加载POS类别失败:', data.error);
        return;
      }
      const categories = Array.isArray(data.categories) ? (data.categories as string[]) : [];
      // 过滤掉"Unset"和"Others"类别，去重并排序
      const filteredCategories = categories.filter((cat: string) => cat !== 'Unset' && cat !== 'Others');
      const uniqueCategories = [...new Set(filteredCategories)].sort() as string[];
      setPosCategories(uniqueCategories);
    } catch (e) {
      console.warn('加载POS类别失败:', e);
    }
  }, []);

  useEffect(() => {
    // 页面加载时只加载POS类别列表，不加载产品
    loadPosCategories();
  }, [loadPosCategories]);

  // 查看大图
  const handleImageClick = useCallback((imageData: string | null) => {
    if (imageData) {
      setSelectedImage(`data:image/png;base64,${imageData}`);
      setShowImageModal(true);
    }
  }, []);

  // 分页处理
  const handlePageChange = useCallback((newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [totalPages]);

  // 筛选已在API层面完成，这里直接使用products
  const filteredProducts = products;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 768px) {
          .products-container {
            padding: 12px !important;
          }
          /* 顶部导航栏 */
          .top-nav {
            flex-wrap: wrap !important;
            gap: 8px !important;
            padding: 12px 16px !important;
          }
          .top-nav-button {
            padding: 6px 12px !important;
            font-size: 12px !important;
          }
          /* 搜索区域 */
          .products-header {
            flex-direction: column !important;
            gap: 12px !important;
            padding: 16px !important;
          }
          .search-mode-buttons {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 6px !important;
            width: 100% !important;
          }
          .search-mode-buttons button {
            font-size: 12px !important;
            padding: 8px 12px !important;
            white-space: nowrap !important;
          }
          .products-search {
            width: 100% !important;
            min-width: 100% !important;
          }
          .products-search input {
            font-size: 18px !important;
            padding: 16px 20px !important;
            border: 3px solid #667eea !important;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2) !important;
          }
          .products-search > div:last-child {
            font-size: 11px !important;
            line-height: 1.4 !important;
          }
          .products-search > div:last-child code {
            font-size: 10px !important;
            padding: 1px 4px !important;
          }
          /* 产品总数显示 */
          .products-header > div:last-child {
            width: 100% !important;
            align-items: flex-start !important;
            min-width: auto !important;
          }
          .products-header > div:last-child > div:first-child {
            font-size: 14px !important;
          }
          /* 筛选栏 */
          .filter-bar {
            margin-bottom: 16px !important;
          }
          .filter-bar > div:first-child {
            padding: 10px 16px !important;
            font-size: 13px !important;
          }
          .filter-bar > div:last-child {
            padding: 12px 16px !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 12px !important;
          }
          .filter-group {
            width: 100% !important;
            flex-direction: column !important;
            gap: 12px !important;
          }
          .filter-group > div {
            width: 100% !important;
            flex-wrap: wrap !important;
            gap: 6px !important;
          }
          .filter-group > div > span:first-child {
            width: 100% !important;
            margin-bottom: 4px !important;
            font-size: 12px !important;
          }
          .filter-buttons {
            font-size: 12px !important;
            padding: 6px 10px !important;
            min-height: 36px !important;
          }
          .pos-category-button {
            font-size: 11px !important;
            padding: 6px 10px !important;
            min-height: 36px !important;
          }
          .price-filter-input {
            width: 100px !important;
            font-size: 14px !important;
            padding: 8px 10px !important;
          }
          /* 排序栏 */
          .sort-bar {
            padding: 12px 16px !important;
            flex-direction: column !important;
            gap: 12px !important;
          }
          .sort-bar > div:first-child {
            width: 100% !important;
            font-size: 13px !important;
          }
          .sort-controls {
            width: 100% !important;
            flex-direction: column !important;
            gap: 8px !important;
          }
          .sort-controls select {
            width: 100% !important;
            font-size: 14px !important;
            padding: 8px 10px !important;
          }
          .sort-controls button {
            width: 100% !important;
            font-size: 13px !important;
            padding: 8px 12px !important;
          }
          /* 筛选结果显示 */
          .filter-results {
            padding: 12px 16px !important;
            font-size: 13px !important;
            margin-top: 12px !important;
          }
          /* 产品卡片 */
          .product-card {
            padding: 12px !important;
            margin-bottom: 12px !important;
          }
          .product-info-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .product-image-container {
            width: 100% !important;
            max-width: 150px !important;
            height: 150px !important;
            margin: 0 auto 12px !important;
          }
          .product-name {
            font-size: 15px !important;
            margin-bottom: 10px !important;
          }
          .product-info-grid > div:last-child {
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 10px !important;
          }
          .product-info-item {
            font-size: 12px !important;
            padding: 6px 0 !important;
            border-bottom: 1px solid #f3f4f6 !important;
          }
          .product-info-item:last-child {
            border-bottom: none !important;
          }
          /* 分页控件 */
          .pagination {
            flex-wrap: wrap !important;
            gap: 8px !important;
            padding: 16px 0 !important;
          }
          .pagination button {
            flex: 1 1 calc(50% - 4px) !important;
            min-width: calc(50% - 4px) !important;
            font-size: 13px !important;
            padding: 10px 12px !important;
          }
          .pagination > div {
            width: 100% !important;
            justify-content: center !important;
            margin: 8px 0 !important;
            font-size: 13px !important;
          }
          .pagination input {
            width: 70px !important;
            font-size: 14px !important;
            padding: 8px !important;
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
      ` }} />

      <div className="products-container" style={{ 
        maxWidth: '1400px', 
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
              <input
                type="text"
                placeholder={
                  searchMode === 'fuzzy' 
                    ? '🔍 输入关键词搜索（支持多关键词，用空格分隔）...' 
                    : searchMode === 'exact'
                    ? '🎯 输入完整的产品名称、SKU或条码...'
                    : searchMode === 'name'
                    ? '📝 输入产品名称搜索...'
                    : '🏷️ 输入SKU搜索...'
                }
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '18px 24px',
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
              {/* 搜索提示 */}
              <div style={{
                fontSize: '12px',
                color: '#6b7280',
                paddingLeft: '4px',
                lineHeight: '1.5'
              }}>
                {searchMode === 'fuzzy' ? (
                  <>
                    <span style={{ color: '#667eea', fontWeight: 500 }}>💡 模糊搜索：</span>
                    支持多关键词（空格分隔），每个关键词都要出现。用引号包裹精确短语，如 <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>"iPhone 15"</code> battery
                  </>
                ) : searchMode === 'exact' ? (
                  <>
                    <span style={{ color: '#667eea', fontWeight: 500 }}>💡 精确搜索：</span>
                    完全匹配产品名称、SKU或条码（不区分大小写）
                  </>
                ) : searchMode === 'name' ? (
                  <>
                    <span style={{ color: '#667eea', fontWeight: 500 }}>💡 按名称搜索：</span>
                    仅在产品名称中搜索（不搜索SKU和条码），支持模糊匹配
                  </>
                ) : (
                  <>
                    <span style={{ color: '#667eea', fontWeight: 500 }}>💡 按SKU搜索：</span>
                    仅在SKU（产品编码）中搜索（不搜索名称和条码），支持模糊匹配
                  </>
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
                  {searchMode === 'fuzzy' ? '模糊匹配' : searchMode === 'exact' ? '精确匹配' : searchMode === 'name' ? '名称搜索' : 'SKU搜索'}
                </div>
              )}
            </div>
          </div>
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
              {(filterStoreStock !== null || filterHeadquartersStock !== null || selectedPosCategories.length > 0 || minPrice || maxPrice) && (
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
                    maxPrice ? 1 : 0
                  ].reduce((a, b) => a + b, 0)}
                </span>
              )}
            </div>
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
                background: sortOrder === 'asc' ? '#f0f4ff' : '#fff',
                color: sortOrder === 'asc' ? '#667eea' : '#374151',
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {filteredProducts.length > 0 ? (
              filteredProducts.map((product) => (
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
                    onClick={() => handleImageClick(product.image_128)}
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
                        <span style={{ color: '#6b7280' }}>条码：</span>
                        <span style={{ color: '#374151', fontWeight: 500 }}>{product.barcode || '-'}</span>
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
                        <span style={{ color: '#0369a1', fontWeight: 600, fontSize: '15px' }}>
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
                        <span style={{
                          color: (product.raytech_stock ?? 0) > 0 ? '#059669' : '#6b7280',
                          fontWeight: 600
                        }}>
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
                    </div>
                  </div>
                </div>
              </div>
            ))
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
              </h2>
              <button
                onClick={() => {
                  setShowSalesModal(false);
                  setSalesOrders([]);
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
                          {sale.order_name}
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
                          ${sale.total_amount?.toFixed(2) || '0.00'}
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
              </h2>
              <button
                onClick={() => {
                  setShowPurchaseModal(false);
                  setPurchaseOrders([]);
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
                          {purchase.order_name}
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
                          ${purchase.total_amount?.toFixed(2) || '0.00'}
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
    </>
  );
}

