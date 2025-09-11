'use client';

import { useCallback, useEffect, useState } from 'react';
import Scanner from '@/components/Scanner';

type DeviceItem = {
  id: number;
  product_id: number;
  product_name: string;
  product_code: string;
  product_barcode: string;
  lot_id: number;
  lot_name: string;
  lot_ref: string;
  location_id: number;
  location_name: string;
  location_complete_name: string;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  scan_key: string;
};

export default function DeviceInventoryPage() {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [filteredDevices, setFilteredDevices] = useState<DeviceItem[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<Set<number>>(new Set());
  const [isInventoryMode, setIsInventoryMode] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // 扫码提示框状态
  const [scanResult, setScanResult] = useState<{
    show: boolean;
    code: string;
    found: boolean;
    deviceName?: string;
  }>({
    show: false,
    code: '',
    found: false,
  });

  // 操作历史状态
  const [operationHistory, setOperationHistory] = useState<Array<{
    id: string;
    type: 'scan' | 'manual';
    action: 'add' | 'remove';
    deviceId: number;
    deviceName: string;
    timestamp: number;
  }>>([]);
  
  // 提示框状态
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    canUndo: boolean;
    operationId?: string;
  }>({
    show: false,
    message: '',
    canUndo: false,
  });

  // 扫码完成状态
  const [scanCompleted, setScanCompleted] = useState(false);
  
  // 扫码器重新渲染键
  const [scannerKey, setScannerKey] = useState(0);

  // 加载设备列表
  const loadDevices = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/device-inventory', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok || data?.error) {
        throw new Error(data?.error || '加载失败');
      }
      
      setDevices(data.devices || []);
      setFilteredDevices(data.devices || []);
    } catch (e: any) {
      setError(e?.message || '加载设备列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 搜索过滤
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredDevices(devices);
      return;
    }
    
    const filtered = devices.filter(device => 
      device.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.product_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.lot_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.location_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredDevices(filtered);
  }, [devices, searchTerm]);

  // 初始化加载
  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  // 记录操作历史
  const recordOperation = useCallback((type: 'scan' | 'manual', action: 'add' | 'remove', deviceId: number, deviceName: string) => {
    const operationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const operation = {
      id: operationId,
      type,
      action,
      deviceId,
      deviceName,
      timestamp: Date.now(),
    };
    
    setOperationHistory(prev => [operation, ...prev.slice(0, 9)]); // 保留最近10条记录
    
    // 显示提示
    const actionText = action === 'add' ? '已盘点' : '已移除';
    const typeText = type === 'scan' ? '扫码' : '手动';
    setToast({
      show: true,
      message: `${typeText}${actionText}: ${deviceName}`,
      canUndo: true,
      operationId,
    });
  }, [devices]);

  // 显示消息提示（不支持撤销）
  const showMessage = useCallback((message: string) => {
    setToast({
      show: true,
      message,
      canUndo: false,
    });
  }, []);

  // 扫码处理
  const handleDetected = useCallback((code: string) => {
    if (!isInventoryMode) return;
    
    // 查找匹配的设备 - 只根据Lot/Serial Number匹配
    const matchedDevice = devices.find(device => 
      device.lot_name === code
    );
    
    if (matchedDevice) {
      // 显示找到设备的提示
      setScanResult({
        show: true,
        code,
        found: true,
        deviceName: matchedDevice.product_name,
      });
      
      // 延迟执行选择操作，让用户看到提示
      setTimeout(() => {
        setSelectedDevices(prev => new Set([...prev, matchedDevice.id]));
        // 从显示列表中移除
        setFilteredDevices(prev => prev.filter(d => d.id !== matchedDevice.id));
        // 记录操作
        recordOperation('scan', 'add', matchedDevice.id, matchedDevice.product_name);
        // 隐藏提示框
        setScanResult(prev => ({ ...prev, show: false }));
        // 设置扫码完成状态
        setScanCompleted(true);
      }, 1500);
    } else {
      // 在操作提示框中显示未找到设备的消息
      showMessage(`扫码未找到设备: ${code}`);
      // 设置扫码完成状态
      setScanCompleted(true);
    }
  }, [isInventoryMode, devices, showMessage]);

  // 处理扫码提示框按钮
  const handleScanResultAction = useCallback(() => {
    if (scanResult.found) {
      // 找到设备：继续扫码
      setScanResult({ show: false, code: '', found: false });
    } else {
      // 未找到设备：重新扫码
      setScanResult({ show: false, code: '', found: false });
    }
  }, [scanResult]);

  // 撤销操作
  const undoOperation = useCallback((operationId: string) => {
    const operation = operationHistory.find(op => op.id === operationId);
    if (!operation) return;
    
    const device = devices.find(d => d.id === operation.deviceId);
    if (!device) return;
    
    if (operation.action === 'add') {
      // 撤销添加：从已选择中移除，重新显示在列表中
      setSelectedDevices(prev => {
        const newSet = new Set(prev);
        newSet.delete(operation.deviceId);
        return newSet;
      });
      setFilteredDevices(prev => [...prev, device]);
    } else {
      // 撤销移除：重新添加到已选择中，从列表中移除
      setSelectedDevices(prev => new Set([...prev, operation.deviceId]));
      setFilteredDevices(prev => prev.filter(d => d.id !== operation.deviceId));
    }
    
    // 从历史中移除这个操作
    setOperationHistory(prev => prev.filter(op => op.id !== operationId));
    
    // 更新提示框消息
    setToast(prev => ({ 
      ...prev, 
      message: '操作已撤销',
      canUndo: false 
    }));
  }, [operationHistory, devices]);

  // 手动选择设备
  const handleDeviceSelect = useCallback((deviceId: number) => {
    if (!isInventoryMode) return;
    
    const device = devices.find(d => d.id === deviceId);
    if (!device) return;
    
    setSelectedDevices(prev => new Set([...prev, deviceId]));
    // 从显示列表中移除
    setFilteredDevices(prev => prev.filter(d => d.id !== deviceId));
    // 记录操作
    recordOperation('manual', 'add', deviceId, device.product_name);
  }, [isInventoryMode, devices, recordOperation]);

  // 开始盘点
  const handleStartInventory = useCallback(() => {
    setIsInventoryMode(true);
    setScanning(true);
    setSelectedDevices(new Set());
    setFilteredDevices(devices);
    setScanCompleted(false); // 重置扫码完成状态
  }, [devices]);

  // 结束盘点
  const handleEndInventory = useCallback(() => {
    setIsInventoryMode(false);
    setScanning(false);
    setSelectedDevices(new Set());
    setFilteredDevices(devices);
  }, [devices]);

  // 重新扫码
  const handleRescan = useCallback(() => {
    setScanning(true);
  }, []);

  // 返回主页
  const handleBack = useCallback(() => {
    window.location.href = '/scan';
  }, []);

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
          <div style={{ fontSize: 18, color: '#6b7280' }}>加载设备列表中...</div>
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
            onClick={loadDevices}
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
          <div style={{ fontWeight: 700, fontSize: 16 }}>设备盘点</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleBack}
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
            {!isInventoryMode ? (
              <button
                onClick={handleStartInventory}
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
                开始盘点
              </button>
            ) : (
              <button
                onClick={handleEndInventory}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#dc2626',
                  color: '#fff',
                  fontWeight: 500,
                  fontSize: 14,
                }}
              >
                结束盘点
              </button>
            )}
          </div>
        </div>
      </div>


      {/* 摄像头区域 - 只在盘点模式下显示 */}
      {isInventoryMode && (
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{
            border: '2px solid #059669',
            borderRadius: 12,
            overflow: 'hidden',
            background: '#000',
            height: scanning ? '250px' : '60px',
            transition: 'height 0.3s ease',
          }}>
          {scanning ? (
            <Scanner key={scannerKey} onDetected={handleDetected} />
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#fff',
                fontSize: 16,
              }}
            >
              摄像头已暂停
            </div>
          )}
          </div>
          
          {/* 重新扫码按钮 - 条件显示 */}
          {scanCompleted && (
            <div style={{
              marginTop: 12,
              textAlign: 'center',
            }}>
              <button
                onClick={() => {
                  setScanning(true);
                  setScanCompleted(false);
                  // 重置扫码结果状态
                  setScanResult({ show: false, code: '', found: false });
                  // 强制重新渲染扫码器
                  setScannerKey(prev => prev + 1);
                }}
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
              >
                重新扫码
              </button>
            </div>
          )}
        </div>
      )}

      {/* 搜索区域和统计信息 */}
      <div style={{ padding: '0 16px 16px', marginTop: 24 }}>
        {/* 消息提示框 - 在手动搜索上方 */}
        {toast.show && (
          <div style={{
            background: '#fff',
            borderRadius: 8,
            padding: '12px 16px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e5e7eb',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <div style={{
              fontSize: 14,
              color: '#374151',
              flex: 1,
              fontWeight: 500,
            }}>
              {toast.message}
            </div>
            {toast.canUndo && (
              <button
                onClick={() => toast.operationId && undoOperation(toast.operationId)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  color: '#374151',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                撤销
              </button>
            )}
          </div>
        )}
        
        {/* 手动搜索 */}
        <div style={{
          fontSize: 14,
          fontWeight: 500,
          color: '#374151',
          marginBottom: 8,
        }}>
          手动搜索
        </div>
        <div style={{ 
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          marginBottom: 12,
        }}>
          <input
            type="text"
            placeholder="搜索产品名称、编码或Lot/Serial号..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: 200,
              padding: '10px 12px',
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              fontSize: 14,
              outline: 'none',
            }}
          />
          <button
            onClick={() => setSearchTerm('')}
            disabled={!searchTerm}
            style={{
              padding: '10px 12px',
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              background: searchTerm ? '#fff' : '#f9fafb',
              color: searchTerm ? '#6b7280' : '#d1d5db',
              fontSize: 14,
              cursor: searchTerm ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
            }}
          >
            清空
          </button>
        </div>
        
        {/* 统计信息 */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          fontSize: 14,
          color: '#6b7280'
        }}>
          <span>总设备: {devices.length}</span>
          <span>剩余: {filteredDevices.length}</span>
          {isInventoryMode && <span>已选: {selectedDevices.size}</span>}
        </div>
      </div>

      {/* 设备列表 */}
      <div style={{ flex: 1, padding: '0 16px 16px' }}>
        {filteredDevices.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px 20px',
            color: '#6b7280'
          }}>
            {isInventoryMode ? '所有设备已盘点完成' : '没有找到设备'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredDevices
              .sort((a, b) => a.product_name.localeCompare(b.product_name))
              .map((device) => (
              <div
                key={device.id}
                style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  padding: 16,
                  cursor: isInventoryMode ? 'pointer' : 'default',
                  transition: 'all 0.2s ease',
                  ...(isInventoryMode && {
                    ':hover': {
                      borderColor: '#059669',
                      boxShadow: '0 2px 4px rgba(5, 150, 105, 0.1)',
                    }
                  })
                }}
                onClick={() => handleDeviceSelect(device.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
                      {device.product_name}
                    </div>
                    <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 2 }}>
                      编码: {device.product_code}
                    </div>
                    <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 2 }}>
                      Lot/Serial: {device.lot_name}
                    </div>
                  </div>
                  {isInventoryMode && (
                    <div style={{
                      width: 20,
                      height: 20,
                      border: '2px solid #e5e7eb',
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <div style={{
                        width: 12,
                        height: 12,
                        background: '#059669',
                        borderRadius: 2,
                        opacity: 0,
                        transition: 'opacity 0.2s ease',
                      }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* 扫码提示框 */}
      {scanResult.show && (
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
            maxWidth: 400,
            width: '90%',
            textAlign: 'center',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          }}>
            {/* 图标 */}
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: scanResult.found ? '#10b981' : '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <div style={{
                fontSize: 32,
                color: '#fff',
              }}>
                {scanResult.found ? '✓' : '✗'}
              </div>
            </div>
            
            {/* 标题 */}
            <div style={{
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 8,
              color: scanResult.found ? '#059669' : '#dc2626',
            }}>
              {scanResult.found ? '设备已找到' : '未找到设备'}
            </div>
            
            {/* 扫码值 */}
            <div style={{
              fontSize: 14,
              color: '#6b7280',
              marginBottom: 8,
              wordBreak: 'break-all',
            }}>
              扫码值：{scanResult.code}
            </div>
            
            {/* 设备名称（如果找到） */}
            {scanResult.found && scanResult.deviceName && (
              <div style={{
                fontSize: 16,
                fontWeight: 500,
                color: '#374151',
                marginBottom: 16,
              }}>
                {scanResult.deviceName}
              </div>
            )}
            
            {/* 按钮 */}
            <button
              onClick={handleScanResultAction}
              style={{
                padding: '12px 24px',
                borderRadius: 8,
                border: 'none',
                background: scanResult.found ? '#059669' : '#dc2626',
                color: '#fff',
                fontWeight: 500,
                fontSize: 16,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {scanResult.found ? '继续扫码' : '重新扫码'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
