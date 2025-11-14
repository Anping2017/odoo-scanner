'use client';

import { useCallback, useEffect, useState } from 'react';

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

export default function ReceivingPage() {
  const [orders, setOrders] = useState<ReceivingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const debugReceiving = useCallback(async () => {
    try {
      const res = await fetch('/api/debug-receiving', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      console.log('收货调试结果:', data);
      
      if (data.tests) {
        const tests = data.tests;
        let message = `调试完成:\n`;
        message += `Receive仓库: ${tests.receiveWarehouses.count}个\n`;
        message += `所有仓库: ${tests.allWarehouses.count}个\n`;
        message += `库存移动: ${tests.stockMoves.count}个\n`;
        message += `收货单: ${tests.pickings.count}个`;
        
        // 显示仓库名称
        if (tests.allWarehouses.data && tests.allWarehouses.data.length > 0) {
          message += `\n仓库列表: ${tests.allWarehouses.data.map((w: any) => w.name).join(', ')}`;
        }
        
        // 显示错误信息
        if (tests.receiveWarehouses.error) {
          message += `\nReceive仓库错误: ${JSON.stringify(tests.receiveWarehouses.error).substring(0, 100)}...`;
        }
        if (tests.stockMoves.error) {
          message += `\n库存移动错误: ${JSON.stringify(tests.stockMoves.error).substring(0, 100)}...`;
        }
        if (tests.pickings.error) {
          message += `\n收货单错误: ${JSON.stringify(tests.pickings.error).substring(0, 100)}...`;
        }
        
        showToast(message, 'info');
      } else {
        showToast('调试完成，查看控制台', 'info');
      }
    } catch (error) {
      console.error('调试失败:', error);
      showToast('调试失败', 'error');
    }
  }, [showToast]);

  const testProductTracking = useCallback(async () => {
    try {
      const res = await fetch('/api/test-product-tracking', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      console.log('产品跟踪测试结果:', data);
      
      if (data.error) {
        showToast(`测试失败: ${data.error}`, 'error');
      } else {
        const summary = data.summary || {};
        const products = data.products || [];
        
        let message = `产品跟踪测试:\n`;
        message += `收货单: ${data.testPicking?.name}\n`;
        message += `总产品: ${summary.totalProducts}\n`;
        message += `需要跟踪: ${summary.needsTracking}\n`;
        message += `无需跟踪: ${summary.noTracking}`;
        
        if (summary.needsTracking > 0) {
          const trackingProducts = products.filter((p: any) => p.needsLotSerial);
          message += `\n需要跟踪的产品: ${trackingProducts.map((p: any) => p.name).join(', ')}`;
        }
        
        showToast(message, 'info');
      }
    } catch (error) {
      console.error('产品跟踪测试失败:', error);
      showToast('产品跟踪测试失败', 'error');
    }
  }, [showToast]);

  const checkMoveLineFields = useCallback(async () => {
    try {
      const res = await fetch('/api/check-move-line-fields', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      console.log('移动行字段检查结果:', data);
      
      if (data.error) {
        showToast(`检查失败: ${data.error}`, 'error');
      } else {
        const quantityFields = data.quantityFields || [];
        const lotSerialFields = data.lotSerialFields || [];
        const requiredFields = data.requiredFields || [];
        
        let message = `移动行字段检查:\n`;
        message += `数量字段: ${quantityFields.map((f: any) => f.name).join(', ')}\n`;
        message += `批次字段: ${lotSerialFields.map((f: any) => f.name).join(', ')}\n`;
        message += `必需字段: ${requiredFields.map((f: any) => f.name).join(', ')}`;
        
        showToast(message, 'info');
      }
    } catch (error) {
      console.error('移动行字段检查失败:', error);
      showToast('移动行字段检查失败', 'error');
    }
  }, [showToast]);

  const testMoveLineQuantity = useCallback(async () => {
    try {
      const res = await fetch('/api/test-move-line-quantity', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      console.log('移动行数量测试结果:', data);
      
      if (data.error) {
        showToast(`测试失败: ${data.error}`, 'error');
      } else {
        let message = `移动行数量测试:\n`;
        message += `收货单: ${data.testPicking?.name}\n`;
        message += `产品跟踪: ${data.productTracking?.tracking}\n`;
        message += `数量更新: ${data.quantityUpdate?.error ? '失败' : '成功'}\n`;
        message += `移动行创建: ${data.moveLineTest?.error ? '失败' : '成功'}`;
        
        if (data.moveLineTest?.error) {
          message += `\n错误: ${JSON.stringify(data.moveLineTest.error).substring(0, 100)}...`;
        }
        
        showToast(message, 'info');
      }
    } catch (error) {
      console.error('移动行数量测试失败:', error);
      showToast('移动行数量测试失败', 'error');
    }
  }, [showToast]);

  const testMoveLineCreate = useCallback(async () => {
    try {
      const res = await fetch('/api/test-move-line-create', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      console.log('移动行创建测试结果:', data);
      
      if (data.error) {
        showToast(`测试失败: ${data.error}`, 'error');
      } else {
        let message = `移动行创建测试:\n`;
        message += `产品: ${data.testProduct?.name}\n`;
        message += `跟踪: ${data.testProduct?.tracking}\n`;
        message += `创建: ${data.createTest?.error ? '失败' : '成功'}`;
        
        if (data.createTest?.error) {
          message += `\n错误: ${JSON.stringify(data.createTest.error).substring(0, 100)}...`;
        }
        
        showToast(message, 'info');
      }
    } catch (error) {
      console.error('移动行创建测试失败:', error);
      showToast('移动行创建测试失败', 'error');
    }
  }, [showToast]);

  const testMoveLineSimple = useCallback(async () => {
    try {
      const res = await fetch('/api/test-move-line-simple', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      console.log('移动行简单测试结果:', data);
      
      if (data.error) {
        showToast(`测试失败: ${data.error}`, 'error');
      } else {
        let message = `移动行简单测试:\n`;
        message += `字段测试: ${data.fieldsTest === '成功' ? '成功' : '失败'}\n`;
        message += `搜索测试: ${data.searchTest?.count || '失败'}\n`;
        message += `单位测试: ${data.uomTest?.found ? '找到' : '未找到'}\n`;
        message += `位置测试: ${data.locationTest?.found ? '找到' : '未找到'}\n`;
        message += `产品测试: ${data.productTest?.found ? '找到' : '未找到'}\n`;
        message += `创建测试: ${data.createTest?.success ? '成功' : '失败'}`;
        
        if (data.createTest && !data.createTest.success) {
          message += `\n创建错误: ${JSON.stringify(data.createTestDetails || data.createTest).substring(0, 200)}...`;
        }
        
        if (data.searchTest && !data.searchTest.count) {
          message += `\n搜索错误: ${JSON.stringify(data.searchTestDetails || data.searchTest).substring(0, 200)}...`;
        }
        
        showToast(message, 'info');
      }
    } catch (error) {
      console.error('移动行简单测试失败:', error);
      showToast('移动行简单测试失败', 'error');
    }
  }, [showToast]);


  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/receiving-orders', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setOrders(data.orders || []);
    } catch (error: any) {
      showToast(`加载订单失败: ${error.message}`, 'error');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const confirmReceipt = useCallback(async (orderId: number) => {
    setConfirming(orderId);
    try {
      const res = await fetch('/api/confirm-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
        cache: 'no-store',
      });
      
      const data = await res.json().catch(() => ({}));
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      showToast(data.message, data.success ? 'success' : 'error');
      
      // 重新加载订单列表
      if (data.success) {
        await loadOrders();
      }
    } catch (error: any) {
      showToast(`确认入库失败: ${error.message}`, 'error');
    } finally {
      setConfirming(null);
    }
  }, [showToast, loadOrders]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
      window.location.href = '/';
    } catch {}
  }, []);

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .debug-buttons {
            display: none !important;
          }
          .top-nav-left {
            flex-wrap: wrap;
            gap: 8px !important;
          }
          .top-nav-title {
            font-size: 16px !important;
          }
          .top-nav-right {
            flex-wrap: wrap;
            gap: 6px !important;
          }
          .top-nav-button {
            padding: 6px 12px !important;
            font-size: 12px !important;
          }
          .order-card {
            padding: 12px !important;
          }
          .order-header {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 12px !important;
          }
          .order-header-right {
            width: 100% !important;
            flex-direction: row !important;
            justify-content: space-between !important;
            align-items: center !important;
          }
          .order-amount {
            text-align: left !important;
          }
          .order-detail-button {
            width: auto !important;
            flex: 1 !important;
            max-width: 200px !important;
          }
          .product-item {
            flex-direction: column !important;
            gap: 8px !important;
          }
          .product-info {
            width: 100% !important;
          }
          .product-quantity {
            width: 100% !important;
            text-align: left !important;
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 8px !important;
          }
          .product-quantity > div {
            flex: 1 1 calc(33.333% - 6px) !important;
            min-width: 80px !important;
          }
        }
        @media (max-width: 480px) {
          .top-nav-title {
            font-size: 15px !important;
          }
          .top-nav-button {
            padding: 6px 10px !important;
            font-size: 11px !important;
          }
          .order-card {
            padding: 10px !important;
          }
          .order-name {
            font-size: 15px !important;
          }
          .order-supplier {
            font-size: 12px !important;
          }
          .product-name {
            font-size: 13px !important;
          }
          .product-code {
            font-size: 11px !important;
          }
        }
        @media (hover: none) and (pointer: coarse) {
          button {
            min-height: 44px;
          }
        }
      `}</style>
      <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
        {/* 顶部导航栏 */}
        <div style={{
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          flexWrap: 'wrap',
          gap: 8,
        }}>
          <div className="top-nav-left" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="top-nav-title" style={{ fontSize: 18, fontWeight: 600, color: '#111827' }}>
              收货入库
            </div>
            <div className="debug-buttons" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <button
                onClick={debugReceiving}
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
                调试
              </button>
              <button
                onClick={testProductTracking}
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
                跟踪测试
              </button>
              <button
                onClick={checkMoveLineFields}
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
                字段检查
              </button>
              <button
                onClick={testMoveLineQuantity}
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
                数量测试
              </button>
              <button
                onClick={testMoveLineCreate}
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
                创建测试
              </button>
              <button
                onClick={testMoveLineSimple}
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
                简单测试
              </button>
            </div>
          </div>
          <div className="top-nav-right" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="top-nav-button"
              onClick={() => window.location.href = '/scan'}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                background: '#fff',
                color: '#374151',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              扫码盘点
            </button>
            <button
              className="top-nav-button"
              onClick={() => window.location.href = '/parts-inventory'}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                background: '#fff',
                color: '#374151',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              库存盘点
            </button>
            <button
              className="top-nav-button"
              onClick={() => window.location.href = '/products'}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                background: '#fff',
                color: '#374151',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              产品查询
            </button>
            <button
              className="top-nav-button"
              onClick={handleLogout}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                background: '#fff',
                color: '#374151',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              退出
            </button>
          </div>
        </div>

      {/* 主内容 */}
      <div style={{ padding: '16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
            加载中...
          </div>
        ) : orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
            暂无待入库订单
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {orders.map((order) => (
              <div
                key={order.id}
                className="order-card"
                style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding: 16,
                  maxWidth: '100%',
                  boxSizing: 'border-box',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                }}
              >
                {/* 订单头部 */}
                <div className="order-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="order-name" style={{ fontSize: 16, fontWeight: 600, color: '#111827', wordBreak: 'break-word' }}>
                      {order.name}
                    </div>
                    <div className="order-supplier" style={{ fontSize: 14, color: '#6b7280', marginTop: 4, wordBreak: 'break-word' }}>
                      {order.supplier} • {new Date(order.date_order).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="order-header-right" style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    <div className="order-amount" style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, color: '#6b7280' }}>总金额</div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#059669' }}>
                        ${order.amount_total.toFixed(2)}
                      </div>
                    </div>
                    <button
                      className="order-detail-button"
                      onClick={() => window.location.href = `/receiving/${order.id}`}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 8,
                        border: 'none',
                        background: '#3b82f6',
                        color: '#fff',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      查看详情
                    </button>
                  </div>
                </div>

                {/* 产品列表 */}
                <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                    待入库产品 ({order.products.length}个)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {order.products.map((product) => (
                      <div
                        key={product.id}
                        className="product-item"
                        style={{
                          padding: '12px',
                          background: '#f9fafb',
                          borderRadius: 8,
                          border: '1px solid #e5e7eb',
                          maxWidth: '100%',
                          boxSizing: 'border-box',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', width: '100%', gap: 12 }}>
                          <div className="product-info" style={{ flex: 1, minWidth: 0 }}>
                            <div className="product-name" style={{ fontSize: 14, fontWeight: 600, color: '#111827', wordBreak: 'break-word' }}>
                              {product.product_name}
                            </div>
                            <div className="product-code" style={{ fontSize: 12, color: '#6b7280', marginTop: 2, wordBreak: 'break-word' }}>
                              {product.product_code && `编码: ${product.product_code}`}
                              {product.product_code && product.product_barcode && ` • `}
                              {product.product_barcode && `条码: ${product.product_barcode}`}
                            </div>
                          </div>
                          <div className="product-quantity" style={{ textAlign: 'right', minWidth: 120, flexShrink: 0 }}>
                            <div style={{ fontSize: 12, color: '#6b7280' }}>
                              待入库: <span style={{ fontWeight: 600, color: '#dc2626' }}>{product.qty_to_receive}</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#6b7280' }}>
                              已入库: <span style={{ fontWeight: 600, color: '#059669' }}>{product.qty_done}</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#6b7280' }}>
                              总数量: <span style={{ fontWeight: 600 }}>{product.product_qty}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast通知 */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            background: toast.type === 'error' ? '#dc2626' : toast.type === 'success' ? '#059669' : '#3b82f6',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            zIndex: 1000,
            maxWidth: '90%',
            textAlign: 'center',
          }}
        >
          {toast.message}
        </div>
      )}
      </div>
    </>
  );
}
