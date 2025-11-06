'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
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

type InventoryState = {
  operatorName: string;
  startDate: string; // 盘点开始日期（ISO格式）
  selectedDevices: Set<number>;
  inventoryStats: {
    scanCount: number;
    manualCount: number;
    totalCount: number;
  };
  inventoryStartTime: number;
  totalDevices: number; // 总设备数量
  operatorParts: Record<string, number[]>; // 记录每个操作员盘点的设备ID列表 {操作员名: [设备ID列表]}
  operatorDates: Record<string, string>; // 记录每个操作员最后盘点时的日期 {操作员名: YYYY-MM-DD}
  operatorStartCounts: Record<string, number>; // 记录每个操作员开始盘点时的设备数量 {操作员名: 开始时的数量}
  companyId?: number; // 公司ID，用于检查公司是否变化
};

const STORAGE_KEY = 'device_inventory_state';

export default function DeviceInventoryPage() {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [filteredDevices, setFilteredDevices] = useState<DeviceItem[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<Set<number>>(new Set());
  const [isInventoryMode, setIsInventoryMode] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // 操作员信息状态
  const [operatorName, setOperatorName] = useState('');
  const [showOperatorInput, setShowOperatorInput] = useState(false);
  const [isContinueMode, setIsContinueMode] = useState(false); // 是否是继续盘点模式
  const [operatorSuggestions, setOperatorSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  
  // 盘点开始日期
  const [inventoryStartDate, setInventoryStartDate] = useState<string | null>(null);
  
  // 操作员盘点记录
  const [operatorParts, setOperatorParts] = useState<Record<string, number[]>>({}); // 记录每个操作员盘点的设备ID列表
  const [operatorDates, setOperatorDates] = useState<Record<string, string>>({}); // 记录每个操作员最后盘点时的日期
  const [operatorStartCounts, setOperatorStartCounts] = useState<Record<string, number>>({}); // 记录每个操作员开始盘点时的设备数量
  
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
  
  // 盘点完成弹窗状态
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  
  // 未完成确认弹窗状态
  const [showIncompleteConfirmModal, setShowIncompleteConfirmModal] = useState(false);
  
  // 统计信息状态
  const [inventoryStats, setInventoryStats] = useState({
    scanCount: 0,    // 扫码选择数量
    manualCount: 0,  // 手动选择数量
    totalCount: 0    // 总选择数量
  });
  
  // 盘点开始时间
  const [inventoryStartTime, setInventoryStartTime] = useState<number | null>(null);

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

  // 获取当前公司ID
  const getCurrentCompanyId = useCallback((): number | undefined => {
    try {
      // 从cookie中获取公司ID
      const cookies = document.cookie.split(';');
      const companyCookie = cookies.find(c => c.trim().startsWith('od_company='));
      if (companyCookie) {
        const companyId = companyCookie.split('=')[1];
        return companyId ? Number(companyId) : undefined;
      }
    } catch (e) {
      console.warn('获取公司ID失败:', e);
    }
    return undefined;
  }, []);

  // 保存盘点状态到localStorage
  const saveInventoryState = useCallback(() => {
    if (!isInventoryMode || !inventoryStartTime) return;
    
    const currentCompanyId = getCurrentCompanyId();
    
    // 确保当前操作员的盘点记录被更新
    const currentOperatorDevices = Array.from(selectedDevices);
    const updatedOperatorParts = {
      ...operatorParts, // 保留所有操作员的记录
      [operatorName]: currentOperatorDevices // 更新当前操作员的记录
    };
    
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD格式
    const updatedOperatorDates = {
      ...operatorDates, // 保留所有操作员的日期
      [operatorName]: currentDate // 更新当前操作员的日期
    };
    
    // 确保operatorStartCounts存在（如果当前操作员没有记录，则保持现有逻辑）
    // 如果当前操作员没有开始数量记录，说明这是第一次保存，应该保持原值（不应覆盖）
    const updatedOperatorStartCounts = {
      ...operatorStartCounts, // 保留所有操作员的开始数量
      // 如果当前操作员没有开始数量记录，不添加（保持原有逻辑，在handleConfirmOperator中已经设置）
    };
    
    const state: InventoryState = {
      operatorName,
      startDate: inventoryStartDate || new Date().toISOString().split('T')[0],
      selectedDevices: new Set(selectedDevices),
      inventoryStats,
      inventoryStartTime: inventoryStartTime || Date.now(),
      totalDevices: devices.length, // 保存总设备数量
      operatorParts: updatedOperatorParts,
      operatorDates: updatedOperatorDates,
      operatorStartCounts: updatedOperatorStartCounts,
      companyId: currentCompanyId
    };

    // 将Set转换为数组以便存储
    const stateToSave = {
      ...state,
      selectedDevices: Array.from(state.selectedDevices)
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.warn('保存盘点状态失败:', e);
    }
  }, [isInventoryMode, inventoryStartTime, operatorName, selectedDevices, inventoryStats, inventoryStartDate, devices.length, operatorParts, operatorDates, operatorStartCounts, getCurrentCompanyId]);

  // 加载盘点状态
  const loadInventoryState = useCallback((): InventoryState | null => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return null;

      const state = JSON.parse(saved);
      
      // 检查公司ID是否变化
      const currentCompanyId = getCurrentCompanyId();
      if (state.companyId !== undefined && currentCompanyId !== undefined && state.companyId !== currentCompanyId) {
        // 公司ID变化了，清除之前的状态
        console.log('公司ID变化，清除之前的状态:', state.companyId, '->', currentCompanyId);
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      
      return {
        ...state,
        selectedDevices: new Set(state.selectedDevices),
        totalDevices: state.totalDevices || 0, // 兼容旧状态，如果没有则默认为0
        operatorParts: state.operatorParts || {}, // 确保operatorParts存在
        operatorDates: state.operatorDates || {}, // 确保operatorDates存在
        operatorStartCounts: state.operatorStartCounts || {} // 确保operatorStartCounts存在
      };
    } catch (e) {
      console.warn('加载盘点状态失败:', e);
      return null;
    }
  }, [getCurrentCompanyId]);

  // 清除保存的状态
  const clearInventoryState = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('清除盘点状态失败:', e);
    }
  }, []);

  // 搜索过滤
  useEffect(() => {
    // 首先排除已选择的设备
    const unselectedDevices = devices.filter(device => !selectedDevices.has(device.id));
    
    if (!searchTerm.trim()) {
      setFilteredDevices(unselectedDevices);
      return;
    }
    
    const filtered = unselectedDevices.filter(device => 
      device.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.product_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.lot_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.location_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredDevices(filtered);
  }, [devices, searchTerm, selectedDevices]);

  // 结束盘点
  const handleEndInventory = useCallback(() => {
    setIsInventoryMode(false);
    setScanning(false);
    setSelectedDevices(new Set());
    setFilteredDevices(devices);
    setOperatorName(''); // 重置操作员名称
    setInventoryStartTime(null); // 重置开始时间
    setInventoryStartDate(null); // 重置开始日期
    setOperatorParts({}); // 清除操作员记录
    setOperatorDates({}); // 清除操作员日期
    setOperatorStartCounts({}); // 清除操作员开始数量记录
    clearInventoryState(); // 清除保存的状态
  }, [devices, clearInventoryState]);

  // 显示消息提示（不支持撤销）
  const showMessage = useCallback((message: string) => {
    setToast({
      show: true,
      message,
      canUndo: false,
    });
  }, []);

  // 保存盘点历史记录
  const saveInventoryHistory = useCallback(async () => {
    if (!inventoryStartTime) return;
    
    // 检查是否完成所有盘点
    if (selectedDevices.size < devices.length) {
      console.log('盘点未完成，不保存历史记录');
      return;
    }
    
    const durationMinutes = Math.round((Date.now() - inventoryStartTime) / 60000);
    const scanRate = inventoryStats.totalCount > 0 ? Math.round((inventoryStats.scanCount / inventoryStats.totalCount) * 100) : 0;
    
    // 获取公司信息
    let storeName = '默认公司';
    
    try {
      const userRes = await fetch('/api/user-info', {
        method: 'GET',
        credentials: 'include',
      });
      
      if (userRes.ok) {
        const userData = await userRes.json();
        if (userData.success) {
          storeName = userData.company_name || '默认公司';
        }
      }
    } catch (e) {
      console.warn('获取公司信息失败，使用默认值:', e);
    }
    
    const historyData = {
      store_name: storeName,
      user_name: operatorName || '', // 使用输入的操作员名称
      inventory_date: new Date().toISOString().replace('T', ' ').replace('Z', '').split('.')[0], // 转换为 Odoo 格式: YYYY-MM-DD HH:MM:SS
      total_devices: devices.length,
      scan_count: inventoryStats.scanCount,
      manual_count: inventoryStats.manualCount,
      scan_rate: scanRate,
      duration_minutes: durationMinutes,
      notes: `Devices | 设备盘点完成，扫码率: ${scanRate}%`
    };

    // 构建操作员详细信息
    // 格式：OPERATORS:操作员名1,日期1,数量1|操作员名2,日期2,数量2
    const operatorDetails: string[] = [];
    
    // 首先从localStorage加载最新的状态，确保获取所有操作员的记录
    const latestSavedState = loadInventoryState();
    let finalOperatorParts = { ...operatorParts };
    let finalOperatorStartCounts = { ...operatorStartCounts };
    let finalOperatorDates = { ...operatorDates };
    
    if (latestSavedState) {
      // 合并保存的状态和当前状态
      finalOperatorParts = {
        ...latestSavedState.operatorParts,
        ...operatorParts,
        [operatorName]: Array.from(selectedDevices) // 确保当前操作员的记录是最新的
      };
      finalOperatorStartCounts = {
        ...latestSavedState.operatorStartCounts,
        ...operatorStartCounts
      };
      finalOperatorDates = {
        ...latestSavedState.operatorDates,
        ...operatorDates,
        [operatorName]: new Date().toISOString().split('T')[0]
      };
    } else {
      // 如果没有保存的状态，使用当前状态
      finalOperatorParts = {
        ...operatorParts,
        [operatorName]: Array.from(selectedDevices)
      };
      finalOperatorDates = {
        ...operatorDates,
        [operatorName]: new Date().toISOString().split('T')[0]
      };
    }
    
    // 确保当前操作员的开始数量被包含
    if (!(operatorName in finalOperatorStartCounts) && finalOperatorStartCounts[operatorName] !== 0) {
      // 计算之前操作员的累计数量：所有之前操作员的设备ID数量（去重）
      const previousDeviceIds = new Set<number>();
      Object.entries(finalOperatorParts).forEach(([opName, deviceIds]) => {
        if (opName !== operatorName && Array.isArray(deviceIds)) {
          deviceIds.forEach(id => previousDeviceIds.add(id));
        }
      });
      finalOperatorStartCounts[operatorName] = previousDeviceIds.size;
    }
    
    // 添加调试日志
    console.log('操作员记录调试:', {
      operatorParts: finalOperatorParts,
      operatorStartCounts: finalOperatorStartCounts,
      operatorDates: finalOperatorDates,
      currentOperator: operatorName,
      selectedDevicesSize: selectedDevices.size,
      latestSavedState: latestSavedState ? '存在' : '不存在'
    });
    
    // 计算每个操作员各自盘点的设备数量
    Object.entries(finalOperatorParts).forEach(([opName, deviceIds]) => {
      if (Array.isArray(deviceIds)) {
        const startCount = finalOperatorStartCounts[opName] ?? 0; // 该操作员开始盘点时的设备数量
        const currentCount = deviceIds.length; // 当前该操作员累计的设备数量
        const operatorCount = currentCount - startCount; // 该操作员实际盘点的设备数量
        
        console.log(`操作员 ${opName}: 开始数量=${startCount}, 当前数量=${currentCount}, 实际盘点=${operatorCount}`);
        
        if (operatorCount > 0) {
          const date = finalOperatorDates[opName] || inventoryStartDate || new Date().toISOString().split('T')[0];
          operatorDetails.push(`${opName},${date},${operatorCount}`);
        }
      }
    });
    
    // 构建notes字段
    let notes = `Devices | 设备盘点完成，扫码率: ${scanRate}%`;
    if (operatorDetails.length > 0) {
      notes += ` | OPERATORS:${operatorDetails.join('|')}`;
    }
    
    const historyDataWithOperators = {
      ...historyData,
      notes: notes
    };

    console.log('准备保存盘点历史:', historyDataWithOperators);

    try {
      const res = await fetch('/api/inventory-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(historyDataWithOperators),
      });
      
      const data = await res.json().catch(() => ({}));
      console.log('保存盘点历史响应:', { status: res.status, data });
      
      if (res.ok && data.success) {
        console.log('盘点历史记录已保存:', data.id);
        showMessage(`盘点历史已保存 (ID: ${data.id})`);
      } else {
        console.error('保存盘点历史失败:', data.error);
        showMessage(`保存失败: ${data.error || '未知错误'}`);
      }
    } catch (e: any) {
      console.error('保存盘点历史失败:', e);
      showMessage(`保存失败: ${e?.message || '网络错误'}`);
    }
  }, [inventoryStartTime, inventoryStats, devices.length, selectedDevices.size, operatorParts, operatorDates, operatorStartCounts, inventoryStartDate, operatorName, showMessage, loadInventoryState]);

  // 自动结束盘点
  const autoEndInventory = useCallback(() => {
    console.log('autoEndInventory 被调用');
    setTimeout(() => {
      console.log('显示完成弹窗');
      setShowCompleteModal(true);
      // 保存盘点历史记录
      saveInventoryHistory();
      // 立即结束盘点，不需要延迟
      handleEndInventory();
    }, 1000); // 延迟1秒让用户看到完成提示
  }, [handleEndInventory, saveInventoryHistory]);

  // 自动保存状态
  useEffect(() => {
    if (isInventoryMode) {
      saveInventoryState();
    }
  }, [isInventoryMode, selectedDevices, inventoryStats, saveInventoryState]);

  // 同步更新操作员盘点记录（当selectedDevices变化时）
  useEffect(() => {
    if (isInventoryMode && operatorName) {
      const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD格式
      setOperatorParts(prev => ({
        ...prev,
        [operatorName]: Array.from(selectedDevices)
      }));
      // 更新操作员最后盘点日期
      setOperatorDates(prev => ({
        ...prev,
        [operatorName]: currentDate
      }));
    }
  }, [isInventoryMode, operatorName, selectedDevices]);

  // 初始化加载
  useEffect(() => {
    loadDevices();
    
    // 检查是否有保存的盘点状态
    const savedState = loadInventoryState();
    if (!savedState) {
      // 如果没有保存的状态，清除所有状态
      setSelectedDevices(new Set());
      setInventoryStats({
        scanCount: 0,
        manualCount: 0,
        totalCount: 0
      });
      setOperatorName('');
      setInventoryStartTime(null);
      setInventoryStartDate(null);
      setOperatorParts({});
      setOperatorDates({});
      setOperatorStartCounts({});
      setIsInventoryMode(false);
    } else {
      // 如果有保存的状态，恢复操作员记录
      setOperatorParts(savedState.operatorParts || {});
      setOperatorDates(savedState.operatorDates || {});
      setOperatorStartCounts(savedState.operatorStartCounts || {});
    }
  }, [loadDevices, loadInventoryState]);

  // 监听selectedDevices变化，检查是否所有设备都已盘点完成
  useEffect(() => {
    // 只有在盘点模式下，且已选择的设备数量等于总设备数量时，才认为盘点完成
    if (isInventoryMode && selectedDevices.size > 0 && selectedDevices.size === devices.length) {
      console.log('useEffect检测到所有设备盘点完成');
      autoEndInventory();
    }
  }, [isInventoryMode, selectedDevices.size, devices.length, autoEndInventory]);

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
    
    // 更新统计信息（只统计添加操作）
    if (action === 'add') {
      setInventoryStats(prev => ({
        scanCount: type === 'scan' ? prev.scanCount + 1 : prev.scanCount,
        manualCount: type === 'manual' ? prev.manualCount + 1 : prev.manualCount,
        totalCount: prev.totalCount + 1
      }));
    }
    
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

  // 扫码处理
  const handleDetected = useCallback((code: string) => {
    if (!isInventoryMode) return;
    
    // 查找匹配的设备 - 只根据Lot/Serial Number匹配
    const matchedDevice = devices.find(device => 
      device.lot_name === code
    );
    
    if (matchedDevice) {
      // 检查设备是否已被选择
      if (selectedDevices.has(matchedDevice.id)) {
        showMessage(`设备 ${matchedDevice.product_name} 已盘点，无需重复盘点`);
        setScanCompleted(true);
        return;
      }
      
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
  }, [isInventoryMode, devices, selectedDevices, showMessage, recordOperation]);

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
      // 撤销添加：从已选择中移除
      // filteredDevices 会通过搜索过滤逻辑自动更新
      setSelectedDevices(prev => {
        const newSet = new Set(prev);
        newSet.delete(operation.deviceId);
        return newSet;
      });
    } else {
      // 撤销移除：重新添加到已选择中
      // filteredDevices 会通过搜索过滤逻辑自动更新
      setSelectedDevices(prev => new Set([...prev, operation.deviceId]));
    }
    
    // 从历史中移除这个操作
    setOperationHistory(prev => prev.filter(op => op.id !== operationId));
    
    // 更新统计信息（撤销添加操作时减少计数）
    if (operation.action === 'add') {
      setInventoryStats(prev => ({
        scanCount: operation.type === 'scan' ? prev.scanCount - 1 : prev.scanCount,
        manualCount: operation.type === 'manual' ? prev.manualCount - 1 : prev.manualCount,
        totalCount: prev.totalCount - 1
      }));
    }
    
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
    
    // 检查设备是否已被选择
    if (selectedDevices.has(deviceId)) {
      return; // 如果已选择，不重复选择
    }
    
    setSelectedDevices(prev => new Set([...prev, deviceId]));
    // 清空搜索栏，返回所有剩余列表
    setSearchTerm('');
    // 记录操作
    recordOperation('manual', 'add', deviceId, device.product_name);
  }, [isInventoryMode, devices, selectedDevices, recordOperation]);

  // 获取历史操作员姓名
  const loadOperatorSuggestions = useCallback(async () => {
    try {
      const res = await fetch('/api/operator-names', {
        method: 'GET',
        credentials: 'include',
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setOperatorSuggestions(data.operators || []);
        }
      }
    } catch (e) {
      console.warn('获取历史操作员姓名失败:', e);
    }
  }, []);

  // 过滤操作员建议
  const filteredSuggestions = useMemo(() => {
    if (!operatorName.trim()) return operatorSuggestions;
    return operatorSuggestions.filter(name => 
      name.toLowerCase().includes(operatorName.toLowerCase())
    );
  }, [operatorSuggestions, operatorName]);

  // 处理操作员输入变化
  const handleOperatorNameChange = useCallback((value: string) => {
    setOperatorName(value);
    setShowSuggestions(value.trim().length > 0);
    setSelectedSuggestionIndex(-1);
  }, []);

  // 选择建议
  const selectSuggestion = useCallback((suggestion: string) => {
    setOperatorName(suggestion);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
  }, []);

  // 确认操作员信息并开始盘点
  const handleConfirmOperator = useCallback(() => {
    if (!operatorName.trim()) {
      showMessage('请输入操作员姓名');
      return;
    }
    
    // 处理操作员姓名：首字母大写
    const formattedOperatorName = operatorName.trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    
    // 保存格式化后的操作员姓名
    setOperatorName(formattedOperatorName);
    
    // 记录开始日期
    const startDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD格式
    setInventoryStartDate(startDate);
    
    setIsInventoryMode(true);
    setScanning(true);
    setSelectedDevices(new Set());
    setFilteredDevices(devices);
    setScanCompleted(false); // 重置扫码完成状态
    setShowOperatorInput(false); // 隐藏操作员输入框
    
    // 重置统计信息
    setInventoryStats({
      scanCount: 0,
      manualCount: 0,
      totalCount: 0
    });
    
    // 记录开始时间
    const startTime = Date.now();
    setInventoryStartTime(startTime);
    
    // 初始化当前操作员的盘点记录
    setOperatorParts({ [formattedOperatorName]: [] });
    
    // 初始化当前操作员的盘点日期
    setOperatorDates({ [formattedOperatorName]: startDate });
    
    // 初始化当前操作员的开始数量（0，因为这是第一个操作员）
    setOperatorStartCounts({ [formattedOperatorName]: 0 });
    
    // 保存状态
    const currentCompanyId = getCurrentCompanyId();
    const state: InventoryState = {
      operatorName: formattedOperatorName,
      startDate: startDate,
      selectedDevices: new Set(),
      inventoryStats: {
        scanCount: 0,
        manualCount: 0,
        totalCount: 0
      },
      inventoryStartTime: startTime,
      totalDevices: devices.length, // 保存总设备数量
      operatorParts: { [formattedOperatorName]: [] }, // 初始化当前操作员的盘点记录
      operatorDates: { [formattedOperatorName]: startDate }, // 初始化当前操作员的盘点日期
      operatorStartCounts: { [formattedOperatorName]: 0 }, // 初始化当前操作员的开始数量（0）
      companyId: currentCompanyId
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...state,
        selectedDevices: []
      }));
    } catch (e) {
      console.warn('保存盘点状态失败:', e);
    }
    
    showMessage(`开始盘点 - 操作员: ${formattedOperatorName}`);
  }, [operatorName, devices, showMessage, getCurrentCompanyId]);
  
  // 继续之前的盘点
  const handleContinueInventory = useCallback(() => {
    const savedState = loadInventoryState();
    if (!savedState) {
      showMessage('未找到保存的盘点状态');
      return;
    }

    // 显示操作员输入弹窗，设置为继续盘点模式
    setIsContinueMode(true);
    setOperatorName(''); // 清空操作员姓名，要求重新输入
    setShowOperatorInput(true);
    loadOperatorSuggestions();
    
    // 保存状态到组件状态，以便在弹窗中显示
    // 我们可以通过全局变量或者状态来传递，这里使用useState会更合适
    // 但为了简单，我们可以在弹窗中再次调用loadInventoryState
  }, [loadInventoryState, showMessage, loadOperatorSuggestions]);

  // 确认继续盘点时的操作员信息
  const handleConfirmContinueOperator = useCallback(() => {
    if (!operatorName.trim()) {
      showMessage('请输入操作员姓名');
      return;
    }
    
    const savedState = loadInventoryState();
    if (!savedState) {
      showMessage('未找到保存的盘点状态');
      return;
    }
    
    const formattedOperatorName = operatorName.trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    
    // 更新操作员姓名（可能是不同的人继续盘点）
    const updatedOperatorName = formattedOperatorName;
    
    // 恢复开始日期（使用保存的开始日期，不是当前日期）
    const startDate = savedState.startDate || new Date().toISOString().split('T')[0];
    
    // 计算当前操作员开始盘点时的设备数量（之前操作员已盘点的设备）
    const previousDevicesCount = savedState.selectedDevices.size;
    
    setOperatorName(updatedOperatorName);
    setSelectedDevices(savedState.selectedDevices);
    setInventoryStats(savedState.inventoryStats);
    setInventoryStartTime(savedState.inventoryStartTime);
    setInventoryStartDate(startDate);
    
    // 恢复操作员盘点记录（保留之前操作员的记录）
    setOperatorParts(savedState.operatorParts || {});
    
    // 恢复操作员盘点日期（保留之前操作员的日期）
    setOperatorDates(savedState.operatorDates || {});
    
    // 恢复操作员开始数量（保留之前操作员的开始数量）
    setOperatorStartCounts(savedState.operatorStartCounts || {});
    
    // 初始化当前操作员的盘点记录（从之前的设备数量开始）
    // 记录当前操作员开始盘点时的设备数量（之前操作员已盘点的数量）
    setOperatorParts(prev => ({
      ...prev,
      [updatedOperatorName]: Array.from(savedState.selectedDevices) // 当前操作员开始时继承之前的设备列表
    }));
    
    // 记录当前操作员开始盘点时的设备数量
    setOperatorStartCounts(prev => ({
      ...prev,
      [updatedOperatorName]: previousDevicesCount // 记录当前操作员开始盘点时的设备数量
    }));
    
    setIsInventoryMode(true);
    setScanning(true);
    setShowOperatorInput(false);
    setIsContinueMode(false);
    
    // 更新保存的状态，包含新的操作员姓名和公司ID
    const currentCompanyId = getCurrentCompanyId();
    const updatedState: InventoryState = {
      ...savedState,
      operatorName: updatedOperatorName,
      companyId: currentCompanyId,
      operatorParts: {
        ...(savedState.operatorParts || {}),
        [updatedOperatorName]: Array.from(savedState.selectedDevices) // 初始化当前操作员的记录
      },
      operatorStartCounts: {
        ...(savedState.operatorStartCounts || {}),
        [updatedOperatorName]: previousDevicesCount // 记录当前操作员开始盘点时的设备数量
      }
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...updatedState,
        selectedDevices: Array.from(updatedState.selectedDevices)
      }));
    } catch (e) {
      console.warn('保存盘点状态失败:', e);
    }
    
    showMessage(`继续盘点 - 操作员: ${updatedOperatorName}，开始日期: ${startDate}，已盘点 ${savedState.selectedDevices.size} 个设备`);
  }, [operatorName, loadInventoryState, showMessage, getCurrentCompanyId]);

  // 处理键盘事件
  const handleOperatorKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showSuggestions || filteredSuggestions.length === 0) {
      if (e.key === 'Enter') {
        if (isContinueMode) {
          handleConfirmContinueOperator();
        } else {
          handleConfirmOperator();
        }
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev < filteredSuggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev > 0 ? prev - 1 : filteredSuggestions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedSuggestionIndex >= 0) {
          selectSuggestion(filteredSuggestions[selectedSuggestionIndex]);
        } else {
          if (isContinueMode) {
            handleConfirmContinueOperator();
          } else {
            handleConfirmOperator();
          }
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedSuggestionIndex(-1);
        break;
    }
  }, [showSuggestions, filteredSuggestions, selectedSuggestionIndex, selectSuggestion, isContinueMode, handleConfirmOperator, handleConfirmContinueOperator]);

  // 开始盘点
  const handleStartInventory = useCallback(() => {
    // 显示操作员输入框并加载历史操作员姓名
    setShowOperatorInput(true);
    loadOperatorSuggestions();
  }, [loadOperatorSuggestions]);

  // 重新扫码
  const handleRescan = useCallback(() => {
    setScanning(true);
  }, []);

  // 返回库存盘点页面
  const handleBack = useCallback(() => {
    if (isInventoryMode) {
      // 如果正在盘点，保存状态并确认
      if (confirm('确定要返回吗？盘点进度将自动保存，下次可以继续盘点。')) {
        saveInventoryState();
        window.location.href = '/parts-inventory';
      }
    } else {
      // 如果不在盘点模式，直接返回库存盘点页面
      window.location.href = '/parts-inventory';
    }
  }, [isInventoryMode, saveInventoryState]);

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
            <button
              onClick={() => window.location.href = '/inventory-history'}
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
              盘点历史
            </button>
            {!isInventoryMode ? (
              <>
                {loadInventoryState() && (
                  <button
                    onClick={handleContinueInventory}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#3b82f6',
                      color: '#fff',
                      fontWeight: 500,
                      fontSize: 14,
                    }}
                  >
                    继续盘点
                  </button>
                )}
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
              </>
            ) : (
              <button
                onClick={() => {
                  // 检查是否完成所有盘点
                  if (selectedDevices.size < devices.length) {
                    // 未完成，显示确认对话框
                    setShowIncompleteConfirmModal(true);
                  } else {
                    // 已完成，直接保存并结束
                    setShowCompleteModal(true);
                    saveInventoryHistory();
                    handleEndInventory();
                  }
                }}
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
        {/* 最后设备警告提示 */}
        {isInventoryMode && (devices.length - selectedDevices.size) === 1 && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <div style={{
              fontSize: 16,
              color: '#dc2626',
            }}>
              ⚠️
            </div>
            <div style={{
              fontSize: 14,
              color: '#dc2626',
              fontWeight: 500,
              flex: 1,
            }}>
              还剩最后一个设备，盘点完成后将自动结束盘点
            </div>
          </div>
        )}
        
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
          flexDirection: 'column',
          gap: 12,
          marginBottom: 12,
        }}>
          {/* 搜索框和清空按钮行 */}
          <div style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            width: '100%',
          }}>
            <input
              type="text"
              placeholder="搜索产品名称、编码或Lot/Serial号..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: 1,
                minWidth: 0,
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
                padding: '10px 16px',
                borderRadius: 6,
                border: '1px solid #e5e7eb',
                background: searchTerm ? '#fff' : '#f9fafb',
                color: searchTerm ? '#6b7280' : '#d1d5db',
                fontSize: 14,
                cursor: searchTerm ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              清空
            </button>
          </div>
          
          {/* 快捷搜索按钮 */}
          <div style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            width: '100%',
          }}>
            <button
              onClick={() => setSearchTerm(searchTerm === 'iPhone' ? '' : 'iPhone')}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid #e5e7eb',
                background: searchTerm === 'iPhone' ? '#eff6ff' : '#fff',
                color: searchTerm === 'iPhone' ? '#2563eb' : '#374151',
                fontSize: 14,
                fontWeight: searchTerm === 'iPhone' ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
                flex: '1 1 auto',
                minWidth: 'fit-content',
              }}
            >
              iPhone
            </button>
            <button
              onClick={() => setSearchTerm(searchTerm === 'iPad' ? '' : 'iPad')}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid #e5e7eb',
                background: searchTerm === 'iPad' ? '#eff6ff' : '#fff',
                color: searchTerm === 'iPad' ? '#2563eb' : '#374151',
                fontSize: 14,
                fontWeight: searchTerm === 'iPad' ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
                flex: '1 1 auto',
                minWidth: 'fit-content',
              }}
            >
              iPad
            </button>
            <button
              onClick={() => setSearchTerm(searchTerm === 'Samsung' ? '' : 'Samsung')}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid #e5e7eb',
                background: searchTerm === 'Samsung' ? '#eff6ff' : '#fff',
                color: searchTerm === 'Samsung' ? '#2563eb' : '#374151',
                fontSize: 14,
                fontWeight: searchTerm === 'Samsung' ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
                flex: '1 1 auto',
                minWidth: 'fit-content',
              }}
            >
              Samsung
            </button>
          </div>
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
          {isInventoryMode && (
            <>
              <span>已选: {selectedDevices.size}</span>
              <span style={{ 
                color: inventoryStats.scanCount > inventoryStats.manualCount ? '#059669' : '#dc2626',
                fontWeight: 600
              }}>
                扫码: {inventoryStats.scanCount} | 手动: {inventoryStats.manualCount}
              </span>
              <span style={{ 
                color: filteredDevices.length === 1 ? '#dc2626' : '#6b7280',
                fontWeight: filteredDevices.length === 1 ? 600 : 400
              }}>
                进度: {Math.round((selectedDevices.size / devices.length) * 100)}%
              </span>
            </>
          )}
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
      
      {/* 操作员输入弹窗 */}
      {showOperatorInput && (
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
            textAlign: 'center',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          }}>
            <h3 style={{
              margin: '0 0 16px 0',
              fontSize: 18,
              fontWeight: 600,
              color: '#111827',
            }}>
              {isContinueMode ? '继续盘点' : '请输入操作员姓名'}
            </h3>
            
            {isContinueMode && (() => {
              const savedState = loadInventoryState();
              if (!savedState) return null;
              
              const completedCount = savedState.selectedDevices.size;
              const totalCount = savedState.totalDevices || devices.length;
              const remainingCount = totalCount - completedCount;
              const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
              
              return (
                <div style={{
                  fontSize: 14,
                  color: '#6b7280',
                  marginBottom: 16,
                  textAlign: 'left',
                  padding: '12px',
                  background: '#f8fafc',
                  borderRadius: 8,
                }}>
                  <div style={{ marginBottom: 8, fontWeight: 500, color: '#374151' }}>
                    上次盘点进度
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    已完成: <span style={{ fontWeight: 600, color: '#059669' }}>{completedCount}</span> 个设备
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    剩余: <span style={{ fontWeight: 600, color: '#dc2626' }}>{remainingCount}</span> 个设备
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    总计: <span style={{ fontWeight: 600, color: '#374151' }}>{totalCount}</span> 个设备
                  </div>
                  <div style={{ 
                    marginTop: 8, 
                    paddingTop: 8, 
                    borderTop: '1px solid #e5e7eb',
                    fontSize: 13,
                    color: '#9ca3af'
                  }}>
                    进度: {progressPercent}%
                  </div>
                  <div style={{ 
                    marginTop: 8, 
                    fontSize: 13, 
                    color: '#6b7280' 
                  }}>
                    请输入操作员姓名以继续之前的盘点
                  </div>
                </div>
              );
            })()}
            
            <div style={{ position: 'relative', marginBottom: 20 }}>
              <input
                type="text"
                value={operatorName}
                onChange={(e) => handleOperatorNameChange(e.target.value)}
                onKeyDown={handleOperatorKeyDown}
                placeholder="请输入操作员姓名"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  fontSize: 16,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                autoFocus
              />
              
              {/* 自动完成建议列表 */}
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: '#fff',
                  border: '1px solid #d1d5db',
                  borderTop: 'none',
                  borderRadius: '0 0 8px 8px',
                  maxHeight: 200,
                  overflowY: 'auto',
                  zIndex: 1000,
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}>
                  {filteredSuggestions.map((suggestion, index) => (
                    <div
                      key={suggestion}
                      onClick={() => selectSuggestion(suggestion)}
                      style={{
                        padding: '8px 16px',
                        cursor: 'pointer',
                        backgroundColor: index === selectedSuggestionIndex ? '#f3f4f6' : 'transparent',
                        borderBottom: index < filteredSuggestions.length - 1 ? '1px solid #f3f4f6' : 'none',
                      }}
                      onMouseEnter={() => setSelectedSuggestionIndex(index)}
                    >
                      {suggestion}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => {
                  setShowOperatorInput(false);
                  setIsContinueMode(false);
                  setOperatorName('');
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
                onClick={() => {
                  if (isContinueMode) {
                    handleConfirmContinueOperator();
                  } else {
                    handleConfirmOperator();
                  }
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#059669',
                  color: '#fff',
                  fontWeight: 500,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                {isContinueMode ? '继续盘点' : '确认开始'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 盘点完成弹窗 */}
      {showCompleteModal && (
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
            textAlign: 'center',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          }}>
            {/* 成功图标 */}
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <div style={{
                fontSize: 32,
                color: '#fff',
              }}>
                ✓
              </div>
            </div>
            
            {/* 标题 */}
            <div style={{
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 8,
              color: '#059669',
            }}>
              盘点完成！
            </div>
            
            {/* 内容 */}
            <div style={{
              fontSize: 14,
              color: '#6b7280',
              marginBottom: 24,
              lineHeight: 1.5,
            }}>
              所有设备盘点已完成，共盘点 {devices.length} 个设备
            </div>
            
            {/* 统计信息 */}
            <div style={{
              background: '#f8fafc',
              borderRadius: 8,
              padding: 16,
              marginBottom: 24,
              border: '1px solid #e5e7eb',
            }}>
              <div style={{
                fontSize: 16,
                fontWeight: 600,
                color: '#374151',
                marginBottom: 12,
                textAlign: 'center',
              }}>
                盘点统计
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}>
                <span style={{ color: '#6b7280' }}>扫码选择:</span>
                <span style={{ fontWeight: 600, color: '#059669' }}>{inventoryStats.scanCount}</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}>
                <span style={{ color: '#6b7280' }}>手动选择:</span>
                <span style={{ fontWeight: 600, color: '#dc2626' }}>{inventoryStats.manualCount}</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderTop: '1px solid #e5e7eb',
                paddingTop: 8,
              }}>
                <span style={{ color: '#374151', fontWeight: 600 }}>总计:</span>
                <span style={{ fontWeight: 600, color: '#374151' }}>{inventoryStats.totalCount}</span>
              </div>
              {inventoryStats.totalCount > 0 && (
                <div style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: '#6b7280',
                  textAlign: 'center',
                }}>
                  扫码率: {Math.round((inventoryStats.scanCount / inventoryStats.totalCount) * 100)}%
                </div>
              )}
            </div>
            
            {/* 按钮 */}
            <button
              onClick={() => setShowCompleteModal(false)}
              style={{
                padding: '12px 24px',
                borderRadius: 8,
                border: 'none',
                background: '#059669',
                color: '#fff',
                fontWeight: 500,
                fontSize: 16,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              确定
            </button>
          </div>
        </div>
      )}
      
      {/* 未完成确认弹窗 */}
      {showIncompleteConfirmModal && (
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
            textAlign: 'center',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          }}>
            {/* 警告图标 */}
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: '#fef2f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <div style={{
                fontSize: 32,
                color: '#dc2626',
              }}>
                ⚠️
              </div>
            </div>
            
            {/* 标题 */}
            <div style={{
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 8,
              color: '#dc2626',
            }}>
              盘点未完成
            </div>
            
            {/* 内容 */}
            <div style={{
              fontSize: 14,
              color: '#6b7280',
              marginBottom: 24,
              lineHeight: 1.5,
            }}>
              您还有 <span style={{ fontWeight: 600, color: '#dc2626' }}>{devices.length - selectedDevices.size}</span> 个设备未盘点完成。
              <br />
              未完成的盘点不会被记录到历史中。
              <br />
              确认结束盘点吗？
            </div>
            
            {/* 按钮 */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => setShowIncompleteConfirmModal(false)}
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  color: '#374151',
                  fontWeight: 500,
                  fontSize: 16,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                取消
              </button>
              <button
                onClick={() => {
                  // 确认结束，但不保存历史
                  setShowIncompleteConfirmModal(false);
                  handleEndInventory();
                  showMessage('盘点已结束（未完成，未记录历史）');
                }}
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#dc2626',
                  color: '#fff',
                  fontWeight: 500,
                  fontSize: 16,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                确认结束
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
