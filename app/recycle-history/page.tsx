'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';

type RecycleHistory = {
  id: number;
  store_name: string;
  operator_name: string;
  recycle_date: string;
  device_type: string;
  brand: string;
  model: string;
  customer_name: string;
  phone?: string;
  email?: string;
  recycle_price: string;
  condition: string;
  purchase_order_id?: number;
  order_line_id?: number;
  notes?: string;
  created_at: string;
  full_data?: {
    deviceInfo: any;
    userInfo: any;
    inspectionInfo: any;
  };
};

export default function RecycleHistoryPage() {
  const router = useRouter();
  const [histories, setHistories] = useState<RecycleHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStore, setFilterStore] = useState('');
  const [filterOperator, setFilterOperator] = useState('');
  const [filterDeviceType, setFilterDeviceType] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // 加载历史记录
  const loadHistories = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/recycle-history', { 
        cache: 'no-store',
        credentials: 'include'
      });
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok || data?.error) {
        throw new Error(data?.error || '加载失败');
      }
      
      setHistories(data.histories || []);
    } catch (e: any) {
      setError(e?.message || '加载历史记录失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistories();
  }, [loadHistories]);

  // 过滤后的历史记录
  const filteredHistories = useMemo(() => {
    return histories.filter(history => {
      if (filterStore && !history.store_name.toLowerCase().includes(filterStore.toLowerCase())) {
        return false;
      }
      if (filterOperator && !history.operator_name.toLowerCase().includes(filterOperator.toLowerCase())) {
        return false;
      }
      if (filterDeviceType && history.device_type !== filterDeviceType) {
        return false;
      }
      return true;
    });
  }, [histories, filterStore, filterOperator, filterDeviceType]);

  // 获取唯一的设备类型列表
  const deviceTypes = useMemo(() => {
    const types = new Set(histories.map(h => h.device_type).filter(Boolean));
    return Array.from(types).sort();
  }, [histories]);

  // 获取唯一的门店列表
  const stores = useMemo(() => {
    const storeSet = new Set(histories.map(h => h.store_name).filter(Boolean));
    return Array.from(storeSet).sort();
  }, [histories]);

  // 格式化日期
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  // 切换展开/收起
  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
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
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#111827' }}>
            回收历史记录
          </div>
          <div style={{ fontSize: 14, color: '#6b7280' }}>
            ({filteredHistories.length} 条记录)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => window.location.href = '/recycle'}
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
            返回回收
          </button>
          <button
            onClick={() => router.push('/dashboard')}
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
            返回首页
          </button>
        </div>
      </div>

      {/* 过滤区域 */}
      <div style={{
        padding: '20px 16px',
        background: '#fff',
        borderBottom: '1px solid #e5e7eb'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          maxWidth: 1200,
          margin: '0 auto'
        }}>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
              门店
            </label>
            <input
              type="text"
              value={filterStore}
              onChange={(e) => setFilterStore(e.target.value)}
              placeholder="搜索门店..."
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                fontSize: 14
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
              操作员
            </label>
            <input
              type="text"
              value={filterOperator}
              onChange={(e) => setFilterOperator(e.target.value)}
              placeholder="搜索操作员..."
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                fontSize: 14
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
              设备类型
            </label>
            <select
              value={filterDeviceType}
              onChange={(e) => setFilterDeviceType(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                fontSize: 14
              }}
            >
              <option value="">全部</option>
              {deviceTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div style={{ padding: '20px 16px', maxWidth: 1400, margin: '0 auto' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
            加载中...
          </div>
        )}

        {error && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            padding: '16px',
            marginBottom: 16,
            color: '#dc2626'
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>错误</div>
            <div>{error}</div>
            <button
              onClick={loadHistories}
              style={{
                marginTop: 12,
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid #dc2626',
                background: '#fff',
                color: '#dc2626',
                fontSize: 14,
                cursor: 'pointer'
              }}
            >
              重试
            </button>
          </div>
        )}

        {!loading && !error && filteredHistories.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: '#6b7280'
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 8 }}>暂无回收历史记录</div>
            <div style={{ fontSize: 14 }}>开始回收设备后，历史记录将显示在这里</div>
          </div>
        )}

        {!loading && !error && filteredHistories.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredHistories.map(history => (
              <div
                key={history.id}
                style={{
                  background: '#fff',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  overflow: 'hidden'
                }}
              >
                {/* 主要信息 */}
                <div
                  style={{
                    padding: '16px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: expandedId === history.id ? '#f9fafb' : '#fff'
                  }}
                  onClick={() => toggleExpand(history.id)}
                >
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>设备</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                        {history.brand} {history.model}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                        {history.device_type}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>客户</div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>
                        {history.customer_name}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                        {history.phone || history.email || '-'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>回收价格</div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#059669' }}>
                        ${history.recycle_price || '0'}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                        成色: {history.condition}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>门店/操作员</div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>
                        {history.store_name}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                        {history.operator_name}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>回收日期</div>
                      <div style={{ fontSize: 14, color: '#111827' }}>
                        {formatDate(history.recycle_date)}
                      </div>
                      {history.purchase_order_id && (
                        <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 2 }}>
                          PO{history.purchase_order_id}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ marginLeft: 16, fontSize: 20, color: '#9ca3af' }}>
                    {expandedId === history.id ? '▲' : '▼'}
                  </div>
                </div>

                {/* 详细信息（展开时显示） */}
                {expandedId === history.id && history.full_data && (
                  <div style={{
                    padding: '16px',
                    borderTop: '1px solid #e5e7eb',
                    background: '#f9fafb'
                  }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                      gap: 16
                    }}>
                      {/* 设备详细信息 */}
                      <div>
                        <h4 style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
                          设备信息
                        </h4>
                        <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.8 }}>
                          {Object.entries(history.full_data.deviceInfo || {}).map(([key, value]) => {
                            if (!value || (Array.isArray(value) && value.length === 0)) return null;
                            return (
                              <div key={key} style={{ marginBottom: 4 }}>
                                <span style={{ color: '#6b7280' }}>{key}:</span>{' '}
                                <span>{Array.isArray(value) ? value.join(', ') : String(value)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* 用户详细信息 */}
                      <div>
                        <h4 style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
                          用户信息
                        </h4>
                        <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.8 }}>
                          {Object.entries(history.full_data.userInfo || {}).map(([key, value]) => {
                            if (!value) return null;
                            return (
                              <div key={key} style={{ marginBottom: 4 }}>
                                <span style={{ color: '#6b7280' }}>{key}:</span>{' '}
                                <span>{String(value)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* 检测信息 */}
                      <div>
                        <h4 style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
                          检测信息
                        </h4>
                        <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.8 }}>
                          {Object.entries(history.full_data.inspectionInfo || {}).map(([key, value]) => {
                            if (!value || (Array.isArray(value) && value.length === 0)) return null;
                            return (
                              <div key={key} style={{ marginBottom: 4 }}>
                                <span style={{ color: '#6b7280' }}>{key}:</span>{' '}
                                <span>{Array.isArray(value) ? value.join(', ') : String(value)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

