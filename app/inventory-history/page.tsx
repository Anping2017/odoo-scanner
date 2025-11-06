'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';

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

// 盘点类型
type InventoryCategory = 'Devices' | 'Parts' | 'Accessories' | 'Unknown';

// 解析盘点类型
const getCategory = (notes?: string): InventoryCategory => {
  if (!notes) return 'Unknown';
  if (notes.startsWith('Devices')) return 'Devices';
  if (notes.startsWith('Parts')) return 'Parts';
  if (notes.startsWith('Accessories')) return 'Accessories';
  // 兼容旧数据：如果包含"零件"或"配件"，尝试解析
  if (notes.includes('零件盘点完成') || notes.includes('零件')) return 'Parts';
  if (notes.includes('配件盘点完成') || notes.includes('配件')) return 'Accessories';
  if (notes.includes('设备盘点完成') || notes.includes('自动盘点完成')) return 'Devices';
  return 'Unknown';
};

// 获取类型显示名称
const getCategoryName = (category: InventoryCategory): string => {
  switch (category) {
    case 'Devices': return '设备盘点';
    case 'Parts': return '零件盘点';
    case 'Accessories': return '配件盘点';
    default: return '未知类型';
  }
};

// 解析操作员详细信息
const parseOperatorDetails = (notes?: string): Array<{name: string, date: string, count: number}> => {
  const operators: Array<{name: string, date: string, count: number}> = [];
  if (!notes) return operators;
  
  // 查找OPERATORS:开头的部分，匹配到字符串末尾
  const operatorsMatch = notes.match(/OPERATORS:(.+)$/);
  if (operatorsMatch && operatorsMatch[1]) {
    const operatorsStr = operatorsMatch[1];
    console.log('解析操作员信息:', { notes, operatorsStr });
    // 按|分割每个操作员信息
    const operatorEntries = operatorsStr.split('|');
    console.log('操作员条目:', operatorEntries);
    operatorEntries.forEach(entry => {
      // 格式：操作员名,日期,数量
      const parts = entry.split(',');
      if (parts.length >= 3) {
        const name = parts[0].trim();
        const date = parts[1].trim();
        const count = parseInt(parts[2].trim(), 10);
        if (!isNaN(count) && name && date) {
          operators.push({ name, date, count });
        }
      }
    });
  }
  
  console.log('解析结果:', operators);
  return operators;
};

export default function InventoryHistoryPage() {
  const [histories, setHistories] = useState<InventoryHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStore, setFilterStore] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterCategory, setFilterCategory] = useState<InventoryCategory | ''>('');
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordToDelete, setPasswordToDelete] = useState('');
  const [recordToDelete, setRecordToDelete] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  // 获取当前用户信息
  const getCurrentUser = useCallback(async () => {
    try {
      const res = await fetch('/api/check-login', { 
        cache: 'no-store',
        credentials: 'include'
      });
      const data = await res.json().catch(() => ({}));
      
      if (res.ok && data.success) {
        setCurrentUser(data.user || null);
      }
    } catch (e) {
      console.warn('获取用户信息失败:', e);
    }
  }, []);

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

  // 显示密码输入对话框（单个删除）
  const showDeletePasswordModal = useCallback((id: number) => {
    setRecordToDelete(id);
    setPasswordToDelete('');
    setShowPasswordModal(true);
  }, []);

  // 显示批量删除密码输入对话框
  const showBatchDeletePasswordModal = useCallback(() => {
    if (selectedIds.size === 0) {
      alert('请先选择要删除的记录');
      return;
    }
    setRecordToDelete(null); // null表示批量删除
    setPasswordToDelete('');
    setShowPasswordModal(true);
  }, [selectedIds]);

  // 验证密码并删除记录（单个或批量）
  const confirmDeleteWithPassword = useCallback(async () => {
    // 确定要删除的ID列表
    const idsToDelete = recordToDelete !== null 
      ? [recordToDelete] // 单个删除
      : Array.from(selectedIds); // 批量删除
    
    if (idsToDelete.length === 0) return;
    
    if (passwordToDelete !== 'u01xhaby') {
      alert('密码错误！');
      return;
    }

    const deleteMessage = idsToDelete.length === 1 
      ? '确定要删除这条记录吗？此操作不可撤销。'
      : `确定要删除选中的 ${idsToDelete.length} 条记录吗？此操作不可撤销。`;

    if (!confirm(deleteMessage)) {
      return;
    }

    setShowPasswordModal(false);
    
    // 批量删除时显示批量删除状态
    if (idsToDelete.length > 1) {
      setIsBatchDeleting(true);
    } else {
      setDeletingId(idsToDelete[0]);
    }
    
    try {
      const idsParam = idsToDelete.join(',');
      const res = await fetch(`/api/inventory-history?ids=${idsParam}&password=${encodeURIComponent(passwordToDelete)}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok || data?.error) {
        throw new Error(data?.error || '删除失败');
      }
      
      // 重新加载历史记录
      await loadHistories();
      
      // 清除选中状态
      setSelectedIds(new Set());
      
      // 显示成功消息
      alert(`成功删除 ${idsToDelete.length} 条记录`);
    } catch (e: any) {
      alert(`删除失败: ${e?.message || '未知错误'}`);
    } finally {
      setDeletingId(null);
      setRecordToDelete(null);
      setIsBatchDeleting(false);
    }
  }, [recordToDelete, selectedIds, passwordToDelete, loadHistories]);

  // 取消删除
  const cancelDelete = useCallback(() => {
    setShowPasswordModal(false);
    setPasswordToDelete('');
    setRecordToDelete(null);
  }, []);

  // 过滤历史记录（使用useMemo以便在toggleSelectAll之前定义）
  const filteredHistories = useMemo(() => {
    return histories.filter(history => {
      const storeMatch = !filterStore || history.store_name.toLowerCase().includes(filterStore.toLowerCase());
      const userMatch = !filterUser || history.user_name.toLowerCase().includes(filterUser.toLowerCase());
      const category = getCategory(history.notes);
      const categoryMatch = !filterCategory || category === filterCategory;
      return storeMatch && userMatch && categoryMatch;
    });
  }, [histories, filterStore, filterUser, filterCategory]);

  // 切换单个记录的选择状态
  const toggleSelectRecord = useCallback((id: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  // 全选/取消全选
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredHistories.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredHistories.map(h => h.id)));
    }
  }, [selectedIds.size, filteredHistories]);

  // 初始化加载
  useEffect(() => {
    loadHistories();
    getCurrentUser();
  }, [loadHistories, getCurrentUser]);

  // 当历史记录更新时，清除已删除记录的选中状态
  useEffect(() => {
    const existingIds = new Set(histories.map(h => h.id));
    setSelectedIds(prev => {
      const newSet = new Set<number>();
      prev.forEach(id => {
        if (existingIds.has(id)) {
          newSet.add(id);
        }
      });
      return newSet;
    });
  }, [histories]);

  // 获取唯一门店列表
  const uniqueStores = [...new Set(histories.map(h => h.store_name))];
  const uniqueUsers = [...new Set(histories.map(h => h.user_name))];

  // 计算每家门店最后一次各类型盘点的时间和数量
  const storeLastInventory = useMemo(() => {
    const storeMap: Record<string, {
      Devices?: { date: string; count: number };
      Parts?: { date: string; count: number };
      Accessories?: { date: string; count: number };
    }> = {};

    // 按门店和类型分组，找出最新的记录
    histories.forEach(history => {
      const category = getCategory(history.notes);
      if (category === 'Unknown') return;

      const storeName = history.store_name;
      if (!storeMap[storeName]) {
        storeMap[storeName] = {};
      }

      const categoryData = storeMap[storeName][category];
      if (!categoryData) {
        // 第一次发现该类型的记录
        storeMap[storeName][category] = {
          date: history.inventory_date,
          count: history.total_devices
        };
      } else {
        // 比较日期，保留最新的
        const currentDate = new Date(history.inventory_date);
        const existingDate = new Date(categoryData.date);
        if (currentDate > existingDate) {
          storeMap[storeName][category] = {
            date: history.inventory_date,
            count: history.total_devices
          };
        }
      }
    });

    return storeMap;
  }, [histories]);

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
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              盘点历史
              {selectedIds.size > 0 && (
                <span style={{ 
                  marginLeft: 12, 
                  fontSize: 14, 
                  fontWeight: 500, 
                  color: '#059669' 
                }}>
                  已选择 {selectedIds.size} 条
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {selectedIds.size > 0 && (
                <button
                  onClick={showBatchDeletePasswordModal}
                  disabled={isBatchDeleting}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: isBatchDeleting ? '#fca5a5' : '#dc2626',
                    color: '#fff',
                    fontWeight: 500,
                    fontSize: 14,
                    cursor: isBatchDeleting ? 'not-allowed' : 'pointer',
                    opacity: isBatchDeleting ? 0.6 : 1,
                  }}
                >
                  {isBatchDeleting ? '删除中...' : `批量删除 (${selectedIds.size})`}
                </button>
              )}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 14, color: '#6b7280' }}>类型:</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value as InventoryCategory | '')}
                style={{
                  padding: '6px 8px',
                  borderRadius: 4,
                  border: '1px solid #e5e7eb',
                  fontSize: 14,
                  minWidth: 120,
                }}
              >
                <option value="">全部类型</option>
                <option value="Devices">设备盘点</option>
                <option value="Parts">零件盘点</option>
                <option value="Accessories">配件盘点</option>
              </select>
            </div>
            <button
              onClick={() => {
                setFilterStore('');
                setFilterUser('');
                setFilterCategory('');
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
            marginBottom: 12,
          }}>
            各门店最后一次盘点统计
          </div>
          {uniqueStores.length === 0 ? (
            <div style={{ fontSize: 14, color: '#6b7280', textAlign: 'center', padding: '20px 0' }}>
              暂无数据
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {uniqueStores.map(store => {
                const storeData = storeLastInventory[store];
                if (!storeData || (Object.keys(storeData).length === 0)) return null;

                return (
                  <div
                    key={store}
                    style={{
                      padding: 12,
                      background: '#f8fafc',
                      borderRadius: 6,
                      border: '1px solid #e5e7eb',
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
                      {store}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {storeData.Devices && (
                        <div style={{ fontSize: 13, color: '#6b7280', display: 'flex', gap: 12 }}>
                          <span style={{ minWidth: 60, fontWeight: 500 }}>设备盘点:</span>
                          <span>{formatDate(storeData.Devices.date)}</span>
                          <span style={{ color: '#059669', fontWeight: 500 }}>数量: {storeData.Devices.count}</span>
                        </div>
                      )}
                      {storeData.Parts && (
                        <div style={{ fontSize: 13, color: '#6b7280', display: 'flex', gap: 12 }}>
                          <span style={{ minWidth: 60, fontWeight: 500 }}>零件盘点:</span>
                          <span>{formatDate(storeData.Parts.date)}</span>
                          <span style={{ color: '#059669', fontWeight: 500 }}>数量: {storeData.Parts.count}</span>
                        </div>
                      )}
                      {storeData.Accessories && (
                        <div style={{ fontSize: 13, color: '#6b7280', display: 'flex', gap: 12 }}>
                          <span style={{ minWidth: 60, fontWeight: 500 }}>配件盘点:</span>
                          <span>{formatDate(storeData.Accessories.date)}</span>
                          <span style={{ color: '#059669', fontWeight: 500 }}>数量: {storeData.Accessories.count}</span>
                        </div>
                      )}
                      {!storeData.Devices && !storeData.Parts && !storeData.Accessories && (
                        <div style={{ fontSize: 13, color: '#9ca3af' }}>暂无盘点记录</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 简化的统计信息 */}
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
            flexWrap: 'wrap',
          }}>
            <span>总记录: {filteredHistories.length}</span>
            <span>设备: {filteredHistories.filter(h => getCategory(h.notes) === 'Devices').length}</span>
            <span>零件: {filteredHistories.filter(h => getCategory(h.notes) === 'Parts').length}</span>
            <span>配件: {filteredHistories.filter(h => getCategory(h.notes) === 'Accessories').length}</span>
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
            {/* 全选控制栏 */}
            {filteredHistories.length > 0 && (
              <div style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                <input
                  type="checkbox"
                  checked={selectedIds.size === filteredHistories.length && filteredHistories.length > 0}
                  onChange={toggleSelectAll}
                  style={{
                    width: 18,
                    height: 18,
                    cursor: 'pointer',
                  }}
                />
                <label style={{ fontSize: 14, color: '#374151', cursor: 'pointer' }} onClick={toggleSelectAll}>
                  全选 ({selectedIds.size}/{filteredHistories.length})
                </label>
                {selectedIds.size > 0 && (
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    style={{
                      marginLeft: 'auto',
                      padding: '4px 8px',
                      borderRadius: 4,
                      border: '1px solid #e5e7eb',
                      background: '#fff',
                      color: '#6b7280',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    取消选择
                  </button>
                )}
              </div>
            )}
            
            {filteredHistories.map((history) => (
              <div
                key={history.id}
                style={{
                  background: '#fff',
                  border: selectedIds.has(history.id) ? '2px solid #059669' : '1px solid #e5e7eb',
                  borderRadius: 8,
                  padding: 16,
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1 }}>
                    {/* 选择框 */}
                    <input
                      type="checkbox"
                      checked={selectedIds.has(history.id)}
                      onChange={() => toggleSelectRecord(history.id)}
                      style={{
                        width: 18,
                        height: 18,
                        marginTop: 2,
                        cursor: 'pointer',
                      }}
                    />
                    <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div style={{ fontWeight: 600, fontSize: 16 }}>
                        {history.store_name}
                      </div>
                      <div style={{ 
                        fontSize: 12, 
                        color: '#fff',
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: getCategory(history.notes) === 'Devices' ? '#3b82f6' : 
                                  getCategory(history.notes) === 'Parts' ? '#059669' : 
                                  getCategory(history.notes) === 'Accessories' ? '#f59e0b' : '#6b7280',
                      }}>
                        {getCategoryName(getCategory(history.notes))}
                      </div>
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
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                    
                    {/* 删除按钮 - 所有人都能看到，但需要密码 */}
                    <button
                      onClick={() => showDeletePasswordModal(history.id)}
                      disabled={deletingId === history.id}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: '1px solid #dc2626',
                        background: deletingId === history.id ? '#fca5a5' : '#fff',
                        color: '#dc2626',
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: deletingId === history.id ? 'not-allowed' : 'pointer',
                        opacity: deletingId === history.id ? 0.6 : 1,
                      }}
                    >
                      {deletingId === history.id ? '删除中...' : '删除'}
                    </button>
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
                  <span>总数量: {history.total_devices}</span>
                  <span>扫码: {history.scan_count}</span>
                  <span>手动: {history.manual_count}</span>
                  <span>耗时: {formatDuration(history.duration_minutes)}</span>
                </div>
                
                {history.notes && (
                  <div style={{
                    marginTop: 12,
                    padding: 12,
                    background: '#f8fafc',
                    borderRadius: 4,
                    fontSize: 14,
                    color: '#6b7280',
                    borderLeft: '3px solid #e5e7eb',
                  }}>
                    {(() => {
                      const operators = parseOperatorDetails(history.notes);
                      const notesWithoutOperators = history.notes.replace(/\s*\|\s*OPERATORS:.*$/, '').trim();
                      
                      return (
                        <>
                          {/* 显示操作员详细信息 */}
                          {operators.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ fontWeight: 500, marginBottom: 8, color: '#374151' }}>操作员盘点详情:</div>
                              {operators.map((op, idx) => (
                                <div key={idx} style={{ marginBottom: 4, paddingLeft: 12 }}>
                                  <span style={{ fontWeight: 500 }}>{op.name}</span>
                                  <span style={{ margin: '0 8px', color: '#9ca3af' }}>·</span>
                                  <span>{op.date}</span>
                                  <span style={{ margin: '0 8px', color: '#9ca3af' }}>·</span>
                                  <span style={{ color: '#059669', fontWeight: 500 }}>盘点{op.count}个</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* 显示其他备注信息（排除OPERATORS部分） */}
                          {notesWithoutOperators && (
                            <div style={{ fontSize: 13, color: '#6b7280', marginTop: operators.length > 0 ? 8 : 0 }}>
                              {notesWithoutOperators}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 密码输入模态框 */}
      {showPasswordModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 12,
            padding: 24,
            minWidth: 320,
            maxWidth: 400,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          }}>
            <h3 style={{
              fontSize: 18,
              fontWeight: 600,
              color: '#111827',
              marginBottom: 16,
              textAlign: 'center',
            }}>
              {recordToDelete !== null ? '确认删除' : `批量删除 (${selectedIds.size} 条)`}
            </h3>
            
            <p style={{
              fontSize: 14,
              color: '#6b7280',
              marginBottom: 20,
              textAlign: 'center',
            }}>
              {recordToDelete !== null 
                ? '请输入删除密码以确认删除此记录'
                : `请输入删除密码以确认删除选中的 ${selectedIds.size} 条记录`}
            </p>
            
            <input
              type="password"
              value={passwordToDelete}
              onChange={(e) => setPasswordToDelete(e.target.value)}
              placeholder="请输入删除密码"
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                fontSize: 14,
                marginBottom: 20,
                boxSizing: 'border-box',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  confirmDeleteWithPassword();
                } else if (e.key === 'Escape') {
                  cancelDelete();
                }
              }}
              autoFocus
            />
            
            <div style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
            }}>
              <button
                onClick={cancelDelete}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  color: '#374151',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                onClick={confirmDeleteWithPassword}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#dc2626',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
