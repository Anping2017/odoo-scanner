'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import Scanner from '@/components/Scanner';

type PartItem = {
  id: number;
  product_id: number;
  product_name: string;
  product_code: string;
  product_barcode: string;
  category_id: number | null;
  category_name: string;
  quantity: number; // 库存数量
  free_quantity: number;
  scan_key: string;
};

type InventoryState = {
  operatorName: string;
  startDate: string; // 盘点开始日期（ISO格式）
  selectedParts: Set<number>;
  inventoryStats: {
    scanCount: number;
    manualCount: number;
    totalCount: number;
  };
  inventoryStartTime: number;
  partsCounts: Record<number, number>; // 记录每个产品的实际盘点数量
  category: 'Parts' | 'Accessories' | 'Devices' | null; // 盘点类别
  totalCount: number; // 总零配件数量
  operatorParts: Record<string, number[]>; // 记录每个操作员盘点的零件ID列表 {操作员名: [零件ID列表]}
  operatorDates: Record<string, string>; // 记录每个操作员最后盘点时的日期 {操作员名: YYYY-MM-DD}
  companyId?: number; // 公司ID，用于检查公司是否变化
  verifyStockQuantity?: boolean; // 是否校验库存数量
};

const STORAGE_KEY = 'parts_inventory_state';

export default function PartsInventoryPage() {
  const [parts, setParts] = useState<PartItem[]>([]);
  const [filteredParts, setFilteredParts] = useState<PartItem[]>([]);
  const [selectedParts, setSelectedParts] = useState<Set<number>>(new Set());
  const [partsCounts, setPartsCounts] = useState<Record<number, number>>({}); // 实际盘点数量
  const [isInventoryMode, setIsInventoryMode] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // 快捷搜索关键词状态（支持多选）
  const [quickSearchTerms, setQuickSearchTerms] = useState<Set<string>>(new Set());
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [apiSearchTerm, setApiSearchTerm] = useState(''); // API搜索词（防抖）
  
  // 操作员信息状态
  const [operatorName, setOperatorName] = useState('');
  const [showOperatorInput, setShowOperatorInput] = useState(false);
  const [isContinueMode, setIsContinueMode] = useState(false); // 是否是继续盘点模式
  const [isJustEnteredInventoryMode, setIsJustEnteredInventoryMode] = useState(false); // 是否刚进入盘点模式（用于避免误触发完成消息）
  const [operatorParts, setOperatorParts] = useState<Record<string, number[]>>({}); // 记录每个操作员盘点的零件ID列表
  const [operatorDates, setOperatorDates] = useState<Record<string, string>>({}); // 记录每个操作员最后盘点时的日期
  const [operatorSuggestions, setOperatorSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  
  // 扫码提示框状态
  const [scanResult, setScanResult] = useState<{
    show: boolean;
    code: string;
    found: boolean;
    partName?: string;
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
    partId: number;
    partName: string;
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

  // 数量输入弹窗状态
  const [showCountInput, setShowCountInput] = useState(false);
  const [currentPartId, setCurrentPartId] = useState<number | null>(null);
  const [inputCount, setInputCount] = useState<string>('');
  const [currentOperationType, setCurrentOperationType] = useState<'scan' | 'manual'>('manual');

  // 扫码完成状态
  const [scanCompleted, setScanCompleted] = useState(false);
  
  // 扫码器重新渲染键
  const [scannerKey, setScannerKey] = useState(0);
  
  // 盘点完成弹窗状态
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [isAutoEnding, setIsAutoEnding] = useState(false); // 标记是否正在自动结束盘点
  
  // 未完成确认弹窗状态
  const [showIncompleteConfirmModal, setShowIncompleteConfirmModal] = useState(false);
  
  // 统计信息状态
  const [inventoryStats, setInventoryStats] = useState({
    scanCount: 0,
    manualCount: 0,
    totalCount: 0
  });
  
  // 盘点开始时间
  const [inventoryStartTime, setInventoryStartTime] = useState<number | null>(null);
  
  // 盘点开始日期（记录开始盘点时的日期，不会因为多次保存而改变）
  const [inventoryStartDate, setInventoryStartDate] = useState<string | null>(null);

  // 类别选择状态
  const [selectedCategory, setSelectedCategory] = useState<'Parts' | 'Accessories' | 'Devices' | null>(null);
  const [showCategorySelection, setShowCategorySelection] = useState(true); // 是否显示类别选择界面
  const [verifyStockQuantity, setVerifyStockQuantity] = useState(false); // 是否校验库存数量

  // 加载零配件列表（支持分页和搜索）
  const loadParts = useCallback(async (page: number, search: string, category: 'Parts' | 'Accessories' | null) => {
    if (!category) {
      return; // 如果没有选择类别，不加载
    }
    
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        category: category, // 添加类别参数
      });
      
      // 解析搜索参数（JSON字符串）
      if (search) {
        try {
          const searchParams = JSON.parse(search);
          if (searchParams.deviceGroup) {
            params.append('deviceGroup', searchParams.deviceGroup);
          }
          if (searchParams.partGroup) {
            params.append('partGroup', searchParams.partGroup);
          }
          if (searchParams.accessoryGroup) {
            params.append('accessoryGroup', searchParams.accessoryGroup);
          }
          if (searchParams.brandGroup) {
            params.append('brandGroup', searchParams.brandGroup);
          }
          if (searchParams.manualSearch) {
            params.append('search', searchParams.manualSearch);
          }
        } catch (e) {
          // 如果不是JSON格式，当作普通搜索词处理
          if (search.trim()) {
            params.append('search', search.trim());
          }
        }
      }
      
      const res = await fetch(`/api/parts-inventory?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok || data?.error) {
        throw new Error(data?.error || '加载失败');
      }
      
      setParts(data.parts || []);
      setFilteredParts(data.parts || []);
      setTotalPages(data.totalPages || 1);
      setTotalCount(data.total || 0);
      console.log('loadParts 更新 totalCount:', { total: data.total, category });
    } catch (e: any) {
      setError(e?.message || '加载零配件列表失败');
    } finally {
      setLoading(false);
    }
  }, [pageSize]); // 只依赖pageSize

  // 显示消息提示
  const showMessage = useCallback((message: string) => {
    setToast({
      show: true,
      message,
      canUndo: false,
    });
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
    
    // 获取当前公司ID
    const currentCompanyId = getCurrentCompanyId();
    
    // 确保当前操作员的盘点记录被更新
    const currentOperatorParts = Array.from(selectedParts);
    const updatedOperatorParts = {
      ...operatorParts, // 保留所有操作员的记录
      [operatorName]: currentOperatorParts // 更新当前操作员的记录
    };
    
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD格式
    const updatedOperatorDates = {
      ...operatorDates, // 保留所有操作员的日期
      [operatorName]: currentDate // 更新当前操作员的日期
    };
    
    const state: InventoryState = {
      operatorName,
      startDate: inventoryStartDate || new Date().toISOString().split('T')[0], // 使用保存的开始日期，如果没有则使用当前日期
      selectedParts: new Set(selectedParts),
      inventoryStats,
      inventoryStartTime,
      partsCounts,
      category: selectedCategory,
      totalCount: totalCount, // 保存总零配件数量
      operatorParts: updatedOperatorParts,
      operatorDates: updatedOperatorDates,
      companyId: currentCompanyId, // 保存当前公司ID
      verifyStockQuantity: verifyStockQuantity // 保存校验库存数量选项
    };

    // 将Set转换为数组以便存储
    const stateToSave = {
      ...state,
      selectedParts: Array.from(state.selectedParts)
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.warn('保存盘点状态失败:', e);
    }
  }, [isInventoryMode, inventoryStartTime, operatorName, selectedParts, inventoryStats, partsCounts, selectedCategory, inventoryStartDate, operatorParts, operatorDates, totalCount, getCurrentCompanyId, verifyStockQuantity]);

  // 开始盘点（选择类别后）
  const handleStartInventory = useCallback(() => {
    if (!selectedCategory) {
      showMessage('请先选择盘点类型');
      return;
    }

    // 如果是设备盘点，跳转到设备盘点页面
    if (selectedCategory === 'Devices') {
      window.location.href = '/device-inventory';
      return;
    }

    // 零件或配件盘点，继续当前流程
    setShowCategorySelection(false);
    setLoading(true);
    // 加载第一页数据
    loadParts(1, '', selectedCategory as 'Parts' | 'Accessories');
  }, [selectedCategory, loadParts, showMessage]);

  // 处理返回按钮
  const handleBack = useCallback(() => {
    if (showCategorySelection) {
      // 如果还在类别选择界面，返回到库存扫码页面
      window.location.href = '/scan';
    } else if (isInventoryMode) {
      // 如果在盘点中，自动保存状态并退出到类别选择界面
      if (confirm('确定要返回吗？盘点进度将自动保存，下次可以继续盘点。')) {
        saveInventoryState();
        setIsInventoryMode(false);
        setScanning(false);
        setShowCategorySelection(true);
        setParts([]);
        setFilteredParts([]);
        setSelectedParts(new Set());
        setSelectedCategory(null);
      }
    } else {
      // 否则返回到类别选择界面
      setShowCategorySelection(true);
      setParts([]);
      setFilteredParts([]);
      setSelectedParts(new Set());
      setSelectedCategory(null);
    }
  }, [showCategorySelection, isInventoryMode, saveInventoryState]);

  // 清除保存的状态（不依赖其他函数，避免循环依赖）
  const clearInventoryStateDirect = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('清除盘点状态失败:', e);
    }
  }, []);

  // 从localStorage加载盘点状态
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
        clearInventoryStateDirect();
        return null;
      }
      
      return {
        ...state,
        selectedParts: new Set(state.selectedParts),
        totalCount: state.totalCount || 0, // 恢复总零配件数量，如果没有则默认为0
        operatorParts: state.operatorParts || {}, // 确保operatorParts存在
        operatorDates: state.operatorDates || {}, // 确保operatorDates存在
        verifyStockQuantity: state.verifyStockQuantity !== undefined ? state.verifyStockQuantity : false // 恢复校验库存数量选项
      };
    } catch (e) {
      console.warn('加载盘点状态失败:', e);
      return null;
    }
  }, [getCurrentCompanyId, clearInventoryStateDirect]);

  // 清除保存的状态
  const clearInventoryState = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      // 同时清除所有相关状态
      setSelectedParts(new Set());
      setPartsCounts({});
      setOperatorParts({});
      setOperatorDates({});
      setInventoryStats({
        scanCount: 0,
        manualCount: 0,
        totalCount: 0
      });
      setOperatorName('');
      setInventoryStartTime(null);
      setInventoryStartDate(null);
      setIsInventoryMode(false);
    } catch (e) {
      console.warn('清除盘点状态失败:', e);
    }
  }, []);

  // 自动保存状态
  useEffect(() => {
    if (isInventoryMode) {
      saveInventoryState();
    }
  }, [isInventoryMode, selectedParts, inventoryStats, partsCounts, saveInventoryState]);

  // 同步更新操作员盘点记录（当selectedParts变化时）
  useEffect(() => {
    if (isInventoryMode && operatorName) {
      const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD格式
      setOperatorParts(prev => ({
        ...prev,
        [operatorName]: Array.from(selectedParts)
      }));
      // 更新操作员最后盘点日期
      setOperatorDates(prev => ({
        ...prev,
        [operatorName]: currentDate
      }));
    }
  }, [isInventoryMode, operatorName, selectedParts]);

  // 本地搜索过滤（仅过滤已选择的产品）
  useEffect(() => {
    const unselectedParts = parts.filter(part => !selectedParts.has(part.id));
    setFilteredParts(unselectedParts);
  }, [parts, selectedParts]);

  // 切换快捷搜索关键词
  const toggleQuickSearch = useCallback((term: string) => {
    setQuickSearchTerms(prev => {
      const newSet = new Set(prev);
      
      // 特殊处理：Back Cover/Glass 对应多个搜索关键词
      if (term === 'Back Cover/Glass') {
        const relatedTerms = ['back cover', 'back glass', 'back glass cover', 'rear cover', 'rear glass'];
        const isAllSelected = relatedTerms.every(t => newSet.has(t));
        
        if (isAllSelected) {
          // 如果都选中了，则全部取消
          relatedTerms.forEach(t => newSet.delete(t));
        } else {
          // 否则全部添加
          relatedTerms.forEach(t => newSet.add(t));
        }
      } else {
        // 普通关键词切换
        if (newSet.has(term)) {
          newSet.delete(term);
        } else {
          newSet.add(term);
        }
      }
      
      return newSet;
    });
  }, []);

  // 组合搜索词：快捷搜索 + 手动输入（防抖处理）
  // 零件类别(Parts)：
  //   第一类：iPhone, iPad, Macbook, Samsung (OR关系)
  //   第二类：Battery, Screen, Charging Port, Back Cover/Glass (OR关系)
  //   第一类和第二类之间是AND关系
  // 配件类别(Accessories)：
  //   第一类：iPhone, iPad, Macbook, Samsung, Oppo, Huawei (OR关系)
  //   第二类：Case, Screen Protector (OR关系)
  //   第三类：Kemeng, OG, DUX DUCIS, Transparent, Silicone (OR关系)
  //   三类之间是AND关系
  useEffect(() => {
    // 构建搜索参数对象
    const searchParams: any = {};
    
    if (selectedCategory === 'Parts') {
      // 零件类别的搜索逻辑
      const deviceTypes = ['iPhone', 'iPad', 'Macbook', 'Samsung'];
      const deviceGroup = Array.from(quickSearchTerms).filter(t => deviceTypes.includes(t));
      
      const partTypes = ['Battery', 'Screen', 'Charging Port', 'Back Cover/Glass'];
      const partGroup = Array.from(quickSearchTerms).filter(t => partTypes.includes(t));
      
      // Back Cover/Glass特殊处理：转换为多个搜索词
      const backCoverTerms = ['back cover', 'back glass', 'back glass cover', 'rear cover', 'rear glass'];
      const hasBackCover = Array.from(quickSearchTerms).some(t => backCoverTerms.includes(t));
      if (hasBackCover) {
        partGroup.push('Back Cover/Glass');
      }
      
      if (deviceGroup.length > 0) {
        searchParams.deviceGroup = deviceGroup.join(',');
      }
      if (partGroup.length > 0) {
        searchParams.partGroup = partGroup.join(',');
      }
    } else if (selectedCategory === 'Accessories') {
      // 配件类别的搜索逻辑
      const deviceTypes = ['iPhone', 'iPad', 'Macbook', 'Samsung', 'Oppo', 'Huawei'];
      const deviceGroup = Array.from(quickSearchTerms).filter(t => deviceTypes.includes(t));
      
      const accessoryTypes = ['Case', 'Screen Protector'];
      const accessoryGroup = Array.from(quickSearchTerms).filter(t => accessoryTypes.includes(t));
      
      const brandTypes = ['Kemeng', 'OG', 'DUX DUCIS', 'Transparent', 'Silicone'];
      const brandGroup = Array.from(quickSearchTerms).filter(t => brandTypes.includes(t));
      
      if (deviceGroup.length > 0) {
        searchParams.deviceGroup = deviceGroup.join(',');
      }
      if (accessoryGroup.length > 0) {
        searchParams.accessoryGroup = accessoryGroup.join(',');
      }
      if (brandGroup.length > 0) {
        searchParams.brandGroup = brandGroup.join(',');
      }
    }
    
    if (searchTerm.trim()) {
      searchParams.manualSearch = searchTerm.trim();
    }
    
    // 防抖处理
    const timer = setTimeout(() => {
      // 将搜索参数转换为字符串（用于触发useEffect）
      const searchString = JSON.stringify(searchParams);
      setApiSearchTerm(searchString);
      setCurrentPage(1); // 搜索时重置到第一页
    }, 500);

    return () => clearTimeout(timer);
  }, [quickSearchTerms, searchTerm, selectedCategory]); // 添加selectedCategory依赖

  // 当搜索词或页码改变时，重新加载数据（只在选择了类别后）
  useEffect(() => {
    if (!showCategorySelection && selectedCategory && (selectedCategory === 'Parts' || selectedCategory === 'Accessories')) {
      loadParts(currentPage, apiSearchTerm, selectedCategory);
    }
  }, [currentPage, apiSearchTerm, pageSize, loadParts, showCategorySelection, selectedCategory]);

  // 页面加载时检查公司ID变化
  useEffect(() => {
    // 检查是否有保存的状态
    const savedState = loadInventoryState();
    if (!savedState) {
      // 如果没有保存的状态或公司ID变化了，清除所有状态
      setSelectedParts(new Set());
      setPartsCounts({});
      setOperatorParts({});
      setSelectedCategory(null);
      setShowCategorySelection(true);
      // 清空产品列表，确保重新加载
      setParts([]);
      setFilteredParts([]);
    }
  }, [loadInventoryState]); // 依赖loadInventoryState，确保公司ID变化时重新检查

  // 保存零配件盘点历史记录
  const savePartsInventoryHistory = useCallback(async () => {
    if (!inventoryStartTime || !operatorName) return;
    
    // 检查是否完成所有盘点（检查所有页面的总数量）
    if (selectedParts.size < totalCount) {
      console.log('盘点未完成，不保存历史记录');
      return;
    }
    
    const durationMinutes = Math.round((Date.now() - inventoryStartTime) / 60000);
    const scanRate = inventoryStats.totalCount > 0 
      ? Math.round((inventoryStats.scanCount / inventoryStats.totalCount) * 100) 
      : 0;
    
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
    
    // 使用保存的开始日期
    const startDate = inventoryStartDate || new Date().toISOString().split('T')[0];
    
    // 转换为Odoo日期时间格式：YYYY-MM-DD HH:MM:SS
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const inventoryDateTime = `${startDate} ${hours}:${minutes}:${seconds}`;
    
    // 构建操作员详细信息
    // 格式：OPERATORS:操作员名1,日期1,数量1|操作员名2,日期2,数量2
    const operatorDetails: string[] = [];
    Object.entries(operatorParts).forEach(([opName, partIds]) => {
      if (Array.isArray(partIds) && partIds.length > 0) {
        const date = operatorDates[opName] || startDate; // 使用操作员的盘点日期，如果没有则使用开始日期
        operatorDetails.push(`${opName},${date},${partIds.length}`);
      }
    });
    
    // 构建notes字段
    let notes = `${selectedCategory === 'Parts' ? 'Parts' : 'Accessories'} | ${selectedCategory === 'Parts' ? '零件' : '配件'}盘点完成`;
    if (operatorDetails.length > 0) {
      notes += ` | OPERATORS:${operatorDetails.join('|')}`;
    }
    
    try {
      const res = await fetch('/api/inventory-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          store_name: storeName,
          user_name: operatorName,
          inventory_date: inventoryDateTime,
          total_devices: selectedParts.size,
          scan_count: inventoryStats.scanCount,
          manual_count: inventoryStats.manualCount,
          scan_rate: scanRate,
          duration_minutes: durationMinutes,
          notes: notes
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok || !data.success) {
        throw new Error(data.error || '保存历史记录失败');
      }
      
      console.log('零配件盘点历史记录已保存:', data.id);
      return true;
    } catch (e: any) {
      console.error('保存零配件盘点历史记录失败:', e);
      showMessage(`保存历史记录失败: ${e.message}`);
      return false;
    }
  }, [inventoryStartTime, operatorName, selectedParts.size, inventoryStats, totalCount, selectedCategory, inventoryStartDate, operatorParts, operatorDates, showMessage]);

  // 结束盘点
  const handleEndInventory = useCallback(() => {
    setIsInventoryMode(false);
    setScanning(false);
    setSelectedParts(new Set());
    setPartsCounts({});
    setFilteredParts(parts);
    setOperatorName('');
    setInventoryStartTime(null);
    setInventoryStartDate(null);
    clearInventoryState();
  }, [parts, clearInventoryState]);

  // 记录操作历史
  const recordOperation = useCallback((type: 'scan' | 'manual', action: 'add' | 'remove', partId: number, partName: string) => {
    const operationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const operation = {
      id: operationId,
      type,
      action,
      partId,
      partName,
      timestamp: Date.now(),
    };
    
    setOperationHistory(prev => [operation, ...prev.slice(0, 9)]);
    
    if (action === 'add') {
      setInventoryStats(prev => ({
        scanCount: type === 'scan' ? prev.scanCount + 1 : prev.scanCount,
        manualCount: type === 'manual' ? prev.manualCount + 1 : prev.manualCount,
        totalCount: prev.totalCount + 1
      }));
    }
    
    const actionText = action === 'add' ? '已盘点' : '已移除';
    const typeText = type === 'scan' ? '扫码' : '手动';
    setToast({
      show: true,
      message: `${typeText}${actionText}: ${partName}`,
      canUndo: true,
      operationId,
    });
  }, []);

  // 直接在添加零件后检查是否完成（用于立即触发）
  const checkAndAutoEnd = useCallback(async (currentSelectedPartsSize?: number) => {
    if (!isInventoryMode || !inventoryStartTime || !operatorName || isAutoEnding || totalCount === 0) {
      return;
    }

    // 使用传入的大小或当前的大小
    const partsSize = currentSelectedPartsSize !== undefined ? currentSelectedPartsSize : selectedParts.size;

    // 检查是否所有零件都已盘点完成
    if (partsSize >= totalCount && partsSize > 0 && totalCount > 0) {
      console.log('立即检查触发自动结束盘点:', { selectedPartsSize: partsSize, totalCount, selectedCategory });
      setIsAutoEnding(true);
      // 延迟一下，确保状态更新完成
      setTimeout(async () => {
        try {
          // 保存历史记录
          await savePartsInventoryHistory();
          setShowCompleteModal(true);
          // 延迟结束，让用户看到完成弹窗
          setTimeout(() => {
            handleEndInventory();
            setIsAutoEnding(false);
          }, 1000);
        } catch (e) {
          console.error('自动结束盘点失败:', e);
          setIsAutoEnding(false);
        }
      }, 500);
    }
  }, [isInventoryMode, selectedParts.size, totalCount, inventoryStartTime, operatorName, savePartsInventoryHistory, handleEndInventory, isAutoEnding, selectedCategory]);

  // 处理数量输入确认
  const handleCountConfirm = useCallback(() => {
    if (!currentPartId) return;

    const count = parseFloat(inputCount);
    if (isNaN(count) || count < 0) {
      showMessage('请输入有效的数量');
      return;
    }

    const part = parts.find(p => p.id === currentPartId);
    if (!part) return;

    // 更新盘点数量
    setPartsCounts(prev => ({
      ...prev,
      [currentPartId]: count
    }));

    // 添加到已盘点列表
    setSelectedParts(prev => {
      const newSet = new Set([...prev, currentPartId]);
      // 添加后立即检查是否完成，传入新的大小
      setTimeout(() => {
        checkAndAutoEnd(newSet.size);
      }, 100);
      return newSet;
    });
    
    // 记录操作（使用当前操作类型）
    recordOperation(currentOperationType, 'add', currentPartId, part.product_name);

    // 清空搜索
    setSearchTerm('');
    
    // 关闭弹窗
    setShowCountInput(false);
    setCurrentPartId(null);
    setInputCount('');
    setCurrentOperationType('manual'); // 重置为默认值
  }, [currentPartId, inputCount, currentOperationType, parts, recordOperation, showMessage, checkAndAutoEnd]);

  // 一键盘点当前页所有未盘点的零件
  const handleQuickInventory = useCallback(() => {
    if (!isInventoryMode) return;
    
    // 获取当前页未盘点的零件
    const unInventoriedParts = filteredParts.filter(part => !selectedParts.has(part.id));
    
    if (unInventoriedParts.length === 0) {
      showMessage('当前页所有零件已盘点完成');
      return;
    }

    // 确认操作
    if (!confirm(`确定要一键盘点当前页的 ${unInventoriedParts.length} 个零件吗？`)) {
      return;
    }

    // 批量添加所有未盘点的零件
    const newSelectedParts = new Set(selectedParts);
    const newPartsCounts = { ...partsCounts };
    const operations: Array<{ type: 'scan' | 'manual'; action: 'add'; partId: number; partName: string }> = [];

    unInventoriedParts.forEach(part => {
      // 添加到已盘点列表
      newSelectedParts.add(part.id);
      
      // 设置数量（使用库存数量作为默认值）
      newPartsCounts[part.id] = part.quantity;
      
      // 记录操作（标记为手动操作）
      operations.push({
        type: 'manual',
        action: 'add',
        partId: part.id,
        partName: part.product_name
      });
    });

    // 批量更新状态
    setSelectedParts(newSelectedParts);
    setPartsCounts(newPartsCounts);

    // 批量更新后立即检查是否完成，传入新的大小
    setTimeout(() => {
      checkAndAutoEnd(newSelectedParts.size);
    }, 100);

    // 批量记录操作并更新统计
    let newManualCount = inventoryStats.manualCount;
    let newTotalCount = inventoryStats.totalCount;
    
    operations.forEach(operation => {
      recordOperation(operation.type, operation.action, operation.partId, operation.partName);
      newManualCount++;
      newTotalCount++;
    });

    setInventoryStats(prev => ({
      scanCount: prev.scanCount,
      manualCount: newManualCount,
      totalCount: newTotalCount
    }));

    showMessage(`已一键盘点 ${unInventoriedParts.length} 个零件`);
  }, [isInventoryMode, filteredParts, selectedParts, partsCounts, inventoryStats, recordOperation, showMessage, checkAndAutoEnd]);

  const addPartDirectly = useCallback((partId: number, operationType: 'scan' | 'manual') => {
    const part = parts.find(p => p.id === partId);
    if (!part) return;

    // 使用默认数量（库存数量）
    setPartsCounts(prev => ({
      ...prev,
      [partId]: part.quantity
    }));

    // 添加到已盘点列表
    setSelectedParts(prev => {
      const newSet = new Set([...prev, partId]);
      // 添加后立即检查是否完成，传入新的大小
      setTimeout(() => {
        checkAndAutoEnd(newSet.size);
      }, 100);
      return newSet;
    });
    
    // 记录操作
    recordOperation(operationType, 'add', partId, part.product_name);

    // 清空搜索
    setSearchTerm('');
  }, [parts, recordOperation, checkAndAutoEnd]);

  // 扫码处理
  const handleDetected = useCallback((code: string) => {
    if (!isInventoryMode) return;
    
    const matchedPart = parts.find(part => 
      part.product_barcode === code || 
      part.product_code === code ||
      part.scan_key === code
    );
    
    if (matchedPart) {
      if (selectedParts.has(matchedPart.id)) {
        showMessage(`零配件 ${matchedPart.product_name} 已盘点，无需重复盘点`);
        setScanCompleted(true);
        return;
      }
      
      // 如果启用了校验库存数量，显示数量输入弹窗；否则直接添加
      if (verifyStockQuantity) {
        setCurrentPartId(matchedPart.id);
        setInputCount(matchedPart.quantity.toString());
        setCurrentOperationType('scan'); // 标记为扫码操作
        setShowCountInput(true);
      } else {
        addPartDirectly(matchedPart.id, 'scan');
      }
      setScanCompleted(true);
    } else {
      showMessage(`扫码未找到零配件: ${code}`);
      setScanCompleted(true);
    }
  }, [isInventoryMode, parts, selectedParts, showMessage, verifyStockQuantity, addPartDirectly]);

  // 手动选择零配件
  const handlePartSelect = useCallback((partId: number) => {
    if (!isInventoryMode) return;
    
    if (selectedParts.has(partId)) {
      return;
    }

    const part = parts.find(p => p.id === partId);
    if (!part) return;

    // 如果启用了校验库存数量，显示数量输入弹窗；否则直接添加
    if (verifyStockQuantity) {
      setCurrentPartId(partId);
      setInputCount(part.quantity.toString());
      setCurrentOperationType('manual'); // 标记为手动操作
      setShowCountInput(true);
    } else {
      addPartDirectly(partId, 'manual');
    }
  }, [isInventoryMode, parts, selectedParts, verifyStockQuantity, addPartDirectly]);

  // 撤销操作
  const undoOperation = useCallback((operationId: string) => {
    const operation = operationHistory.find(op => op.id === operationId);
    if (!operation) return;
    
    if (operation.action === 'add') {
      setSelectedParts(prev => {
        const newSet = new Set(prev);
        newSet.delete(operation.partId);
        return newSet;
      });
      
      setPartsCounts(prev => {
        const newCounts = { ...prev };
        delete newCounts[operation.partId];
        return newCounts;
      });
    }
    
    setOperationHistory(prev => prev.filter(op => op.id !== operationId));
    
    if (operation.action === 'add') {
      setInventoryStats(prev => ({
        scanCount: operation.type === 'scan' ? prev.scanCount - 1 : prev.scanCount,
        manualCount: operation.type === 'manual' ? prev.manualCount - 1 : prev.manualCount,
        totalCount: prev.totalCount - 1
      }));
    }
    
    setToast(prev => ({ 
      ...prev, 
      message: '操作已撤销',
      canUndo: false 
    }));
  }, [operationHistory]);

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

  // 保存操作员活动记录（开始或继续盘点）
  const saveOperatorActivity = useCallback(async (activityType: 'start' | 'continue', operatorName: string, startDate?: string) => {
    try {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const activityDateTime = `${now.toISOString().split('T')[0]} ${hours}:${minutes}:${seconds}`;
      
      const activityData = {
        user_name: operatorName,
        activity_date: activityDateTime,
        activity_type: activityType,
        category: selectedCategory || 'Parts',
        inventory_start_date: startDate || now.toISOString().split('T')[0],
        notes: `${activityType === 'start' ? '开始盘点' : '继续盘点'} - ${selectedCategory || 'Parts'}`
      };

      const res = await fetch('/api/operator-activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(activityData),
      });
      
      const data = await res.json();
      
      if (!res.ok || !data.success) {
        console.warn('保存操作员活动记录失败:', data.error || '保存失败');
        // 不阻止用户继续操作，只记录警告
      } else {
        console.log('操作员活动记录已保存:', data.id);
      }
    } catch (e: any) {
      console.warn('保存操作员活动记录失败:', e);
      // 不阻止用户继续操作，只记录警告
    }
  }, [selectedCategory]);

  // 确认操作员信息并开始盘点
  const handleConfirmOperator = useCallback(async () => {
    if (!operatorName.trim()) {
      showMessage('请输入操作员姓名');
      return;
    }
    
    const formattedOperatorName = operatorName.trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    
    setOperatorName(formattedOperatorName);
    
    // 记录开始日期
    const startDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD格式
    setInventoryStartDate(startDate);
    
    // 保存操作员活动记录（开始盘点）
    await saveOperatorActivity('start', formattedOperatorName, startDate);
    
    setIsInventoryMode(true);
    setIsJustEnteredInventoryMode(true); // 标记刚进入盘点模式
    setScanning(true);
    setSelectedParts(new Set());
    setPartsCounts({});
    setFilteredParts(parts);
    setScanCompleted(false);
    setShowOperatorInput(false);
    
    // 初始化当前操作员的盘点记录
    setOperatorParts({ [formattedOperatorName]: [] });
    
    // 初始化当前操作员的盘点日期
    const currentDate = new Date().toISOString().split('T')[0];
    setOperatorDates({ [formattedOperatorName]: currentDate });
    
    setInventoryStats({
      scanCount: 0,
      manualCount: 0,
      totalCount: 0
    });
    
    setInventoryStartTime(Date.now());
    
    // 保存状态（包含操作员和日期信息）
    const currentCompanyId = getCurrentCompanyId();
    const state: InventoryState = {
      operatorName: formattedOperatorName,
      startDate: startDate,
      selectedParts: new Set(),
      inventoryStats: {
        scanCount: 0,
        manualCount: 0,
        totalCount: 0
      },
      inventoryStartTime: Date.now(),
      partsCounts: {},
      category: selectedCategory,
      operatorParts: { [formattedOperatorName]: [] }, // 初始化当前操作员的盘点记录
      operatorDates: { [formattedOperatorName]: startDate }, // 初始化当前操作员的盘点日期
      totalCount: totalCount, // 保存总零配件数量
      companyId: currentCompanyId,
      verifyStockQuantity: verifyStockQuantity // 保存校验库存数量选项
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...state,
        selectedParts: []
      }));
    } catch (e) {
      console.warn('保存盘点状态失败:', e);
    }
    
    // 延迟重置标志，等待parts和filteredParts更新完成
    setTimeout(() => {
      setIsJustEnteredInventoryMode(false);
    }, 1000);
    
    showMessage(`开始盘点 - 操作员: ${formattedOperatorName}，日期: ${startDate}`);
    console.log('handleConfirmOperator 保存状态:', { totalCount, selectedCategory });
  }, [operatorName, parts, selectedCategory, showMessage, saveOperatorActivity, getCurrentCompanyId, totalCount]);

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
  }, [loadInventoryState, showMessage, loadOperatorSuggestions]);

  // 确认继续盘点时的操作员信息
  const handleConfirmContinueOperator = useCallback(async () => {
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
    
    // 恢复校验库存数量选项
    setVerifyStockQuantity(savedState.verifyStockQuantity !== undefined ? savedState.verifyStockQuantity : false);
    
    // 保存操作员活动记录（继续盘点）
    await saveOperatorActivity('continue', updatedOperatorName, startDate);
    
    setOperatorName(updatedOperatorName);
    setSelectedParts(savedState.selectedParts);
    setPartsCounts(savedState.partsCounts);
    setInventoryStats(savedState.inventoryStats);
    setInventoryStartTime(savedState.inventoryStartTime);
    setInventoryStartDate(startDate);
    
    // 恢复总零配件数量
    setTotalCount(savedState.totalCount || 0);
    
    // 恢复操作员盘点记录
    setOperatorParts(savedState.operatorParts || {});
    
    // 恢复操作员盘点日期
    setOperatorDates(savedState.operatorDates || {});
    
    setIsInventoryMode(true);
    setIsJustEnteredInventoryMode(true); // 标记刚进入盘点模式
    setScanning(true);
    setShowOperatorInput(false);
    setIsContinueMode(false);
    
    // 更新保存的状态，包含新的操作员姓名和公司ID
    const currentCompanyId = getCurrentCompanyId();
    const updatedState: InventoryState = {
      ...savedState,
      operatorName: updatedOperatorName,
      companyId: currentCompanyId, // 更新公司ID
      verifyStockQuantity: savedState.verifyStockQuantity !== undefined ? savedState.verifyStockQuantity : false // 恢复校验库存数量选项
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...updatedState,
        selectedParts: Array.from(updatedState.selectedParts)
      }));
    } catch (e) {
      console.warn('保存盘点状态失败:', e);
    }
    
    // 延迟重置标志，等待parts和filteredParts更新完成
    setTimeout(() => {
      setIsJustEnteredInventoryMode(false);
    }, 1000);
    
    showMessage(`继续盘点 - 操作员: ${updatedOperatorName}，开始日期: ${startDate}，已盘点 ${savedState.selectedParts.size} 个零配件`);
  }, [operatorName, loadInventoryState, showMessage, saveOperatorActivity, getCurrentCompanyId]);

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
  }, [showSuggestions, filteredSuggestions, selectedSuggestionIndex, selectSuggestion, handleConfirmOperator, handleConfirmContinueOperator, isContinueMode]);

  // 开始盘点模式（显示操作员输入框）
  const handleStartInventoryMode = useCallback(() => {
    // 检查是否有保存的状态
    const savedState = loadInventoryState();
    if (savedState) {
      // 显示继续或重新开始的选项
      setIsContinueMode(false); // 开始新盘点
      setShowOperatorInput(true);
      loadOperatorSuggestions();
    } else {
      // 直接显示操作员输入框
      setIsContinueMode(false); // 开始新盘点
      setShowOperatorInput(true);
      loadOperatorSuggestions();
    }
  }, [loadInventoryState, loadOperatorSuggestions]);

  // 重新扫码
  const handleRescan = useCallback(() => {
    setScanning(true);
    setScanCompleted(false);
    setScanResult({ show: false, code: '', found: false });
    setScannerKey(prev => prev + 1);
  }, []);

  // 监听selectedParts变化，检查是否所有零配件都已盘点完成
  // 注意：由于有分页，这里只检查当前页的完成情况
  useEffect(() => {
    // 如果刚进入盘点模式，不显示完成消息（避免继续盘点时误触发）
    if (isJustEnteredInventoryMode) {
      return;
    }
    
    if (isInventoryMode && selectedParts.size > 0 && filteredParts.length === 0 && parts.length > 0) {
      // 当前页所有产品都已盘点，提示用户
      // 需要确保parts已经加载完成（parts.length > 0）
      showMessage('当前页所有零配件已盘点完成');
    }
  }, [isInventoryMode, selectedParts.size, filteredParts.length, parts.length, isJustEnteredInventoryMode, showMessage]);

  // 监听selectedParts变化，检查是否所有页面都已盘点完成，如果完成则自动结束盘点
  useEffect(() => {
    // 如果不在盘点模式，或者没有必要的状态，不检查
    if (!isInventoryMode || !inventoryStartTime || !operatorName || isAutoEnding) {
      return;
    }

    // 如果totalCount为0，可能还没有加载完成，不触发自动结束
    if (totalCount === 0) {
      console.log('totalCount为0，跳过自动结束检查（可能还在加载中）');
      return;
    }

    // 添加调试日志
    console.log('自动结束检查:', {
      isInventoryMode,
      inventoryStartTime: !!inventoryStartTime,
      operatorName,
      totalCount,
      selectedPartsSize: selectedParts.size,
      isAutoEnding,
      selectedCategory
    });

    // 检查是否所有零件都已盘点完成
    if (selectedParts.size >= totalCount && selectedParts.size > 0 && totalCount > 0) {
      console.log('触发自动结束盘点:', { selectedPartsSize: selectedParts.size, totalCount, selectedCategory });
      setIsAutoEnding(true);
      // 延迟一下，确保状态更新完成
      const timer = setTimeout(async () => {
        try {
          // 保存历史记录
          await savePartsInventoryHistory();
          setShowCompleteModal(true);
          // 延迟结束，让用户看到完成弹窗
          setTimeout(() => {
            handleEndInventory();
            setIsAutoEnding(false);
          }, 1000);
        } catch (e) {
          console.error('自动结束盘点失败:', e);
          setIsAutoEnding(false);
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [isInventoryMode, selectedParts.size, totalCount, inventoryStartTime, operatorName, savePartsInventoryHistory, handleEndInventory, isAutoEnding, selectedCategory]);

  // 只在已选择类别且正在加载时显示加载界面
  // 移除全屏加载，改为在列表区域显示加载状态

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
            onClick={loadParts}
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

  // 类别选择界面
  if (showCategorySelection) {
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
            <div style={{ fontWeight: 700, fontSize: 16 }}>库存盘点</div>
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
          </div>
        </div>

        {/* 类别选择内容 */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 16px',
        }}>
          <div style={{
            maxWidth: 500,
            width: '100%',
            background: '#fff',
            borderRadius: 16,
            padding: '32px 24px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          }}>
            <div style={{
              fontSize: 20,
              fontWeight: 600,
              color: '#111827',
              marginBottom: 8,
              textAlign: 'center',
            }}>
              选择盘点类型
            </div>
            <div style={{
              fontSize: 14,
              color: '#6b7280',
              marginBottom: 32,
              textAlign: 'center',
            }}>
              请选择要盘点的类型
            </div>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}>
              {/* Devices选项 */}
              <button
                onClick={() => setSelectedCategory('Devices')}
                style={{
                  padding: '20px 24px',
                  borderRadius: 12,
                  border: selectedCategory === 'Devices' ? '2px solid #059669' : '2px solid #e5e7eb',
                  background: selectedCategory === 'Devices' ? '#ecfdf5' : '#fff',
                  color: selectedCategory === 'Devices' ? '#059669' : '#374151',
                  fontWeight: selectedCategory === 'Devices' ? 600 : 500,
                  fontSize: 16,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                }}
              >
                {selectedCategory === 'Devices' && (
                  <div style={{ fontSize: 20 }}>✓</div>
                )}
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>设备盘点 (Devices)</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    盘点所有设备类产品
                  </div>
                </div>
              </button>

              {/* Accessories选项 */}
              <button
                onClick={() => setSelectedCategory('Accessories')}
                style={{
                  padding: '20px 24px',
                  borderRadius: 12,
                  border: selectedCategory === 'Accessories' ? '2px solid #059669' : '2px solid #e5e7eb',
                  background: selectedCategory === 'Accessories' ? '#ecfdf5' : '#fff',
                  color: selectedCategory === 'Accessories' ? '#059669' : '#374151',
                  fontWeight: selectedCategory === 'Accessories' ? 600 : 500,
                  fontSize: 16,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                }}
              >
                {selectedCategory === 'Accessories' && (
                  <div style={{ fontSize: 20 }}>✓</div>
                )}
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>配件 (Accessories)</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    盘点所有配件类产品
                  </div>
                </div>
              </button>

              {/* Parts选项 */}
              <button
                onClick={() => setSelectedCategory('Parts')}
                style={{
                  padding: '20px 24px',
                  borderRadius: 12,
                  border: selectedCategory === 'Parts' ? '2px solid #059669' : '2px solid #e5e7eb',
                  background: selectedCategory === 'Parts' ? '#ecfdf5' : '#fff',
                  color: selectedCategory === 'Parts' ? '#059669' : '#374151',
                  fontWeight: selectedCategory === 'Parts' ? 600 : 500,
                  fontSize: 16,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                }}
              >
                {selectedCategory === 'Parts' && (
                  <div style={{ fontSize: 20 }}>✓</div>
                )}
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>零件 (Parts)</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    盘点所有零件类产品
                  </div>
                </div>
              </button>
            </div>

            {/* 开始盘点按钮 */}
            <button
              onClick={handleStartInventory}
              disabled={!selectedCategory}
              style={{
                marginTop: 32,
                width: '100%',
                padding: '14px 24px',
                borderRadius: 8,
                border: 'none',
                background: selectedCategory ? '#059669' : '#d1d5db',
                color: '#fff',
                fontWeight: 600,
                fontSize: 16,
                cursor: selectedCategory ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s ease',
              }}
            >
              开始盘点
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* CSS动画样式 */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}} />
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
            零配件盘点 {selectedCategory && `(${selectedCategory === 'Parts' ? '零件' : '配件'})`}
          </div>
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
                  onClick={handleStartInventoryMode}
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
              <>
                <button
                  onClick={async () => {
                    // 检查是否所有页面都已盘点完成（检查所有页面的总数量）
                    if (selectedParts.size >= totalCount && selectedParts.size > 0) {
                      // 保存历史记录
                      await savePartsInventoryHistory();
                      setShowCompleteModal(true);
                      handleEndInventory();
                    } else {
                      setShowIncompleteConfirmModal(true);
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
              </>
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
          <Scanner key={scannerKey} onDetected={handleDetected} />
          </div>
          
          {scanCompleted && (
            <div style={{
              marginTop: 12,
              textAlign: 'center',
            }}>
              <button
                onClick={handleRescan}
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
        {/* 最后零配件警告提示 */}
        {isInventoryMode && (totalCount - selectedParts.size) === 1 && (
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
              还剩最后一个零配件，盘点完成后将自动结束盘点
            </div>
          </div>
        )}
        
        {/* 消息提示框 */}
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
          <div style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            width: '100%',
          }}>
            <input
              type="text"
              placeholder="搜索产品名称、编码或类别..."
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
            {isInventoryMode && (
              <button
                onClick={handleQuickInventory}
                disabled={filteredParts.filter(part => !selectedParts.has(part.id)).length === 0}
                style={{
                  padding: '10px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: filteredParts.filter(part => !selectedParts.has(part.id)).length === 0 ? '#f3f4f6' : '#f59e0b',
                  color: filteredParts.filter(part => !selectedParts.has(part.id)).length === 0 ? '#9ca3af' : '#fff',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: filteredParts.filter(part => !selectedParts.has(part.id)).length === 0 ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'all 0.2s ease',
                }}
              >
                一键盘点
              </button>
            )}
            <button
              onClick={() => {
                setSearchTerm('');
                setQuickSearchTerms(new Set());
              }}
              disabled={!searchTerm && quickSearchTerms.size === 0}
              style={{
                padding: '10px 16px',
                borderRadius: 6,
                border: '1px solid #e5e7eb',
                background: (searchTerm || quickSearchTerms.size > 0) ? '#fff' : '#f9fafb',
                color: (searchTerm || quickSearchTerms.size > 0) ? '#6b7280' : '#d1d5db',
                fontSize: 14,
                cursor: (searchTerm || quickSearchTerms.size > 0) ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              清空
            </button>
          </div>
          
          {/* 校验库存数量选项 - 只在盘点模式下显示 */}
          {isInventoryMode && (
            <div style={{
              padding: '12px',
              background: '#f9fafb',
              borderRadius: 8,
              border: '1px solid #e5e7eb',
            }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
                fontSize: 14,
                color: '#374151',
              }}>
                <input
                  type="checkbox"
                  checked={verifyStockQuantity}
                  onChange={(e) => setVerifyStockQuantity(e.target.checked)}
                  style={{
                    width: 18,
                    height: 18,
                    cursor: 'pointer',
                    accentColor: '#059669',
                  }}
                />
                <div>
                  <div style={{ fontWeight: 500, marginBottom: 2 }}>校验库存数量</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    {verifyStockQuantity 
                      ? '盘点时需要输入实际数量，用于校验库存数量' 
                      : '盘点时直接使用库存数量，无需输入'}
                  </div>
                </div>
              </label>
            </div>
          )}
          
          {/* 快捷搜索按钮 - 根据类别显示不同的快捷搜索 */}
          {selectedCategory && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              width: '100%',
            }}>
              {/* 零件类别(Parts)的快捷搜索 */}
              {selectedCategory === 'Parts' && (
                <>
                  {/* 第一类：设备类型 */}
                  <div style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    width: '100%',
                  }}>
                    <div style={{ fontSize: 12, color: '#6b7280', width: '100%', marginBottom: 4 }}>设备类型：</div>
                    {['iPhone', 'iPad', 'Macbook', 'Samsung'].map((term) => {
                      const isSelected = quickSearchTerms.has(term);
                      return (
                        <button
                          key={term}
                          onClick={() => toggleQuickSearch(term)}
                          style={{
                            padding: '8px 16px',
                            borderRadius: 6,
                            border: isSelected ? '2px solid #059669' : '1px solid #e5e7eb',
                            background: isSelected ? '#ecfdf5' : '#fff',
                            color: isSelected ? '#059669' : '#374151',
                            fontSize: 14,
                            fontWeight: isSelected ? 600 : 500,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            whiteSpace: 'nowrap',
                            flex: '1 1 auto',
                            minWidth: 'fit-content',
                          }}
                        >
                          {term}
                        </button>
                      );
                    })}
                  </div>
                  
                  {/* 第二类：部件类型 */}
                  <div style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    width: '100%',
                  }}>
                    <div style={{ fontSize: 12, color: '#6b7280', width: '100%', marginBottom: 4 }}>部件类型：</div>
                    {['Battery', 'Screen', 'Charging Port', 'Back Cover/Glass'].map((term) => {
                      // 判断Back Cover/Glass是否被选中（检查相关关键词）
                      const isBackCoverSelected = term === 'Back Cover/Glass' 
                        ? ['back cover', 'back glass', 'back glass cover', 'rear cover', 'rear glass'].some(t => quickSearchTerms.has(t))
                        : quickSearchTerms.has(term);
                      
                      return (
                        <button
                          key={term}
                          onClick={() => toggleQuickSearch(term)}
                          style={{
                            padding: '8px 16px',
                            borderRadius: 6,
                            border: isBackCoverSelected ? '2px solid #059669' : '1px solid #e5e7eb',
                            background: isBackCoverSelected ? '#ecfdf5' : '#fff',
                            color: isBackCoverSelected ? '#059669' : '#374151',
                            fontSize: 14,
                            fontWeight: isBackCoverSelected ? 600 : 500,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            whiteSpace: 'nowrap',
                            flex: '1 1 auto',
                            minWidth: 'fit-content',
                          }}
                        >
                          {term}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              
              {/* 配件类别(Accessories)的快捷搜索 */}
              {selectedCategory === 'Accessories' && (
                <>
                  {/* 第一类：设备类型 */}
                  <div style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    width: '100%',
                  }}>
                    <div style={{ fontSize: 12, color: '#6b7280', width: '100%', marginBottom: 4 }}>设备类型：</div>
                    {['iPhone', 'iPad', 'Macbook', 'Samsung', 'Oppo', 'Huawei'].map((term) => {
                      const isSelected = quickSearchTerms.has(term);
                      return (
                        <button
                          key={term}
                          onClick={() => toggleQuickSearch(term)}
                          style={{
                            padding: '8px 16px',
                            borderRadius: 6,
                            border: isSelected ? '2px solid #059669' : '1px solid #e5e7eb',
                            background: isSelected ? '#ecfdf5' : '#fff',
                            color: isSelected ? '#059669' : '#374151',
                            fontSize: 14,
                            fontWeight: isSelected ? 600 : 500,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            whiteSpace: 'nowrap',
                            flex: '1 1 auto',
                            minWidth: 'fit-content',
                          }}
                        >
                          {term}
                        </button>
                      );
                    })}
                  </div>
                  
                  {/* 第二类：配件类型 */}
                  <div style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    width: '100%',
                  }}>
                    <div style={{ fontSize: 12, color: '#6b7280', width: '100%', marginBottom: 4 }}>配件类型：</div>
                    {['Case', 'Screen Protector'].map((term) => {
                      const isSelected = quickSearchTerms.has(term);
                      return (
                        <button
                          key={term}
                          onClick={() => toggleQuickSearch(term)}
                          style={{
                            padding: '8px 16px',
                            borderRadius: 6,
                            border: isSelected ? '2px solid #059669' : '1px solid #e5e7eb',
                            background: isSelected ? '#ecfdf5' : '#fff',
                            color: isSelected ? '#059669' : '#374151',
                            fontSize: 14,
                            fontWeight: isSelected ? 600 : 500,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            whiteSpace: 'nowrap',
                            flex: '1 1 auto',
                            minWidth: 'fit-content',
                          }}
                        >
                          {term}
                        </button>
                      );
                    })}
                  </div>
                  
                  {/* 第三类：品牌/材质 */}
                  <div style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    width: '100%',
                  }}>
                    <div style={{ fontSize: 12, color: '#6b7280', width: '100%', marginBottom: 4 }}>品牌/材质：</div>
                    {['Kemeng', 'OG', 'DUX DUCIS', 'Transparent', 'Silicone'].map((term) => {
                      const isSelected = quickSearchTerms.has(term);
                      return (
                        <button
                          key={term}
                          onClick={() => toggleQuickSearch(term)}
                          style={{
                            padding: '8px 16px',
                            borderRadius: 6,
                            border: isSelected ? '2px solid #059669' : '1px solid #e5e7eb',
                            background: isSelected ? '#ecfdf5' : '#fff',
                            color: isSelected ? '#059669' : '#374151',
                            fontSize: 14,
                            fontWeight: isSelected ? 600 : 500,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            whiteSpace: 'nowrap',
                            flex: '1 1 auto',
                            minWidth: 'fit-content',
                          }}
                        >
                          {term}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        
        {/* 统计信息 */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          fontSize: 14,
          color: '#6b7280',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 12,
        }}>
          <span>总零配件: {totalCount}</span>
          <span>当前页: {filteredParts.length}</span>
          {isInventoryMode && (
            <>
              <span>已选: {selectedParts.size}</span>
              <span style={{ 
                color: inventoryStats.scanCount > inventoryStats.manualCount ? '#059669' : '#dc2626',
                fontWeight: 600
              }}>
                扫码: {inventoryStats.scanCount} | 手动: {inventoryStats.manualCount}
              </span>
            </>
          )}
        </div>

        {/* 分页控件 */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 12,
            flexWrap: 'wrap',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid #d1d5db',
                  background: currentPage === 1 ? '#f9fafb' : '#fff',
                  color: currentPage === 1 ? '#9ca3af' : '#374151',
                  fontSize: 14,
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                }}
              >
                上一页
              </button>
              <span style={{
                fontSize: 14,
                color: '#6b7280',
                minWidth: 120,
                textAlign: 'center',
              }}>
                第 {currentPage} / {totalPages} 页
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid #d1d5db',
                  background: currentPage === totalPages ? '#f9fafb' : '#fff',
                  color: currentPage === totalPages ? '#9ca3af' : '#374151',
                  fontSize: 14,
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                }}
              >
                下一页
              </button>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span style={{ fontSize: 14, color: '#6b7280' }}>每页显示:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* 零配件列表 */}
      <div style={{ flex: 1, padding: '0 16px 16px', overflowY: 'auto' }}>
        {loading ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '60px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 20,
          }}>
            {/* 旋转加载动画 */}
            <div style={{
              width: 48,
              height: 48,
              border: '4px solid #e5e7eb',
              borderTop: '4px solid #059669',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              alignItems: 'center',
            }}>
              <div style={{
                fontSize: 16,
                fontWeight: 500,
                color: '#374151',
                animation: 'pulse 2s ease-in-out infinite',
              }}>
                正在加载零配件列表...
              </div>
              <div style={{
                fontSize: 14,
                color: '#6b7280',
              }}>
                请稍候，这可能需要几秒钟
              </div>
            </div>
          </div>
        ) : filteredParts.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px 20px',
            color: '#6b7280'
          }}>
            {apiSearchTerm ? '未找到匹配的零配件' : '当前页没有零配件'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredParts
              .sort((a, b) => a.product_name.localeCompare(b.product_name))
              .map((part) => (
              <div
                key={part.id}
                onClick={() => handlePartSelect(part.id)}
                style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  padding: 16,
                  cursor: isInventoryMode ? 'pointer' : 'default',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
                      {part.product_name}
                    </div>
                    <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 2 }}>
                      编码: {part.product_code}
                    </div>
                    <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 2 }}>
                      类别: {part.category_name}
                    </div>
                    <div style={{ fontSize: 14, color: '#059669', fontWeight: 500 }}>
                      库存数量: {part.quantity}
                    </div>
                    {selectedParts.has(part.id) && (
                      <div style={{ fontSize: 14, color: '#2563eb', fontWeight: 500, marginTop: 4 }}>
                        已盘点数量: {partsCounts[part.id] || part.quantity}
                      </div>
                    )}
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
                      {selectedParts.has(part.id) && (
                        <div style={{
                          width: 12,
                          height: 12,
                          background: '#059669',
                          borderRadius: 2,
                        }} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* 数量输入弹窗 */}
      {showCountInput && currentPartId && (
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
            <div style={{
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 8,
              color: '#111827',
            }}>
              输入盘点数量
            </div>
            {currentPartId && (
              <div style={{
                fontSize: 14,
                color: '#6b7280',
                marginBottom: 16,
              }}>
                {parts.find(p => p.id === currentPartId)?.product_name}
                <br />
                库存数量: {parts.find(p => p.id === currentPartId)?.quantity}
              </div>
            )}
            <input
              type="number"
              value={inputCount}
              onChange={(e) => setInputCount(e.target.value)}
              placeholder="请输入盘点数量"
              autoFocus
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                fontSize: 16,
                outline: 'none',
                marginBottom: 16,
                boxSizing: 'border-box',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCountConfirm();
                } else if (e.key === 'Escape') {
                  setShowCountInput(false);
                  setCurrentPartId(null);
                  setInputCount('');
                  setCurrentOperationType('manual');
                }
              }}
            />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => {
                  setShowCountInput(false);
                  setCurrentPartId(null);
                  setInputCount('');
                  setCurrentOperationType('manual');
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
                onClick={handleCountConfirm}
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
                确认
              </button>
            </div>
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
              
              const completedCount = savedState.selectedParts.size;
              const savedTotalCount = savedState.totalCount || 0;
              const remainingCount = savedTotalCount - completedCount;
              const progressPercent = savedTotalCount > 0 ? Math.round((completedCount / savedTotalCount) * 100) : 0;
              
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
                    已完成: <span style={{ fontWeight: 600, color: '#059669' }}>{completedCount}</span> 个零配件
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    剩余: <span style={{ fontWeight: 600, color: '#dc2626' }}>{remainingCount}</span> 个零配件
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    总计: <span style={{ fontWeight: 600, color: '#374151' }}>{savedTotalCount}</span> 个零配件
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
                onClick={isContinueMode ? handleConfirmContinueOperator : handleConfirmOperator}
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
                {isContinueMode ? '确认继续' : '确认开始'}
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
            
            <div style={{
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 8,
              color: '#059669',
            }}>
              盘点完成！
            </div>
            
            <div style={{
              fontSize: 14,
              color: '#6b7280',
              marginBottom: 24,
              lineHeight: 1.5,
            }}>
              所有零配件盘点已完成，共盘点 {totalCount} 个零配件
            </div>
            
            <button
              onClick={() => {
                setShowCompleteModal(false);
                handleEndInventory();
              }}
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
            
            <div style={{
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 8,
              color: '#dc2626',
            }}>
              盘点未完成
            </div>
            
            <div style={{
              fontSize: 14,
              color: '#6b7280',
              marginBottom: 24,
              lineHeight: 1.5,
            }}>
              剩余 <span style={{ fontWeight: 600, color: '#dc2626' }}>{totalCount - selectedParts.size}</span> 个零配件未盘点完成。
              <br />
              未完成的盘点不会被记录到历史中。
              <br />
              确认结束盘点吗？
            </div>
            
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
    </>
  );
}

