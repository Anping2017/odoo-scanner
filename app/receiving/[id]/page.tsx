'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type ProductMove = {
  id: number;
  product_id: number;
  product_name: string;
  product_code: string;
  product_barcode: string;
  qty_to_receive: number;
  qty_done: number;
  product_qty: number;
  state: string;
  picking_id: number;
  tracking?: string; // 添加跟踪类型
};

type ReceivingOrder = {
  id: number;
  name: string;
  supplier: string;
  date_order: string;
  amount_total: number;
  state: string;
  warehouse: string;
  products: ProductMove[];
};

export default function ReceivingDetailPage({ params }: { params: { id: string } }) {
  const [order, setOrder] = useState<ReceivingOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [lotSerialNumbers, setLotSerialNumbers] = useState<Map<number, string>>(new Map()); // 存储每个产品的Lot/Serial Number
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const router = useRouter();

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadOrder = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/receiving-orders/${params.id}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.error) {
        throw new Error(data?.error || `HTTP ${res.status}: ${res.statusText}`);
      }
      setOrder(data.order);
    } catch (error: any) {
      console.error('获取订单详情失败:', error);
      showToast(`获取订单详情失败: ${error.message}`, 'error');
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [params.id, showToast]);

  const confirmSelectedProducts = useCallback(async () => {
    if (selectedProducts.size === 0) {
      showToast('请选择要确认的产品', 'error');
      return;
    }

    setConfirming(true);
    try {
      // 准备Lot/Serial Number数据
      const lotSerialData: { [key: number]: string } = {};
      selectedProducts.forEach(productId => {
        const lotSerial = lotSerialNumbers.get(productId);
        if (lotSerial) {
          lotSerialData[productId] = lotSerial;
        }
      });

      const res = await fetch('/api/confirm-receipt-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          order_id: order?.id,
          product_ids: Array.from(selectedProducts),
          lot_serial_numbers: lotSerialData
        }),
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${res.status}: ${res.statusText}`);
      }
      
        showToast(`一键入库完成！手动输入的批次/序列号已处理，收货单已验证！已处理 ${selectedProducts.size} 个产品`, 'success');
      setSelectedProducts(new Set());
      loadOrder(); // 刷新订单详情
    } catch (error: any) {
      console.error('确认入库失败:', error);
      showToast(`确认入库失败: ${error.message}`, 'error');
    } finally {
      setConfirming(false);
    }
  }, [selectedProducts, order?.id, showToast, loadOrder]);

  const confirmAllProducts = useCallback(async () => {
    if (!order || order.products.length === 0) {
      showToast('没有可确认的产品', 'error');
      return;
    }

    setConfirming(true);
    try {
      // 准备所有产品的Lot/Serial Number数据
      const lotSerialData: { [key: number]: string } = {};
      order.products.forEach(product => {
        const lotSerial = lotSerialNumbers.get(product.id);
        if (lotSerial) {
          lotSerialData[product.id] = lotSerial;
        }
      });

      const res = await fetch('/api/confirm-receipt-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          order_id: order.id,
          product_ids: order.products.map(p => p.id),
          lot_serial_numbers: lotSerialData
        }),
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${res.status}: ${res.statusText}`);
      }
      
        showToast(`一键入库完成！手动输入的批次/序列号已处理，收货单已验证！所有 ${order.products.length} 个产品已处理`, 'success');
      setSelectedProducts(new Set());
      loadOrder(); // 刷新订单详情
    } catch (error: any) {
      console.error('一键入库失败:', error);
      showToast(`一键入库失败: ${error.message}`, 'error');
    } finally {
      setConfirming(false);
    }
  }, [order, showToast, loadOrder]);

  const toggleProductSelection = useCallback((productId: number) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  }, [selectedProducts]);

  const selectAllProducts = useCallback(() => {
    if (!order) return;
    const allProductIds = order.products.map(p => p.id);
    setSelectedProducts(new Set(allProductIds));
  }, [order]);

  const clearSelection = useCallback(() => {
    setSelectedProducts(new Set());
  }, []);

  const updateLotSerialNumber = useCallback((productId: number, value: string) => {
    setLotSerialNumbers(prev => {
      const newMap = new Map(prev);
      if (value.trim()) {
        newMap.set(productId, value.trim());
      } else {
        newMap.delete(productId);
      }
      return newMap;
    });
  }, []);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  if (loading) {
    return (
      <div style={{ padding: 16, maxWidth: 800, margin: 'auto' }}>
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
          加载中...
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={{ padding: 16, maxWidth: 800, margin: 'auto' }}>
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
          订单不存在或加载失败
        </div>
        <button
          onClick={() => router.push('/receiving')}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            background: '#fff',
            color: '#374151',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          返回列表
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, maxWidth: 800, margin: 'auto' }}>
      {/* 头部 */}
      <div style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#111827' }}>
            收货订单详情
          </div>
          <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
            {order.name} • {order.warehouse}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={confirmAllProducts}
            disabled={confirming || !order || order.products.length === 0}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: confirming || !order || order.products.length === 0 ? '#9ca3af' : '#059669',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: confirming || !order || order.products.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {confirming ? '入库中...' : '一键入库'}
          </button>
          <button
            onClick={() => router.push('/receiving')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              background: '#fff',
              color: '#374151',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            返回列表
          </button>
        </div>
      </div>

      {/* 订单信息 */}
      <div style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>订单名称</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{order.name}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>供应商</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{order.supplier}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>仓库</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{order.warehouse}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>订单日期</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
              {new Date(order.date_order).toLocaleDateString()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>状态</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{order.state}</div>
          </div>
        </div>
      </div>

      {/* 产品选择控制 */}
      <div style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>
            待入库产品 ({order.products.length}个)
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={selectAllProducts}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                background: '#f9fafb',
                color: '#374151',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              全选
            </button>
            <button
              onClick={clearSelection}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                background: '#f9fafb',
                color: '#374151',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              清空
            </button>
            <button
              onClick={confirmSelectedProducts}
              disabled={confirming || selectedProducts.size === 0}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: 'none',
                background: confirming || selectedProducts.size === 0 ? '#9ca3af' : '#3b82f6',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: confirming || selectedProducts.size === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {confirming ? '确认中...' : `确认入库 (${selectedProducts.size})`}
            </button>
          </div>
        </div>
      </div>

      {/* 产品列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {order.products.map((product) => (
          <div
            key={product.id}
            style={{
              background: '#fff',
              border: selectedProducts.has(product.id) ? '2px solid #3b82f6' : '1px solid #e5e7eb',
              borderRadius: 12,
              padding: 16,
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onClick={() => toggleProductSelection(product.id)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                border: '2px solid #d1d5db',
                background: selectedProducts.has(product.id) ? '#3b82f6' : '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
              }}>
                {selectedProducts.has(product.id) && '✓'}
              </div>
              
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>
                  {product.product_name}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                  {product.product_code && `编码: ${product.product_code}`}
                  {product.product_barcode && ` • 条码: ${product.product_barcode}`}
                </div>
              </div>
              
              <div style={{ textAlign: 'right', minWidth: 150 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#dc2626' }}>
                  待入库: {product.qty_to_receive}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  已入库: {product.qty_done} / 总数量: {product.product_qty}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  状态: {product.state}
                </div>
              </div>
            </div>
            
            {/* Lot/Serial Number 输入框 - 仅对需要跟踪的产品显示 */}
            {product.tracking && product.tracking !== 'none' && (
              <div style={{ 
                marginTop: 12, 
                padding: 12, 
                background: '#f9fafb', 
                borderRadius: 8,
                border: '1px solid #e5e7eb'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ 
                    fontSize: 12, 
                    fontWeight: 600, 
                    color: '#374151',
                    minWidth: 80
                  }}>
                    {product.tracking === 'serial' ? '序列号:' : '批次号:'}
                  </label>
                  <input
                    type="text"
                    value={lotSerialNumbers.get(product.id) || ''}
                    onChange={(e) => updateLotSerialNumber(product.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()} // 防止触发产品选择
                    placeholder={`请输入${product.tracking === 'serial' ? '序列号' : '批次号'}`}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: 4,
                      fontSize: 12,
                      background: '#fff'
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Toast消息 */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            background: toast.type === 'success' ? '#d1fae5' : toast.type === 'error' ? '#fee2e2' : '#bfdbfe',
            color: toast.type === 'success' ? '#065f46' : toast.type === 'error' ? '#991b1b' : '#1e40af',
            padding: '12px 24px',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            fontSize: 14,
            fontWeight: 500,
            maxWidth: '90%',
            textAlign: 'center',
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
