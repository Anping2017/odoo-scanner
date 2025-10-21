'use client';

import { useCallback, useEffect, useState } from 'react';

type InventoryHistory = {
  id: number;
  store_name: string;
  user_name: string;
  inventory_date: string;
  total_devices: number;
  scan_count: number;
  manual_count: number;
  scan_rate: number;
  duration_minutes: number;
  notes?: string;
  create_date: string;
};

export default function InventoryHistoryPage() {
  const [histories, setHistories] = useState<InventoryHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStore, setFilterStore] = useState('');
  const [filterUser, setFilterUser] = useState('');

  // 加载历史记录
  const loadHistories = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/inventory-history', { 
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

  // 初始化加载
  useEffect(() => {
    loadHistories();
  }, [loadHistories]);

  // 过滤历史记录
  const filteredHistories = histories.filter(history => {
    const storeMatch = !filterStore || history.store_name.toLowerCase().includes(filterStore.toLowerCase());
    const userMatch = !filterUser || history.user_name.toLowerCase().includes(filterUser.toLowerCase());
    return storeMatch && userMatch;
  });

  // 获取唯一门店列表
  const uniqueStores = [...new Set(histories.map(h => h.store_name))];
  const uniqueUsers = [...new Set(histories.map(h => h.user_name))];

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 格式化时长
  const formatDuration = (minutes: number) => {
    if (minutes < 60) {
      return `${minutes}分钟`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}小时${mins}分钟`;
  };

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100dvh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f8fafc'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, color: '#6b7280' }}>加载历史记录中...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        minHeight: '100dvh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f8fafc'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, color: '#dc2626', marginBottom: 16 }}>{error}</div>
          <button
            onClick={loadHistories}
            style={{
              padding: '12px 24px',
              borderRadius: 8,
              border: 'none',
              background: '#111827',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: '#f8fafc',
    }}>
      {/* 顶部栏 */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: '#fff',
        borderBottom: '1px solid #e5e7eb',
        padding: '12px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>盘点历史记录</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => window.location.href = '/scan'}
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
              返回
            </button>
            <button
              onClick={loadHistories}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: 'none',
                background: '#059669',
                color: '#fff',
                fontWeight: 500,
                fontSize: 14,
              }}
            >
              刷新
            </button>
          </div>
        </div>
      </div>

      {/* 筛选区域 */}
      <div style={{ padding: '16px' }}>
        <div style={{
          background: '#fff',
          borderRadius: 8,
          padding: 16,
          border: '1px solid #e5e7eb',
          marginBottom: 16,
        }}>
          <div style={{
            fontSize: 14,
            fontWeight: 500,
            color: '#374151',
            marginBottom: 12,
          }}>
            筛选条件
          </div>
          <div style={{ 
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 14, color: '#6b7280' }}>门店:</label>
              <select
                value={filterStore}
                onChange={(e) => setFilterStore(e.target.value)}
                style={{
                  padding: '6px 8px',
                  borderRadius: 4,
                  border: '1px solid #e5e7eb',
                  fontSize: 14,
                  minWidth: 120,
                }}
              >
                <option value="">全部门店</option>
                {uniqueStores.map(store => (
                  <option key={store} value={store}>{store}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 14, color: '#6b7280' }}>操作员:</label>
              <select
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                style={{
                  padding: '6px 8px',
                  borderRadius: 4,
                  border: '1px solid #e5e7eb',
                  fontSize: 14,
                  minWidth: 120,
                }}
              >
                <option value="">全部操作员</option>
                {uniqueUsers.map(user => (
                  <option key={user} value={user}>{user}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => {
                setFilterStore('');
                setFilterUser('');
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 4,
                border: '1px solid #e5e7eb',
                background: '#fff',
                color: '#6b7280',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              清空筛选
            </button>
          </div>
        </div>

        {/* 统计信息 */}
        <div style={{
          background: '#fff',
          borderRadius: 8,
          padding: 16,
          border: '1px solid #e5e7eb',
          marginBottom: 16,
        }}>
          <div style={{
            fontSize: 14,
            fontWeight: 500,
            color: '#374151',
            marginBottom: 8,
          }}>
            统计信息
          </div>
          <div style={{ 
            display: 'flex',
            gap: 24,
            fontSize: 14,
            color: '#6b7280',
          }}>
            <span>总记录: {filteredHistories.length}</span>
            <span>总设备: {filteredHistories.reduce((sum, h) => sum + h.total_devices, 0)}</span>
            <span>平均扫码率: {filteredHistories.length > 0 ? Math.round(filteredHistories.reduce((sum, h) => sum + h.scan_rate, 0) / filteredHistories.length) : 0}%</span>
          </div>
        </div>
      </div>

      {/* 历史记录列表 */}
      <div style={{ flex: 1, padding: '0 16px 16px' }}>
        {filteredHistories.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px 20px',
            color: '#6b7280',
            background: '#fff',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
          }}>
            没有找到历史记录
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredHistories.map((history) => (
              <div
                key={history.id}
                style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  padding: 16,
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
                      {history.store_name}
                    </div>
                    <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 2 }}>
                      操作员: {history.user_name}
                    </div>
                    <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 2 }}>
                      盘点时间: {formatDate(history.inventory_date)}
                    </div>
                    <div style={{ fontSize: 14, color: '#6b7280' }}>
                      记录时间: {formatDate(history.create_date)}
                    </div>
                  </div>
                  <div style={{
                    background: history.scan_rate >= 80 ? '#f0fdf4' : history.scan_rate >= 60 ? '#fefce8' : '#fef2f2',
                    border: `1px solid ${history.scan_rate >= 80 ? '#bbf7d0' : history.scan_rate >= 60 ? '#fde047' : '#fecaca'}`,
                    borderRadius: 6,
                    padding: '8px 12px',
                    textAlign: 'center',
                  }}>
                    <div style={{
                      fontSize: 18,
                      fontWeight: 600,
                      color: history.scan_rate >= 80 ? '#059669' : history.scan_rate >= 60 ? '#ca8a04' : '#dc2626',
                    }}>
                      {history.scan_rate}%
                    </div>
                    <div style={{
                      fontSize: 12,
                      color: '#6b7280',
                    }}>
                      扫码率
                    </div>
                  </div>
                </div>
                
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  fontSize: 14,
                  color: '#6b7280',
                  borderTop: '1px solid #f3f4f6',
                  paddingTop: 12,
                }}>
                  <span>总设备: {history.total_devices}</span>
                  <span>扫码: {history.scan_count}</span>
                  <span>手动: {history.manual_count}</span>
                  <span>耗时: {formatDuration(history.duration_minutes)}</span>
                </div>
                
                {history.notes && (
                  <div style={{
                    marginTop: 12,
                    padding: 8,
                    background: '#f8fafc',
                    borderRadius: 4,
                    fontSize: 14,
                    color: '#6b7280',
                    borderLeft: '3px solid #e5e7eb',
                  }}>
                    备注: {history.notes}
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
