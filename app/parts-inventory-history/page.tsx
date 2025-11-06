'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';

type PartsInventoryHistory = {
  id: number;
  store_name: string;
  user_name: string;
  inventory_date: string;
  total_devices: number; // 对于零配件盘点，这里存储的是total_parts
  scan_count: number;
  manual_count: number;
  scan_rate: number;
  duration_minutes: number;
  notes?: string;
  create_date: string;
};

export default function PartsInventoryHistoryPage() {
  const [histories, setHistories] = useState<PartsInventoryHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStore, setFilterStore] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordToDelete, setPasswordToDelete] = useState('');
  const [recordToDelete, setRecordToDelete] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set()); // 批量选择的ID集合
  const [isBatchDelete, setIsBatchDelete] = useState(false); // 是否是批量删除模式
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set()); // 正在删除的ID集合

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
      const res = await fetch('/api/parts-inventory-history', { 
        cache: 'no-store',
        credentials: 'include'
      });
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok || data?.error) {
        throw new Error(data?.error || '加载失败');
      }
      
      // 过滤只显示零配件盘点记录（通过notes字段判断）
      const partsHistories = (data.histories || []).filter((h: any) => 
        h.notes && (h.notes.includes('零件盘点完成') || h.notes.includes('配件盘点完成') || h.notes.includes('Parts') || h.notes.includes('Accessories'))
      );
      
      setHistories(partsHistories);
    } catch (e: any) {
      setError(e?.message || '加载历史记录失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 显示密码输入对话框（单个删除）
  const showDeletePasswordModal = useCallback((id: number) => {
    setRecordToDelete(id);
    setIsBatchDelete(false);
    setPasswordToDelete('');
    setShowPasswordModal(true);
  }, []);

  // 显示密码输入对话框（批量删除）
  const showBatchDeletePasswordModal = useCallback(() => {
    if (selectedIds.size === 0) {
      alert('请先选择要删除的记录');
      return;
    }
    setRecordToDelete(null);
    setIsBatchDelete(true);
    setPasswordToDelete('');
    setShowPasswordModal(true);
  }, [selectedIds]);

  // 验证密码并删除记录
  const confirmDeleteWithPassword = useCallback(async () => {
    if (passwordToDelete !== 'u01xhaby') {
      alert('密码错误！');
      return;
    }

    // 确定要删除的ID列表
    const idsToDelete = isBatchDelete ? Array.from(selectedIds) : (recordToDelete ? [recordToDelete] : []);
    
    if (idsToDelete.length === 0) {
      return;
    }

    const confirmMessage = isBatchDelete 
      ? `确定要删除选中的 ${idsToDelete.length} 条记录吗？此操作不可撤销。`
      : '确定要删除这条记录吗？此操作不可撤销。';

    if (!confirm(confirmMessage)) {
      return;
    }

    setShowPasswordModal(false);
    
    if (isBatchDelete) {
      setDeletingIds(new Set(idsToDelete));
    } else {
      setDeletingId(recordToDelete);
    }
    
    try {
      // 批量删除或单个删除
      let apiUrl: string;
      if (isBatchDelete) {
        // 批量删除：使用ids参数
        const idsParam = idsToDelete.map(id => `ids=${id}`).join('&');
        apiUrl = `/api/parts-inventory-history?${idsParam}&password=${encodeURIComponent(passwordToDelete)}`;
      } else {
        // 单个删除：使用id参数（向后兼容）
        apiUrl = `/api/parts-inventory-history?id=${idsToDelete[0]}&password=${encodeURIComponent(passwordToDelete)}`;
      }
      
      const res = await fetch(apiUrl, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok || !data.success) {
        throw new Error(data?.error || '删除失败');
      }
      
      // 重新加载列表
      await loadHistories();
      // 清空选择
      setSelectedIds(new Set());
      
      const successMessage = isBatchDelete 
        ? `成功删除 ${idsToDelete.length} 条记录！`
        : '删除成功！';
      alert(successMessage);
    } catch (e: any) {
      alert(`删除失败: ${e?.message || '未知错误'}`);
    } finally {
      setDeletingId(null);
      setDeletingIds(new Set());
      setRecordToDelete(null);
    }
  }, [passwordToDelete, recordToDelete, isBatchDelete, selectedIds, loadHistories]);

  // 过滤历史记录
  const filteredHistories = useMemo(() => {
    return histories.filter(h => {
      if (filterStore && !h.store_name.toLowerCase().includes(filterStore.toLowerCase())) {
        return false;
      }
      if (filterUser && !h.user_name.toLowerCase().includes(filterUser.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [histories, filterStore, filterUser]);

  // 切换单个记录的选中状态
  const toggleSelect = useCallback((id: number) => {
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

  useEffect(() => {
    getCurrentUser();
    loadHistories();
  }, [getCurrentUser, loadHistories]);

  // 格式化日期时间
  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  // 解析类别（从notes字段）
  const getCategory = (notes?: string) => {
    if (!notes) return '零件';
    if (notes.includes('配件') || notes.includes('Accessories')) return '配件';
    return '零件';
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
        <div style={{ fontSize: 16, color: '#6b7280' }}>加载中...</div>
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
          <div style={{ fontWeight: 700, fontSize: 16 }}>零配件盘点历史</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => window.location.href = '/parts-inventory'}
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
          </div>
        </div>
      </div>

      {/* 筛选区域 */}
      <div style={{
        padding: '16px',
        background: '#fff',
        borderBottom: '1px solid #e5e7eb',
      }}>
        <div style={{ 
          display: 'flex', 
          gap: 12, 
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          <input
            type="text"
            placeholder="筛选门店..."
            value={filterStore}
            onChange={(e) => setFilterStore(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              fontSize: 14,
              minWidth: 150,
            }}
          />
          <input
            type="text"
            placeholder="筛选操作员..."
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              fontSize: 14,
              minWidth: 150,
            }}
          />
          <div style={{ 
            marginLeft: 'auto',
            fontSize: 14,
            color: '#6b7280',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <span>共 {filteredHistories.length} 条记录</span>
            {selectedIds.size > 0 && (
              <>
                <span style={{ color: '#2563eb', fontWeight: 600 }}>
                  已选择 {selectedIds.size} 条
                </span>
                <button
                  onClick={showBatchDeletePasswordModal}
                  disabled={deletingIds.size > 0}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: 'none',
                    background: deletingIds.size > 0 ? '#f3f4f6' : '#dc2626',
                    color: deletingIds.size > 0 ? '#9ca3af' : '#fff',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: deletingIds.size > 0 ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {deletingIds.size > 0 ? '删除中...' : `批量删除 (${selectedIds.size})`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 历史记录列表 */}
      <div style={{ padding: '16px' }}>
        {filteredHistories.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: '#6b7280',
            fontSize: 16,
          }}>
            暂无历史记录
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* 全选控制栏 */}
            <div style={{
              background: '#fff',
              borderRadius: 8,
              padding: '12px 16px',
              border: '1px solid #e5e7eb',
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
              <span style={{ fontSize: 14, color: '#374151', fontWeight: 500 }}>
                全选
              </span>
              {selectedIds.size > 0 && (
                <span style={{ fontSize: 14, color: '#6b7280', marginLeft: 'auto' }}>
                  已选择 {selectedIds.size} / {filteredHistories.length} 条
                </span>
              )}
            </div>
            {filteredHistories.map((history) => (
              <div
                key={history.id}
                style={{
                  background: '#fff',
                  borderRadius: 8,
                  padding: '16px',
                  border: selectedIds.has(history.id) ? '2px solid #2563eb' : '1px solid #e5e7eb',
                  boxShadow: selectedIds.has(history.id) ? '0 2px 8px rgba(37, 99, 235, 0.2)' : '0 1px 3px rgba(0, 0, 0, 0.1)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(history.id)}
                      onChange={() => toggleSelect(history.id)}
                      disabled={deletingId === history.id || deletingIds.has(history.id)}
                      style={{
                        width: 18,
                        height: 18,
                        cursor: (deletingId === history.id || deletingIds.has(history.id)) ? 'not-allowed' : 'pointer',
                        marginTop: 2,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ 
                          fontSize: 16, 
                          fontWeight: 600, 
                          color: '#111827',
                        }}>
                          {getCategory(history.notes)}盘点
                        </div>
                        <div style={{ 
                          fontSize: 12, 
                          color: '#6b7280',
                          padding: '2px 8px',
                          background: '#f3f4f6',
                          borderRadius: 4,
                        }}>
                          ID: {history.id}
                        </div>
                      </div>
                      <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 4 }}>
                        门店: {history.store_name || '-'}
                      </div>
                      <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 4 }}>
                        操作员: {history.user_name || '-'}
                      </div>
                      <div style={{ fontSize: 14, color: '#6b7280' }}>
                        盘点时间: {formatDateTime(history.inventory_date)}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => showDeletePasswordModal(history.id)}
                    disabled={deletingId === history.id || deletingIds.has(history.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: '1px solid #dc2626',
                      background: (deletingId === history.id || deletingIds.has(history.id)) ? '#f3f4f6' : '#fff',
                      color: (deletingId === history.id || deletingIds.has(history.id)) ? '#9ca3af' : '#dc2626',
                      fontSize: 12,
                      cursor: (deletingId === history.id || deletingIds.has(history.id)) ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {(deletingId === history.id || deletingIds.has(history.id)) ? '删除中...' : '删除'}
                  </button>
                </div>
                
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                  gap: 12,
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: '1px solid #f3f4f6',
                }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>已盘点</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: '#059669' }}>
                      {history.total_devices || 0}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>扫码</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: '#2563eb' }}>
                      {history.scan_count || 0}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>手动</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: '#7c3aed' }}>
                      {history.manual_count || 0}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>扫码率</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: '#059669' }}>
                      {history.scan_rate || 0}%
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>耗时</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: '#6b7280' }}>
                      {history.duration_minutes || 0}分钟
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 密码输入对话框 */}
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
          zIndex: 9999,
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 12,
            padding: 24,
            maxWidth: 400,
            width: '90%',
          }}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
              {isBatchDelete ? `批量删除 - 请输入删除密码` : '请输入删除密码'}
            </div>
            {isBatchDelete && (
              <div style={{ 
                fontSize: 14, 
                color: '#6b7280', 
                marginBottom: 16,
                padding: '12px',
                background: '#f3f4f6',
                borderRadius: 6,
              }}>
                将删除选中的 {selectedIds.size} 条记录
              </div>
            )}
            <input
              type="password"
              value={passwordToDelete}
              onChange={(e) => setPasswordToDelete(e.target.value)}
              placeholder="请输入密码"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                fontSize: 14,
                marginBottom: 16,
                boxSizing: 'border-box',
              }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  confirmDeleteWithPassword();
                }
              }}
            />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordToDelete('');
                  setRecordToDelete(null);
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  color: '#374151',
                  fontWeight: 500,
                  fontSize: 14,
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
                  fontWeight: 500,
                  fontSize: 14,
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

