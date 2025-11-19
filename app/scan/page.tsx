'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Scanner from '@/components/Scanner';

type Product = {
  id: number;
  name: string;
  barcode?: string;
  default_code?: string;
  qty_available?: number;
  free_qty?: number;
  list_price?: number;
  standard_price?: number;
  raytech_stock?: number;
  raytech_p3?: number;
  image_128?: string;
};

type HistoryItem = {
  id: number;
  date: string;
  qty_done: number;
  uom?: string;
  from?: string;
  to?: string;
  ref?: string;
  created_by?: string;
  updated_by?: string;
};

type SalesItem = {
  id: number;
  order_name: string;
  order_id: number;
  date: string;
  customer: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  product_id: number;
  type?: 'POS' | 'SO' | 'INV'; // 销售类型：POS、销售订单或发票
};

type PurchaseItem = {
  id: number;
  order_name: string;
  order_id: number;
  date: string;
  supplier: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  product_id: number;
  state: string;
};

export default function ScanPage() {
  // 从 localStorage 读取扫码工具显示状态，如果不存在则默认为 false（关闭）
  const getInitialScannerState = () => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('scan_show_scanner');
    return saved === 'true';
  };

  const [scanning, setScanning] = useState(true);
  const [showScanner, setShowScanner] = useState(getInitialScannerState); // 从 localStorage 读取初始状态
  const [code93Mode, setCode93Mode] = useState(false); // 兼容所有条码模式（false=兼容所有，true=Code 93专用）
  const [isLoading, setIsLoading] = useState(false);
  const [lastCode, setLastCode] = useState<string>('');
  const [product, setProduct] = useState<Product | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [counted, setCounted] = useState<string>(''); // 盘点数量
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPageSize] = useState(10);
  const [salesHistory, setSalesHistory] = useState<SalesItem[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesPage, setSalesPage] = useState(1);
  const [salesTotal, setSalesTotal] = useState(0);
  const [salesPageSize] = useState(10);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseItem[]>([]);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchasePage, setPurchasePage] = useState(1);
  const [purchaseTotal, setPurchaseTotal] = useState(0);
  const [purchasePageSize] = useState(10);
  const [activeTab, setActiveTab] = useState<'info' | 'sales' | 'history' | 'purchase'>('info'); // 标签页状态
  const [updating, setUpdating] = useState(false);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [highResImage, setHighResImage] = useState<string | null>(null);
  const updateLockRef = useRef(false);

  const fetchLockRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastFetchedCodeRef = useRef<string>('');

  // Toast通知函数
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    // 3秒后自动消失
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadHistory = useCallback(async (pid: number, page: number = 1) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/inventory?product_id=${pid}&page=${page}&page_size=${historyPageSize}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      setHistory(Array.isArray(data?.history) ? data.history : []);
      setHistoryTotal(data?.total || 0);
    } catch {
      setHistory([]);
      setHistoryTotal(0);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyPageSize]);

  const loadSalesHistory = useCallback(async (pid: number, page: number = 1) => {
    setSalesLoading(true);
    try {
      const res = await fetch(`/api/sales-history?product_id=${pid}&page=${page}&page_size=${salesPageSize}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      setSalesHistory(Array.isArray(data?.salesHistory) ? data.salesHistory : []);
      setSalesTotal(data?.total || 0);
    } catch {
      setSalesHistory([]);
      setSalesTotal(0);
    } finally {
      setSalesLoading(false);
    }
  }, [salesPageSize]);

  const loadPurchaseHistory = useCallback(async (pid: number, page: number = 1) => {
    setPurchaseLoading(true);
    try {
      const res = await fetch(`/api/purchase-history?product_id=${pid}&page=${page}&page_size=${purchasePageSize}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      setPurchaseHistory(Array.isArray(data?.purchases) ? data.purchases : []);
      setPurchaseTotal(data?.total || 0);
    } catch {
      setPurchaseHistory([]);
      setPurchaseTotal(0);
    } finally {
      setPurchaseLoading(false);
    }
  }, [purchasePageSize]);

  // 获取高分辨率图片
  const fetchHighResImage = useCallback(async () => {
    if (!product?.id || !lastCode) return;
    try {
      const res = await fetch(`/api/product?code=${encodeURIComponent(lastCode)}&high_res_image=true`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (data?.product?.image_1920) {
        setHighResImage(data.product.image_1920);
      }
      } catch (error) {
        // 获取高分辨率图片失败
      }
  }, [product?.id, lastCode]);

  const fetchByCode = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    if (fetchLockRef.current) return;
    if (lastFetchedCodeRef.current === trimmed) return;

    fetchLockRef.current = true;
    lastFetchedCodeRef.current = trimmed;
    setIsLoading(true);

    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch(`/api/product?code=${encodeURIComponent(trimmed)}`, {
        signal: ac.signal,
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok || data?.error) {
        throw new Error(data?.error || `HTTP ${res.status}: ${res.statusText}`);
      }
      
      setLastCode(trimmed);
      const p = data?.product || null;
      setProduct(p);
      
      if (!p) {
        showToast(`未找到条码 "${trimmed}" 对应的产品`, 'error');
        return;
      }
      
      // 默认把盘点数量填成当前库存（可手改）
      setCounted(
        typeof p?.qty_available === 'number' ? String(p.qty_available) : ''
      );
      if (p?.id) {
        loadHistory(p.id, historyPage);
        loadSalesHistory(p.id, salesPage);
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        showToast(`搜索失败: ${error.message}`, 'error');
      }
    } finally {
      setIsLoading(false);
      fetchLockRef.current = false;
    }
  }, [loadHistory, loadSalesHistory, salesPage, showToast]);

  const handleDetected = useCallback((code: string) => {
    if (!code) return;
    setScanning(false);
    setCodeInput(code);
    fetchByCode(code);
  }, [fetchByCode]);

  const handleRescan = useCallback(() => {
    setProduct(null);
    setLastCode('');
    setCodeInput('');
    setCounted('');
    setHistory([]);
    setSalesHistory([]);
    lastFetchedCodeRef.current = '';
    setScanning(true);
    // 重新扫码时，如果扫码工具已隐藏，则显示它并保存状态
    if (!showScanner) {
      setShowScanner(true);
      if (typeof window !== 'undefined') {
        localStorage.setItem('scan_show_scanner', 'true');
      }
    }
  }, [showScanner]);

  const toggleScanner = useCallback(() => {
    setShowScanner(prev => {
      const newState = !prev;
      // 保存状态到 localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('scan_show_scanner', String(newState));
      }
      return newState;
    });
    // 如果隐藏扫码工具，也暂停扫描状态
    if (showScanner) {
      setScanning(false);
    } else {
      // 显示扫码工具时，延迟一点再启动扫描，避免卡顿
      setTimeout(() => {
        setScanning(true);
      }, 300);
    }
  }, [showScanner]);

  const handleSalesPageChange = useCallback((page: number) => {
    setSalesPage(page);
    if (product?.id) {
      loadSalesHistory(product.id, page);
    }
  }, [product?.id, loadSalesHistory]);

  // 当切换到销售标签页时，加载数据
  useEffect(() => {
    if (activeTab === 'sales' && product?.id) {
      loadSalesHistory(product.id, salesPage);
    }
  }, [activeTab, product?.id, salesPage, loadSalesHistory]);

  const handleHistoryPageChange = useCallback((page: number) => {
    setHistoryPage(page);
    if (product?.id) {
      loadHistory(product.id, page);
    }
  }, [product?.id, loadHistory]);

  // 当切换到库存变动标签页时，加载数据
  useEffect(() => {
    if (activeTab === 'history' && product?.id) {
      loadHistory(product.id, historyPage);
    }
  }, [activeTab, product?.id, historyPage, loadHistory]);

  const handlePurchasePageChange = useCallback((page: number) => {
    setPurchasePage(page);
    if (product?.id) {
      loadPurchaseHistory(product.id, page);
    }
  }, [product?.id, loadPurchaseHistory]);

  // 当切换到采购标签页时，加载数据
  useEffect(() => {
    if (activeTab === 'purchase' && product?.id) {
      loadPurchaseHistory(product.id, purchasePage);
    }
  }, [activeTab, product?.id, purchasePage, loadPurchaseHistory]);

  const testPosSales = useCallback(async () => {
    if (!product?.id) {
      console.log('没有产品ID，当前产品:', product);
      showToast('请先扫码选择一个产品', 'error');
      return;
    }
    
    console.log('开始测试POS销售，产品ID:', product.id);
    try {
      const url = `/api/test-pos-sales?product_id=${product.id}`;
      console.log('请求URL:', url);
      
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      console.log('POS销售测试结果:', data);
      
      // 显示测试结果摘要
      if (data.summary) {
        const summary = data.summary;
        const message = `POS测试完成: 总POS订单${summary.totalPosOrders}个, 总POS行${summary.totalPosLines}个, 该产品POS行${summary.productPosLines}个`;
        showToast(message, 'info');
      } else {
        showToast(`POS测试完成，查看控制台`, 'info');
      }
    } catch (error) {
      console.error('POS测试失败:', error);
      showToast('POS测试失败', 'error');
    }
  }, [product?.id, showToast]);

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    window.location.href = '/';
  }, []);

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const val = codeInput.trim();
    if (!val) return;
    setScanning(false);
    fetchByCode(val);
  }, [codeInput, fetchByCode]);

  const handleClear = useCallback(() => {
    setProduct(null);
    setLastCode('');
    setCodeInput('');
    setCounted('');
    setHistory([]);
    lastFetchedCodeRef.current = '';
    setScanning(true);
  }, []);


  // 提交盘点：把产品在当前库位的数量调整到 counted
  const handleUpdateInventory = useCallback(async () => {
    if (!product?.id) return;
    const qty = Number(counted);
    if (Number.isNaN(qty)) {
      showToast('请输入正确的数量', 'error');
      return;
    }
    if (updateLockRef.current) return; // 防止重复提交
    updateLockRef.current = true;
    setUpdating(true);
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ product_id: product.id, new_qty: qty }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || '更新失败');
      }
      
      // 成功后：优化更新策略
      // 直接更新本地状态，减少API调用
      if (product) {
        const updatedProduct = { ...product, qty_available: qty };
        setProduct(updatedProduct);
        setCounted(String(qty));
      }
      
      // 异步重新加载历史记录（不阻塞UI）
      if (product.id) {
        loadHistory(product.id, historyPage).catch(e => {
          // 刷新历史记录失败
        });
      }
      showToast('库存已更新（Odoo 中已记录库存调整历史）', 'success');
    } catch (e: any) {
      showToast(e?.message || '库存更新失败', 'error');
    } finally {
      setUpdating(false);
      updateLockRef.current = false; // 重置锁
    }
  }, [product?.id, counted, lastCode, loadHistory]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .card-fade-in {
          animation: fadeIn 0.3s ease-out;
        }
        @media (max-width: 768px) {
          .top-bar-buttons {
            flex-wrap: wrap;
            gap: 6px !important;
          }
          .top-bar-button {
            padding: 6px 10px !important;
            font-size: 12px !important;
          }
          .camera-container {
            height: 50vh !important;
          }
          .camera-container.paused {
            height: 12vh !important;
          }
          /* 产品信息卡片手机端优化 */
          .product-card {
            padding: 16px !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
          }
          .product-card > * {
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
          }
          .product-name {
            font-size: 16px !important;
            word-break: break-word !important;
            line-height: 1.4 !important;
            max-width: 100% !important;
            min-width: 0 !important;
            overflow-wrap: break-word !important;
          }
          .product-info-row {
            flex-direction: column !important;
            gap: 8px !important;
            font-size: 12px !important;
          }
          .product-info-row span {
            display: block;
            margin: 4px 0;
          }
          .inventory-info {
            padding: 10px !important;
            font-size: 13px !important;
          }
          .inventory-info strong {
            font-size: 16px !important;
          }
          .count-input-container {
            flex-direction: column !important;
            gap: 12px !important;
          }
          .count-input-wrapper {
            display: flex !important;
            width: 100% !important;
          }
          .count-buttons {
            display: flex !important;
            gap: 8px !important;
            width: 100% !important;
          }
          .count-buttons button {
            flex: 1 !important;
          }
          .action-buttons {
            flex-direction: column !important;
            gap: 10px !important;
          }
          .action-buttons button {
            width: 100% !important;
          }
        }
        @media (max-width: 480px) {
          .top-bar-title {
            font-size: 16px !important;
          }
          .camera-container {
            height: 45vh !important;
          }
          .camera-container.paused {
            height: 10vh !important;
          }
          /* 更小屏幕的进一步优化 */
          .product-card {
            padding: 12px !important;
            border-radius: 12px !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            overflow: hidden !important;
          }
          .product-name {
            font-size: 15px !important;
            margin-bottom: 6px !important;
            max-width: 100% !important;
            min-width: 0 !important;
            word-break: break-word !important;
            overflow-wrap: break-word !important;
          }
          .product-info-row {
            font-size: 11px !important;
          }
          .inventory-info {
            padding: 8px !important;
            font-size: 12px !important;
          }
          .inventory-info strong {
            font-size: 15px !important;
          }
          .sales-tabs {
            flex-wrap: wrap !important;
            gap: 6px !important;
          }
          .sales-tabs button {
            flex: 1 1 calc(50% - 3px) !important;
            min-width: calc(50% - 3px) !important;
            font-size: 11px !important;
            padding: 5px 8px !important;
          }
          /* 标签页手机端优化 */
          .product-card > div > div:first-child {
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch !important;
          }
          .product-card > div > div:first-child button {
            font-size: 12px !important;
            padding: 8px 12px !important;
            white-space: nowrap !important;
          }
          .history-item {
            padding: 8px !important;
            font-size: 12px !important;
          }
          /* Scanner工具条手机端优化 - 统一按钮大小 */
          .camera-container label,
          .camera-container button {
            min-width: calc(50% - 3px) !important;
            flex: 1 1 calc(50% - 3px) !important;
            font-size: 12px !important;
            padding: 8px 12px !important;
            box-sizing: border-box !important;
          }
          .camera-container > div > div:first-child {
            padding: 6px !important;
            gap: 6px !important;
          }
        }
        @media (hover: none) and (pointer: coarse) {
          button {
            min-height: 44px;
          }
          input {
            min-height: 44px;
            font-size: 16px !important;
          }
        }
      `}} />
      <div
        className="scan-page-container"
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
          paddingBottom: 'calc(92px + env(safe-area-inset-bottom))',
        }}
      >
        {/* 顶部栏 */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          }}
        >
          <div className="top-bar-title" style={{ fontWeight: 700, fontSize: '18px', color: '#111827' }}>
            库存扫码
          </div>
          <div className="top-bar-buttons" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="top-bar-button"
              onClick={handleRescan}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid #059669',
                background: '#fff',
                color: '#059669',
                fontWeight: 500,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#10b981';
                e.currentTarget.style.color = '#10b981';
                e.currentTarget.style.background = '#f0fdf4';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#059669';
                e.currentTarget.style.color = '#059669';
                e.currentTarget.style.background = '#fff';
              }}
            >
              🔄 重新扫码
            </button>
            <label
              className="top-bar-button"
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid #e5e7eb',
                background: '#fff',
                color: '#374151',
                fontWeight: 500,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#667eea';
                e.currentTarget.style.color = '#667eea';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.color = '#374151';
              }}
            >
              📷 从相册选择
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  
                  try {
                    // 使用 Scanner 组件的识别逻辑
                    const { BrowserMultiFormatReader } = await import('@zxing/browser');
                    const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');
                    
                    const hints = new Map();
                    hints.set(DecodeHintType.TRY_HARDER, true);
                    
                    if (code93Mode) {
                      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_93]);
                    } else {
                      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
                        BarcodeFormat.CODE_93,
                        BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODABAR,
                        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
                        BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX, BarcodeFormat.PDF_417, BarcodeFormat.AZTEC,
                        BarcodeFormat.ITF, BarcodeFormat.RSS_14, BarcodeFormat.RSS_EXPANDED
                      ]);
                    }
                    
                    const reader = new BrowserMultiFormatReader(hints as any);
                    const url = URL.createObjectURL(file);
                    const img = new Image();
                    img.src = url;
                    
                    await new Promise((resolve, reject) => {
                      img.onload = resolve;
                      img.onerror = reject;
                    });
                    
                    let result: any;
                    try {
                      result = await (reader as any).decodeFromImage(img);
                    } catch {
                      result = await (reader as any).decodeFromImageElement?.(img);
                    }
                    
                    URL.revokeObjectURL(url);
                    let code = result?.getText ? result.getText() : (result?.text || '');
                    
                    // 尝试原生检测器
                    if (!code && typeof (globalThis as any).BarcodeDetector === 'function') {
                      const Detector = (globalThis as any).BarcodeDetector;
                      const fmts = await Detector.getSupportedFormats?.() || [];
                      const formats = code93Mode
                        ? ['code_93'].filter(f => fmts.includes(f))
                        : [
                            'code_93', 'code_128', 'code_39', 'codabar', 'code_11',
                            'ean_13', 'ean_8', 'upc_a', 'upc_e', 'upc_ean_extension',
                            'qr_code', 'data_matrix', 'pdf417', 'aztec',
                            'itf', 'rss_14', 'rss_expanded'
                          ].filter(f => fmts.includes(f));
                      
                      if (formats.length > 0) {
                        const bmp = await createImageBitmap(file);
                        const res = await new Detector({ formats }).detect(bmp as any);
                        const detectedCode = res?.[0]?.rawValue ? String(res[0].rawValue) : '';
                        if (detectedCode) {
                          code = detectedCode;
                        }
                      }
                    }
                    
                    if (code) {
                      fetchByCode(code);
                    } else {
                      alert('未识别到条码，请选择更清晰的照片重试。');
                    }
                  } catch (error: any) {
                    alert('图片识别失败：' + (error?.message || String(error)));
                  } finally {
                    e.target.value = '';
                  }
                }}
              />
            </label>
            <button
              className="top-bar-button"
              onClick={() => {
                setCode93Mode(!code93Mode);
              }}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid #e5e7eb',
                background: code93Mode ? '#10b981' : '#fff',
                color: code93Mode ? '#fff' : '#374151',
                fontWeight: code93Mode ? 600 : 500,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (!code93Mode) {
                  e.currentTarget.style.borderColor = '#10b981';
                  e.currentTarget.style.color = '#10b981';
                }
              }}
              onMouseLeave={(e) => {
                if (!code93Mode) {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.color = '#374151';
                }
              }}
            >
              {code93Mode ? 'Code 93专用' : '兼容所有条码'}
            </button>
            <button
              className="top-bar-button"
              onClick={toggleScanner}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid #e5e7eb',
                background: '#fff',
                color: '#374151',
                fontWeight: 500,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#667eea';
                e.currentTarget.style.color = '#667eea';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.color = '#374151';
              }}
            >
              {showScanner ? '👁️ 隐藏相机' : '👁️‍🗨️ 显示相机'}
            </button>
          </div>
        </div>

      {/* 摄像头区域 */}
      <div style={{ padding: '16px', width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
        {!showScanner ? (
          <div
            style={{
              position: 'relative',
              overflow: 'hidden',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              height: '120px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
              border: '2px solid #667eea',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
            onClick={toggleScanner}
          >
            <div style={{ fontSize: '32px', marginBottom: 8 }}>📷</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
              点击启动扫码工具
            </div>
            <div style={{ fontSize: 12, opacity: 0.9, textAlign: 'center' }}>
              隐藏状态可提升页面性能<br/>
              <span style={{ fontSize: 11, opacity: 0.8, marginTop: 4, display: 'block' }}>
                您仍可通过底部输入框手动输入条码查询
              </span>
            </div>
          </div>
        ) : (
          <div
            className={`camera-container ${!scanning ? 'paused' : ''}`}
            style={{
              position: 'relative',
              overflow: 'hidden',
              borderRadius: '16px',
              background: '#000',
              height: scanning ? '56vh' : '14vh',
              transition: 'height 0.3s ease-in-out',
              boxShadow: scanning ? '0 8px 24px rgba(0, 0, 0, 0.15)' : '0 2px 8px rgba(0, 0, 0, 0.1)',
              border: scanning ? '2px solid #059669' : '2px solid #e5e7eb',
            }}
          >
            {scanning ? (
              <Scanner 
                onDetected={handleDetected} 
                code93Mode={code93Mode}
                onCode93ModeChange={setCode93Mode}
              />
            ) : (
              <div
                style={{
                  color: '#9ca3af',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  gap: '8px',
                }}
              >
                <div style={{ fontSize: '24px' }}>📷</div>
                <div>摄像头已暂停</div>
              </div>
            )}
          </div>
        )}

        {/* 重新扫码按钮 - 在扫码窗口下方 */}
        {showScanner && lastCode && (
          <div style={{
            marginTop: 12,
            textAlign: 'center',
          }}>
            <button
              onClick={handleRescan}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: '1px solid #059669',
                background: '#fff',
                color: '#059669',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#10b981';
                e.currentTarget.style.color = '#10b981';
                e.currentTarget.style.background = '#f0fdf4';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#059669';
                e.currentTarget.style.color = '#059669';
                e.currentTarget.style.background = '#fff';
              }}
            >
              🔄 重新扫码
            </button>
          </div>
        )}

        {/* 最近条码 */}
        {lastCode ? (
          <div
            className="card-fade-in"
            style={{
              marginTop: 16,
              padding: '14px 16px',
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              fontSize: 14,
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#6b7280' }}>最近条码：</span>
              <strong style={{ color: '#111827', fontSize: '15px' }}>{lastCode}</strong>
              {isLoading ? (
                <span style={{ marginLeft: 8, color: '#667eea', fontSize: '12px' }}>
                  <span style={{ display: 'inline-block', animation: 'pulse 1.5s ease-in-out infinite' }}>查询中…</span>
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* 结果 + 盘点输入 */}
        <div style={{ marginTop: 16, display: 'grid', gap: 16, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          {product ? (
            <div
              className="card-fade-in product-card"
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '16px',
                padding: '20px',
                lineHeight: 1.6,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                boxSizing: 'border-box',
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
                overflow: 'hidden',
              }}
            >
              <div className="product-name" style={{ 
                fontWeight: 700, 
                fontSize: '18px', 
                marginBottom: 0, 
                color: '#111827', 
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
                maxWidth: '100%',
                minWidth: 0,
                width: '100%',
                boxSizing: 'border-box',
              }}>
                {product.name}
              </div>

              {/* 标签页导航 */}
              <div style={{ 
                marginTop: 20, 
                borderTop: '1px solid #e5e7eb', 
                paddingTop: 16,
                maxWidth: '100%',
                boxSizing: 'border-box',
              }}>
                <div style={{
                  display: 'flex',
                  gap: 8,
                  borderBottom: '2px solid #f3f4f6',
                  marginBottom: 16,
                  overflowX: 'auto',
                  WebkitOverflowScrolling: 'touch',
                }}>
                  {[
                    { key: 'info', label: '📦 产品信息', icon: '📦' },
                    { key: 'sales', label: '💰 销售记录', icon: '💰' },
                    { key: 'history', label: '📊 库存变动', icon: '📊' },
                    { key: 'purchase', label: '🛒 采买记录', icon: '🛒' },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key as any)}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '8px 8px 0 0',
                        border: 'none',
                        background: 'transparent',
                        color: activeTab === tab.key ? '#667eea' : '#6b7280',
                        fontSize: 14,
                        fontWeight: activeTab === tab.key ? 600 : 500,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        position: 'relative',
                        whiteSpace: 'nowrap',
                        borderBottom: activeTab === tab.key ? '2px solid #667eea' : '2px solid transparent',
                        marginBottom: activeTab === tab.key ? '-2px' : '0',
                      }}
                      onMouseEnter={(e) => {
                        if (activeTab !== tab.key) {
                          e.currentTarget.style.color = '#374151';
                          e.currentTarget.style.background = '#f9fafb';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (activeTab !== tab.key) {
                          e.currentTarget.style.color = '#6b7280';
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* 标签页内容 */}
                <div style={{ minHeight: '200px', maxHeight: '500px', overflowY: 'auto' }}>
                  {/* 产品信息标签页 */}
                  {activeTab === 'info' && (
                    <div>
                      {/* 产品图片 */}
                      {product && product.image_128 && (
                        <div
                          style={{
                            marginBottom: 20,
                            textAlign: 'center',
                          }}
                        >
                          <img
                            src={`data:image/png;base64,${product.image_128}`}
                            alt={product.name}
                            loading="lazy"
                            style={{
                              maxWidth: '100%',
                              maxHeight: '200px',
                              borderRadius: 8,
                              border: '1px solid #e5e7eb',
                              objectFit: 'contain',
                              backgroundColor: '#f9fafb',
                              cursor: 'pointer',
                            }}
                            onClick={() => {
                              setShowImageModal(true);
                              if (!highResImage) {
                                fetchHighResImage();
                              }
                            }}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
                            点击查看大图
                          </div>
                        </div>
                      )}

                      {/* 产品基本信息 */}
                      <div style={{ 
                        marginBottom: 20, 
                        padding: '16px', 
                        background: '#f9fafb', 
                        borderRadius: '12px',
                        border: '1px solid #e5e7eb',
                      }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
                          产品信息
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13 }}>
                            <div style={{ flex: '1 1 auto', minWidth: '120px' }}>
                              <span style={{ color: '#6b7280' }}>条码：</span>
                              <span style={{ color: '#374151', fontWeight: 500 }}>{product.barcode || '-'}</span>
                            </div>
                            <div style={{ flex: '1 1 auto', minWidth: '120px' }}>
                              <span style={{ color: '#6b7280' }}>编码：</span>
                              <span style={{ color: '#374151', fontWeight: 500 }}>{product.default_code || '-'}</span>
                            </div>
                          </div>
                          <div style={{ 
                            padding: '12px', 
                            background: '#f0f9ff', 
                            borderRadius: '8px',
                            border: '1px solid #bae6fd',
                          }}>
                            <div style={{ fontSize: 14, marginBottom: 6 }}>
                              <span style={{ color: '#6b7280' }}>现有库存：</span>
                              <strong style={{ color: '#0369a1', fontSize: '18px' }}>{product.qty_available ?? '-'}</strong>
                              {typeof product.free_qty === 'number' ? (
                                <span style={{ marginLeft: 12, color: '#6b7280', fontSize: '13px' }}>
                                  可用：<span style={{ color: '#059669' }}>{product.free_qty}</span>
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 价格信息 */}
                      <div style={{ 
                        marginBottom: 20, 
                        padding: '16px', 
                        background: '#f9fafb', 
                        borderRadius: '12px',
                        border: '1px solid #e5e7eb',
                      }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
                          价格信息
                        </div>
                        <div style={{ fontSize: 13, display: 'flex', flexWrap: 'wrap', gap: '16px', wordBreak: 'break-word' }}>
                          <span style={{ color: '#6b7280' }}>
                            门店零售价：<span style={{ color: '#059669', fontWeight: 600 }}>
                              {typeof product.list_price === 'number' ? `$${product.list_price.toFixed(2)}` : '-'}
                            </span>
                          </span>
                          {typeof product.standard_price === 'number' ? (
                            <span style={{ color: '#6b7280' }}>
                              成本：<span style={{ color: '#dc2626', fontWeight: 600 }}>${product.standard_price.toFixed(2)}</span>
                            </span>
                          ) : null}
                        </div>
                        {/* 只在自定义字段存在时显示 */}
                        {(product.raytech_p3 !== null && product.raytech_p3 !== undefined) || 
                         (product.raytech_stock !== null && product.raytech_stock !== undefined) ? (
                          <div style={{ marginTop: 12, fontSize: 13, display: 'flex', flexWrap: 'wrap', gap: '16px', wordBreak: 'break-word' }}>
                            {typeof product.raytech_p3 === 'number' ? (
                              <span style={{ color: '#6b7280' }}>
                                总部零售价：<span style={{ color: '#059669', fontWeight: 600 }}>${product.raytech_p3.toFixed(2)}</span>
                              </span>
                            ) : null}
                            {typeof product.raytech_stock === 'number' ? (
                              <span style={{ color: '#6b7280' }}>
                                总部库存：<span style={{ 
                                  color: product.raytech_stock > 0 ? '#059669' : '#dc2626', 
                                  fontWeight: 600 
                                }}>
                                  {product.raytech_stock > 0 ? '有货' : '无货'}
                                </span>
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                    </div>
                  )}

                  {/* 销售记录标签页 */}
                  {activeTab === 'sales' && (
                    <div>
                      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
                        所有销售历史记录
                      </div>
                      {salesLoading ? (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                          <div style={{ fontSize: 14 }}>加载中...</div>
                        </div>
                      ) : salesHistory.length > 0 ? (
                        <>
                          <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: 16 }}>
                            {salesHistory.map((sale) => (
                              <div
                                key={sale.id}
                                style={{
                                  padding: '12px',
                                  borderBottom: '1px solid #f3f4f6',
                                  fontSize: 13,
                                  borderRadius: 8,
                                  marginBottom: 8,
                                  background: '#f9fafb',
                                  transition: 'all 0.2s ease',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#f3f4f6';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#f9fafb';
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
                                  <span style={{ fontWeight: 600, color: '#374151', fontSize: 14 }}>
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
                                  <span style={{ color: '#059669', fontWeight: 700, fontSize: 15 }}>
                                    ${sale.total_amount.toFixed(2)}
                                  </span>
                                </div>
                                <div style={{ color: '#6b7280', marginBottom: 4, fontSize: 12 }}>
                                  客户: {sale.customer}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280', fontSize: 12 }}>
                                  <span>{sale.date}</span>
                                  <span>{sale.quantity} × ${sale.unit_price.toFixed(2)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          {/* 分页控件 */}
                          {Math.ceil(salesTotal / salesPageSize) > 1 && (
                            <div style={{
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              gap: 8,
                              padding: '12px 0',
                              borderTop: '1px solid #e5e7eb',
                            }}>
                              <button
                                onClick={() => handleSalesPageChange(salesPage - 1)}
                                disabled={salesPage <= 1}
                                style={{
                                  padding: '8px 12px',
                                  borderRadius: 6,
                                  border: '1px solid #d1d5db',
                                  background: salesPage <= 1 ? '#f3f4f6' : '#fff',
                                  color: salesPage <= 1 ? '#9ca3af' : '#374151',
                                  fontSize: 12,
                                  fontWeight: 500,
                                  cursor: salesPage <= 1 ? 'not-allowed' : 'pointer',
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                上一页
                              </button>
                              <div style={{
                                fontSize: 12,
                                color: '#6b7280',
                                padding: '0 12px',
                              }}>
                                第 {salesPage} / {Math.ceil(salesTotal / salesPageSize)} 页
                                <span style={{ marginLeft: 8, color: '#9ca3af' }}>
                                  (共 {salesTotal} 条)
                                </span>
                              </div>
                              <button
                                onClick={() => handleSalesPageChange(salesPage + 1)}
                                disabled={salesPage >= Math.ceil(salesTotal / salesPageSize)}
                                style={{
                                  padding: '8px 12px',
                                  borderRadius: 6,
                                  border: '1px solid #d1d5db',
                                  background: salesPage >= Math.ceil(salesTotal / salesPageSize) ? '#f3f4f6' : '#fff',
                                  color: salesPage >= Math.ceil(salesTotal / salesPageSize) ? '#9ca3af' : '#374151',
                                  fontSize: 12,
                                  fontWeight: 500,
                                  cursor: salesPage >= Math.ceil(salesTotal / salesPageSize) ? 'not-allowed' : 'pointer',
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                下一页
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>💰</div>
                          <div style={{ fontSize: 14 }}>暂无销售记录</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 库存变动记录标签页 */}
                  {activeTab === 'history' && (
                    <div>
                      {/* 盘点输入区 */}
                      <div className="count-input-container" style={{ marginTop: 0, marginBottom: 20, maxWidth: '100%', boxSizing: 'border-box' }}>
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>盘点数量（调整为）：</label>
                        </div>
                        <div className="count-input-wrapper" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, width: '100%', maxWidth: '100%' }}>
                          <button
                            onClick={() => {
                              const current = Number(counted) || 0;
                              setCounted(String(current - 1));
                            }}
                            style={{
                              width: 44,
                              minWidth: 44,
                              height: 44,
                              borderRadius: 12,
                              border: '2px solid #e5e7eb',
                              background: '#fff',
                              color: '#374151',
                              fontSize: 20,
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              flexShrink: 0,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = '#667eea';
                              e.currentTarget.style.color = '#667eea';
                              e.currentTarget.style.background = '#f0f4ff';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = '#e5e7eb';
                              e.currentTarget.style.color = '#374151';
                              e.currentTarget.style.background = '#fff';
                            }}
                            title="减少1"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={counted}
                            onChange={(e) => setCounted(e.target.value)}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              padding: '12px 16px',
                              borderRadius: 12,
                              border: '2px solid #e5e7eb',
                              outline: 'none',
                              fontSize: 18,
                              fontWeight: 600,
                              textAlign: 'center',
                              background: '#f9fafb',
                              transition: 'all 0.2s ease',
                              maxWidth: '100%',
                              boxSizing: 'border-box',
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = '#667eea';
                              e.currentTarget.style.background = '#fff';
                              e.currentTarget.style.boxShadow = '0 0 0 4px rgba(102, 126, 234, 0.1)';
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = '#e5e7eb';
                              e.currentTarget.style.background = '#f9fafb';
                              e.currentTarget.style.boxShadow = 'none';
                            }}
                          />
                          <button
                            onClick={() => {
                              const current = Number(counted) || 0;
                              setCounted(String(current + 1));
                            }}
                            style={{
                              width: 44,
                              minWidth: 44,
                              height: 44,
                              borderRadius: 12,
                              border: '2px solid #e5e7eb',
                              background: '#fff',
                              color: '#374151',
                              fontSize: 20,
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              flexShrink: 0,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = '#667eea';
                              e.currentTarget.style.color = '#667eea';
                              e.currentTarget.style.background = '#f0f4ff';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = '#e5e7eb';
                              e.currentTarget.style.color = '#374151';
                              e.currentTarget.style.background = '#fff';
                            }}
                            title="增加1"
                          >
                            +
                          </button>
                        </div>
                        <div className="action-buttons" style={{ display: 'flex', gap: 10, width: '100%', maxWidth: '100%' }}>
                          <button
                            onClick={handleUpdateInventory}
                            disabled={updating}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              padding: '14px 16px',
                              borderRadius: 12,
                              border: 'none',
                              background: updating ? '#9ca3af' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                              color: '#fff',
                              fontWeight: 600,
                              fontSize: 15,
                              cursor: updating ? 'not-allowed' : 'pointer',
                              transition: 'all 0.2s ease',
                              boxShadow: updating ? 'none' : '0 4px 12px rgba(102, 126, 234, 0.3)',
                            }}
                            onMouseEnter={(e) => {
                              if (!updating) {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.4)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!updating) {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)';
                              }
                            }}
                          >
                            {updating ? '更新中…' : '💾 更新库存'}
                          </button>
                        </div>
                      </div>

                      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
                        所有库存变动记录
                      </div>
                      {historyLoading ? (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                          <div style={{ fontSize: 14 }}>加载中...</div>
                        </div>
                      ) : history.length > 0 ? (
                        <>
                          <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: 16 }}>
                            {history.map((h) => (
                              <div
                                key={h.id}
                                className="history-item"
                                style={{
                                  border: '1px solid #e5e7eb',
                                  borderRadius: 10,
                                  padding: 12,
                                  fontSize: 13,
                                  lineHeight: 1.6,
                                  wordBreak: 'break-word',
                                  maxWidth: '100%',
                                  boxSizing: 'border-box',
                                  background: '#f9fafb',
                                  transition: 'all 0.2s ease',
                                  marginBottom: 10,
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
                                <div style={{ marginBottom: 6 }}>
                                  <strong style={{ color: '#667eea', fontSize: 15 }}>{h.qty_done}</strong>
                                  <span style={{ color: '#6b7280', marginLeft: 4 }}>{h.uom || ''}</span>
                                </div>
                                <div style={{ color: '#6b7280', marginBottom: 4, wordBreak: 'break-word' }}>
                                  <span style={{ color: '#374151' }}>{h.from || '-'}</span>
                                  <span style={{ margin: '0 8px', color: '#9ca3af' }}>→</span>
                                  <span style={{ color: '#374151' }}>{h.to || '-'}</span>
                                </div>
                                <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 4, wordBreak: 'break-word' }}>
                                  {new Date(h.date).toLocaleString('zh-CN')} | {h.created_by || h.updated_by || '系统'}
                                </div>
                                {h.ref && (
                                  <div style={{ color: '#667eea', fontSize: 12, wordBreak: 'break-word' }}>
                                    📎 Ref: {h.ref}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          
                          {/* 分页控件 */}
                          {Math.ceil(historyTotal / historyPageSize) > 1 && (
                            <div style={{
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              gap: 8,
                              padding: '12px 0',
                              borderTop: '1px solid #e5e7eb',
                            }}>
                              <button
                                onClick={() => handleHistoryPageChange(historyPage - 1)}
                                disabled={historyPage <= 1}
                                style={{
                                  padding: '8px 12px',
                                  borderRadius: 6,
                                  border: '1px solid #d1d5db',
                                  background: historyPage <= 1 ? '#f3f4f6' : '#fff',
                                  color: historyPage <= 1 ? '#9ca3af' : '#374151',
                                  fontSize: 12,
                                  fontWeight: 500,
                                  cursor: historyPage <= 1 ? 'not-allowed' : 'pointer',
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                上一页
                              </button>
                              <div style={{
                                fontSize: 12,
                                color: '#6b7280',
                                padding: '0 12px',
                              }}>
                                第 {historyPage} / {Math.ceil(historyTotal / historyPageSize)} 页
                                <span style={{ marginLeft: 8, color: '#9ca3af' }}>
                                  (共 {historyTotal} 条)
                                </span>
                              </div>
                              <button
                                onClick={() => handleHistoryPageChange(historyPage + 1)}
                                disabled={historyPage >= Math.ceil(historyTotal / historyPageSize)}
                                style={{
                                  padding: '8px 12px',
                                  borderRadius: 6,
                                  border: '1px solid #d1d5db',
                                  background: historyPage >= Math.ceil(historyTotal / historyPageSize) ? '#f3f4f6' : '#fff',
                                  color: historyPage >= Math.ceil(historyTotal / historyPageSize) ? '#9ca3af' : '#374151',
                                  fontSize: 12,
                                  fontWeight: 500,
                                  cursor: historyPage >= Math.ceil(historyTotal / historyPageSize) ? 'not-allowed' : 'pointer',
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                下一页
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>📊</div>
                          <div style={{ fontSize: 14 }}>暂无库存变动记录</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 采买记录标签页 */}
                  {activeTab === 'purchase' && (
                    <div>
                      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
                        所有采购历史记录
                      </div>
                      {purchaseLoading ? (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                          <div style={{ fontSize: 14 }}>加载中...</div>
                        </div>
                      ) : purchaseHistory.length > 0 ? (
                        <>
                          <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: 16 }}>
                            {purchaseHistory.map((purchase) => (
                              <div
                                key={purchase.id}
                                style={{
                                  padding: '12px',
                                  borderBottom: '1px solid #f3f4f6',
                                  fontSize: 13,
                                  borderRadius: 8,
                                  marginBottom: 8,
                                  background: '#f9fafb',
                                  transition: 'all 0.2s ease',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#f3f4f6';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#f9fafb';
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
                                  <span style={{ fontWeight: 600, color: '#374151', fontSize: 14 }}>
                                    {purchase.order_name}
                                    <span style={{ 
                                      fontSize: 10, 
                                      color: purchase.state === 'purchase' ? '#059669' : purchase.state === 'done' ? '#3b82f6' : '#6b7280',
                                      marginLeft: 6,
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      backgroundColor: purchase.state === 'purchase' ? '#d1fae5' : purchase.state === 'done' ? '#dbeafe' : '#f3f4f6'
                                    }}>
                                      {purchase.state === 'purchase' ? '已确认' : purchase.state === 'done' ? '已完成' : purchase.state === 'draft' ? '草稿' : purchase.state}
                                    </span>
                                  </span>
                                  <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 15 }}>
                                    ${purchase.total_amount.toFixed(2)}
                                  </span>
                                </div>
                                <div style={{ color: '#6b7280', marginBottom: 4, fontSize: 12 }}>
                                  供应商: {purchase.supplier}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280', fontSize: 12 }}>
                                  <span>{new Date(purchase.date).toLocaleDateString('zh-CN')}</span>
                                  <span>{purchase.quantity} × ${purchase.unit_price.toFixed(2)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          {/* 分页控件 */}
                          {Math.ceil(purchaseTotal / purchasePageSize) > 1 && (
                            <div style={{
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              gap: 8,
                              padding: '12px 0',
                              borderTop: '1px solid #e5e7eb',
                            }}>
                              <button
                                onClick={() => handlePurchasePageChange(purchasePage - 1)}
                                disabled={purchasePage <= 1}
                                style={{
                                  padding: '8px 12px',
                                  borderRadius: 6,
                                  border: '1px solid #d1d5db',
                                  background: purchasePage <= 1 ? '#f3f4f6' : '#fff',
                                  color: purchasePage <= 1 ? '#9ca3af' : '#374151',
                                  fontSize: 12,
                                  fontWeight: 500,
                                  cursor: purchasePage <= 1 ? 'not-allowed' : 'pointer',
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                上一页
                              </button>
                              <div style={{
                                fontSize: 12,
                                color: '#6b7280',
                                padding: '0 12px',
                              }}>
                                第 {purchasePage} / {Math.ceil(purchaseTotal / purchasePageSize)} 页
                                <span style={{ marginLeft: 8, color: '#9ca3af' }}>
                                  (共 {purchaseTotal} 条)
                                </span>
                              </div>
                              <button
                                onClick={() => handlePurchasePageChange(purchasePage + 1)}
                                disabled={purchasePage >= Math.ceil(purchaseTotal / purchasePageSize)}
                                style={{
                                  padding: '8px 12px',
                                  borderRadius: 6,
                                  border: '1px solid #d1d5db',
                                  background: purchasePage >= Math.ceil(purchaseTotal / purchasePageSize) ? '#f3f4f6' : '#fff',
                                  color: purchasePage >= Math.ceil(purchaseTotal / purchasePageSize) ? '#9ca3af' : '#374151',
                                  fontSize: 12,
                                  fontWeight: 500,
                                  cursor: purchasePage >= Math.ceil(purchaseTotal / purchasePageSize) ? 'not-allowed' : 'pointer',
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                下一页
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>🛒</div>
                          <div style={{ fontSize: 14 }}>暂无采购记录</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : lastCode && !isLoading ? (
            <div
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 14,
                fontSize: 14,
              }}
            >
              <div style={{ marginBottom: 8 }}>未找到产品（条码：{lastCode}）</div>
              <button
                onClick={handleRescan}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  background: '#fff',
                  color: '#374151',
                  fontWeight: 600,
                }}
              >
                🔄 重新扫码
              </button>
            </div>
          ) : null}


        </div>
      </div>

      {/* 底部固定输入条（手动输入条码） */}
      <form
        onSubmit={handleSubmit}
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 20,
          background: 'rgba(255, 255, 255, 0.98)',
          backdropFilter: 'blur(10px)',
          borderTop: '1px solid #e5e7eb',
          padding: '12px 16px calc(12px + env(safe-area-inset-bottom))',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.05)',
          maxWidth: '100%',
          boxSizing: 'border-box',
        }}
      >
        <input
          inputMode="search"
          placeholder="手动输入/粘贴条码"
          value={codeInput}
          onChange={(e) => {
            let value = e.target.value;
            // 自动将首字母大写
            if (value.length > 0) {
              value = value.charAt(0).toUpperCase() + value.slice(1);
            }
            setCodeInput(value);
          }}
          style={{
            flex: 1,
            minWidth: 0,
            padding: '14px 16px',
            borderRadius: 12,
            border: '2px solid #e5e7eb',
            outline: 'none',
            fontSize: 16,
            background: '#f9fafb',
            transition: 'all 0.2s ease',
            maxWidth: '100%',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#667eea';
            e.currentTarget.style.background = '#fff';
            e.currentTarget.style.boxShadow = '0 0 0 4px rgba(102, 126, 234, 0.1)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#e5e7eb';
            e.currentTarget.style.background = '#f9fafb';
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
        <button
          type="submit"
          style={{
            padding: '14px 20px',
            borderRadius: 12,
            border: 'none',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: '#fff',
            fontWeight: 600,
            fontSize: 15,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)';
          }}
            >
              🔍 查询
            </button>
        <button
          type="button"
          onClick={handleClear}
          style={{
            padding: '14px 16px',
            borderRadius: 12,
            border: '2px solid #e5e7eb',
            background: '#fff',
            color: '#374151',
            fontWeight: 600,
            fontSize: 15,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#dc2626';
            e.currentTarget.style.color = '#dc2626';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e5e7eb';
            e.currentTarget.style.color = '#374151';
          }}
        >
          🗑️ 清空
        </button>
      </form>

      {/* 图片放大模态框 */}
      {showImageModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setShowImageModal(false)}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '90%',
              maxHeight: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {highResImage ? (
              <img
                src={`data:image/png;base64,${highResImage}`}
                alt={product?.name || '产品图片'}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  borderRadius: 8,
                  objectFit: 'contain',
                }}
              />
            ) : (
              <div
                style={{
                  width: '200px',
                  height: '200px',
                  backgroundColor: '#f9fafb',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6b7280',
                  fontSize: 14,
                }}
              >
                加载中...
              </div>
            )}
            <button
              onClick={() => setShowImageModal(false)}
              style={{
                position: 'absolute',
                top: -10,
                right: -10,
                width: 30,
                height: 30,
                borderRadius: '50%',
                border: 'none',
                backgroundColor: '#fff',
                color: '#374151',
                fontSize: 18,
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}
      
      {/* Toast通知 */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            padding: '12px 20px',
            borderRadius: '8px',
            color: '#fff',
            fontWeight: 500,
            fontSize: '14px',
            maxWidth: '90%',
            textAlign: 'center',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            backgroundColor: toast.type === 'success' ? '#10b981' : 
                           toast.type === 'error' ? '#ef4444' : '#3b82f6',
            animation: 'slideDown 0.3s ease-out',
          }}
        >
          {toast.message}
        </div>
      )}
      
      </div>
    </>
  );
}
