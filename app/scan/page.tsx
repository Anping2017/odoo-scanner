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

export default function ScanPage() {
  const [scanning, setScanning] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [lastCode, setLastCode] = useState<string>('');
  const [product, setProduct] = useState<Product | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [counted, setCounted] = useState<string>(''); // 盘点数量
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [salesHistory, setSalesHistory] = useState<SalesItem[]>([]);
  const [salesPeriod, setSalesPeriod] = useState<'30' | '90' | '365' | 'all'>('30');
  const [salesLoading, setSalesLoading] = useState(false);
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

  const loadHistory = useCallback(async (pid: number) => {
    try {
      const res = await fetch(`/api/inventory?product_id=${pid}&limit=5`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      setHistory(Array.isArray(data?.history) ? data.history : []);
    } catch {
      setHistory([]);
    }
  }, []);

  const loadSalesHistory = useCallback(async (pid: number, period: string = '30') => {
    setSalesLoading(true);
    try {
      const res = await fetch(`/api/sales-history?product_id=${pid}&period=${period}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      setSalesHistory(Array.isArray(data?.salesHistory) ? data.salesHistory : []);
    } catch {
      setSalesHistory([]);
    } finally {
      setSalesLoading(false);
    }
  }, []);

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
        loadHistory(p.id);
        loadSalesHistory(p.id, salesPeriod);
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        showToast(`搜索失败: ${error.message}`, 'error');
      }
    } finally {
      setIsLoading(false);
      fetchLockRef.current = false;
    }
  }, [loadHistory, loadSalesHistory, salesPeriod, showToast]);

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
  }, []);

  const handleSalesPeriodChange = useCallback((period: '30' | '90' | '365' | 'all') => {
    setSalesPeriod(period);
    if (product?.id) {
      loadSalesHistory(product.id, period);
    }
  }, [product?.id, loadSalesHistory]);

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
        loadHistory(product.id).catch(e => {
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
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: '#f8fafc',
        paddingBottom: 92,
      }}
    >
      {/* 顶部栏 */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
        }}
      >
        <div style={{ fontWeight: 700 }}>库存扫码</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => window.location.href = '/device-inventory'}
            style={{ 
              padding: '8px 12px', 
              borderRadius: 8, 
              border: '1px solid #e5e7eb', 
              background: '#fff',
              color: '#374151',
              fontWeight: 500,
              fontSize: 14,
            }}
          >
            设备盘点
          </button>
          <button
            onClick={handleRescan}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff' }}
          >
            重新扫码
          </button>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #ef4444',
              background: '#fff',
              color: '#ef4444',
              fontWeight: 600,
            }}
          >
            退出
          </button>
        </div>
      </div>

      {/* 摄像头区域 */}
      <div style={{ padding: 12 }}>
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 12,
            background: '#000',
            height: scanning ? '56vh' : '14vh', // 扫描时56vh，暂停时14vh（约1/4）
            transition: 'height 0.3s ease-in-out', // 添加平滑过渡动画
          }}
        >
          {scanning ? (
            <Scanner onDetected={handleDetected} />
          ) : (
            <div
              style={{
                color: '#9ca3af',
                height: '100%',
                display: 'grid',
                placeItems: 'center',
                fontSize: 14,
              }}
            >
              摄像头已暂停
            </div>
          )}
        </div>

        {/* 最近条码 */}
        {lastCode ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              fontSize: 14,
            }}
          >
            最近条码：<strong>{lastCode}</strong>
            {isLoading ? <span style={{ marginLeft: 8, color: '#6b7280' }}>查询中…</span> : null}
          </div>
        ) : null}

        {/* 结果 + 盘点输入 */}
        <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
          {product ? (
            <div
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 14,
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{product.name}</div>
              <div style={{ color: '#6b7280', fontSize: 13 }}>
                条码：{product.barcode || '-'} | 编码：{product.default_code || '-'}
              </div>
              <div style={{ marginTop: 8, fontSize: 14 }}>
                现有库存：<strong>{product.qty_available ?? '-'}</strong>
                {typeof product.free_qty === 'number' ? (
                  <span style={{ marginLeft: 10, color: '#6b7280' }}>可用：{product.free_qty}</span>
                ) : null}
              </div>
              <div style={{ marginTop: 6, fontSize: 14 }}>
                <span style={{ color: '#6b7280' }}>
                  门店零售价：<span style={{ color: '#059669' }}>
                    {typeof product.list_price === 'number' ? `$${product.list_price.toFixed(2)}` : '-'}
                  </span>
                </span>
                {typeof product.standard_price === 'number' ? (
                  <span style={{ marginLeft: 10, color: '#6b7280' }}>
                    成本：<span style={{ color: '#dc2626' }}>${product.standard_price.toFixed(2)}</span>
                  </span>
                ) : null}
              </div>
              {/* 只在自定义字段存在时显示 */}
              {(product.raytech_p3 !== null && product.raytech_p3 !== undefined) || 
               (product.raytech_stock !== null && product.raytech_stock !== undefined) ? (
                <div style={{ marginTop: 6, fontSize: 14 }}>
                  {typeof product.raytech_p3 === 'number' ? (
                    <span style={{ color: '#6b7280' }}>
                      总部零售价：<span style={{ color: '#059669' }}>${product.raytech_p3.toFixed(2)}</span>
                    </span>
                  ) : null}
                  {typeof product.raytech_stock === 'number' ? (
                    <span style={{ marginLeft: 10, color: '#6b7280' }}>
                      总部库存：<span style={{ color: product.raytech_stock > 0 ? '#059669' : '#dc2626' }}>
                        {product.raytech_stock > 0 ? '有货' : '无货'}
                      </span>
                    </span>
                  ) : null}
                </div>
              ) : null}

              {/* 盘点输入区 */}
              <div style={{ marginTop: 12 }}>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 14, fontWeight: 700 }}>盘点数量（调整为）：</label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                  <button
                    onClick={() => {
                      const current = Number(counted) || 0;
                      setCounted(String(current - 1));
                    }}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      border: '1px solid #e5e7eb',
                      background: '#fff',
                      color: '#374151',
                      fontSize: 18,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
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
                      width: 100,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid #e5e7eb',
                      outline: 'none',
                      fontSize: 16,
                      textAlign: 'center',
                    }}
                  />
                  <button
                    onClick={() => {
                      const current = Number(counted) || 0;
                      setCounted(String(current + 1));
                    }}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      border: '1px solid #e5e7eb',
                      background: '#fff',
                      color: '#374151',
                      fontSize: 18,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                    title="增加1"
                  >
                    +
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleUpdateInventory}
                    disabled={updating}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: 'none',
                      background: updating ? '#9ca3af' : '#111827',
                      color: '#fff',
                      fontWeight: 600,
                    }}
                  >
                    {updating ? '更新中…' : '更新库存'}
                  </button>
                  <button
                    onClick={handleRescan}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: '1px solid #e5e7eb',
                      background: '#fff',
                      color: '#374151',
                      fontWeight: 600,
                    }}
                  >
                    重新扫码
                  </button>
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
                重新扫码
              </button>
            </div>
          ) : null}

          {/* 产品图片卡片 */}
          {product && product.image_128 && (
            <div
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 14,
                textAlign: 'center',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>产品图片</div>
              <img
                src={`data:image/png;base64,${product.image_128}`}
                alt={product.name}
                loading="lazy"
                style={{
                  maxWidth: '100%',
                  maxHeight: '150px',
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
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                点击查看大图
              </div>
            </div>
          )}

          {/* 销售记录页签 */}
          {product && (
            <div
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 14,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>销售记录</div>
                <button
                  onClick={testPosSales}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 4,
                    border: '1px solid #d1d5db',
                    background: '#f9fafb',
                    color: '#374151',
                    fontSize: 10,
                    cursor: 'pointer',
                  }}
                >
                  调试POS
                </button>
              </div>
              
              {/* 页签按钮 */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {[
                  { key: '30', label: '最近30天' },
                  { key: '90', label: '最近90天' },
                  { key: '365', label: '最近365天' },
                  { key: 'all', label: '所有' }
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => handleSalesPeriodChange(key as any)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: '1px solid #d1d5db',
                      background: salesPeriod === key ? '#3b82f6' : '#fff',
                      color: salesPeriod === key ? '#fff' : '#374151',
                      fontSize: 12,
                      fontWeight: salesPeriod === key ? 600 : 400,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* 销售记录列表 */}
              {salesLoading ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#6b7280' }}>
                  加载中...
                </div>
              ) : salesHistory.length > 0 ? (
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {salesHistory.map((sale) => (
                    <div
                      key={sale.id}
                      style={{
                        padding: '8px 0',
                        borderBottom: '1px solid #f3f4f6',
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, color: '#374151' }}>
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
                        <span style={{ color: '#059669', fontWeight: 600 }}>
                          ${sale.total_amount.toFixed(2)}
                        </span>
                      </div>
                      <div style={{ color: '#6b7280', marginBottom: 2 }}>
                        客户: {sale.customer}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
                        <span>{sale.date}</span>
                        <span>{sale.quantity} × ${sale.unit_price.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#6b7280' }}>
                  暂无销售记录
                </div>
              )}
            </div>
          )}

          {/* 最近调整记录 */}
          {product ? (
            <div
              style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}
            >
              <div style={{ fontWeight: 700, marginBottom: 8 }}>最近库存变动记录</div>
              {history.length ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {history.map((h) => (
                    <div
                      key={h.id}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: 10,
                        padding: 10,
                        fontSize: 13,
                        lineHeight: 1.5,
                      }}
                    >
                      <div><strong>{h.qty_done}</strong> {h.uom || ''}</div>
                      <div style={{ color: '#6b7280' }}>
                        {h.from || '-'} → {h.to || '-'}
                      </div>
                      <div style={{ color: '#6b7280' }}>
                        {new Date(h.date).toLocaleString()} | {h.created_by || h.updated_by || ''}
                      </div>
                      {h.ref ? <div style={{ color: '#6b7280' }}>Ref: {h.ref}</div> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#6b7280', fontSize: 13 }}>暂无记录</div>
              )}
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
          background: '#fff',
          borderTop: '1px solid #e5e7eb',
          padding: '10px 12px calc(10px + env(safe-area-inset-bottom))',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
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
            padding: '12px 12px',
            borderRadius: 10,
            border: '1px solid #e5e7eb',
            outline: 'none',
            fontSize: 16,
          }}
        />
        <button
          type="submit"
          style={{
            padding: '12px 14px',
            borderRadius: 10,
            border: 'none',
            background: '#111827',
            color: '#fff',
            fontWeight: 600,
          }}
        >
          查询
        </button>
        <button
          type="button"
          onClick={handleClear}
          style={{
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid #e5e7eb',
            background: '#fff',
          }}
        >
          清空
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
      
      <style jsx>{`
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
      `}</style>
    </div>
  );
}
