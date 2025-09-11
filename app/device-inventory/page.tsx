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

  // 扫码处理
  const handleDetected = useCallback((code: string) => {
    if (!isInventoryMode) return;
    
    // 查找匹配的设备
    const matchedDevice = devices.find(device => 
      device.scan_key === code || 
      device.product_barcode === code ||
      device.lot_name === code
    );
    
    if (matchedDevice) {
      setSelectedDevices(prev => new Set([...prev, matchedDevice.id]));
      // 从显示列表中移除
      setFilteredDevices(prev => prev.filter(d => d.id !== matchedDevice.id));
    }
  }, [isInventoryMode, devices]);

  // 手动选择设备
  const handleDeviceSelect = useCallback((deviceId: number) => {
    if (!isInventoryMode) return;
    
    setSelectedDevices(prev => new Set([...prev, deviceId]));
    // 从显示列表中移除
    setFilteredDevices(prev => prev.filter(d => d.id !== deviceId));
  }, [isInventoryMode]);

  // 开始盘点
  const handleStartInventory = useCallback(() => {
    setIsInventoryMode(true);
    setScanning(true);
    setSelectedDevices(new Set());
    setFilteredDevices(devices);
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

      {/* 搜索框 */}
      <div style={{ padding: '16px' }}>
        <input
          type="text"
          placeholder="搜索产品名称、编码、Lot/Serial号或库位..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            fontSize: 14,
            outline: 'none',
          }}
        />
      </div>

      {/* 摄像头区域 - 只在盘点模式下显示 */}
      {isInventoryMode && (
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{
            border: '2px solid #059669',
            borderRadius: 12,
            overflow: 'hidden',
            background: '#000',
            height: scanning ? '200px' : '60px',
            transition: 'height 0.3s ease',
          }}>
          {scanning ? (
            <Scanner onDetected={handleDetected} />
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
          <div style={{ 
            marginTop: 8, 
            fontSize: 12, 
            color: '#6b7280',
            textAlign: 'center'
          }}>
            {scanning ? '扫码选择设备' : '点击重新扫码'}
          </div>
        </div>
      )}

      {/* 统计信息 */}
      <div style={{ padding: '0 16px 16px' }}>
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
            {filteredDevices.map((device) => (
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
                    <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>
                      库位: {device.location_name}
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#6b7280' }}>
                      <span>库存: {device.quantity}</span>
                      <span>可用: {device.available_quantity}</span>
                      <span>预留: {device.reserved_quantity}</span>
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
    </div>
  );
}
