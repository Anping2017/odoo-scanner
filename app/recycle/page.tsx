'use client';

import { useCallback, useState } from 'react';

type DeviceInfo = {
  deviceType: string;
  brand: string;
  brandDescription: string;
  model: string;
  serialNumber: string;
  imei: string;
  color: string;
  storage: string;
  accessories: string[];
  batteryHealth: string;
  memory: string;
  memorySize: string;
  screenSize: string;
  simCardType: string;
  networkType: string;
  releaseYear: string;
  cpuDescription: string;
  cpuCount: string;
  cpuModel: string;
  cpuSpeed: string;
  memoryType: string;
  storageType: string;
  storageSize: string;
  gpu: string;
  deviceDescription: string;
};

type UserInfo = {
  customerName: string;
  phone: string;
  email: string;
  address: string;
  idNumber: string;
  idType: string;
  idDescription: string;
  bankType: string;
  otherBankName: string;
  accountName: string;
  accountNumber: string;
  transferNote: string;
};

type InspectionInfo = {
  store: string;
  operator: string;
  replacementParts: string[];
  estimatedValue: string;
  notes: string;
  condition: string;
  partDescription: string;
};

export default function DeviceRecyclePage() {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({
    deviceType: '',
    brand: '',
    brandDescription: '',
    model: '',
    serialNumber: '',
    imei: '',
    color: '',
    storage: '',
    accessories: [],
    batteryHealth: '',
    memory: '',
    memorySize: '',
    screenSize: '',
    simCardType: '',
    networkType: '',
    releaseYear: '',
    cpuDescription: '',
    cpuCount: '',
    cpuModel: '',
    cpuSpeed: '',
    memoryType: '',
    storageType: '',
    storageSize: '',
    gpu: '',
    deviceDescription: ''
  });

  const [userInfo, setUserInfo] = useState<UserInfo>({
    customerName: '',
    phone: '',
    email: '',
    address: '',
    idNumber: '',
    idType: '',
    idDescription: '',
    bankType: '',
    otherBankName: '',
    accountName: '',
    accountNumber: '',
    transferNote: ''
  });

  const [inspectionInfo, setInspectionInfo] = useState<InspectionInfo>({
    store: '',
    operator: '',
    replacementParts: [],
    estimatedValue: '',
    notes: '',
    condition: '',
    partDescription: ''
  });

  const [currentStep, setCurrentStep] = useState(1);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderInfo, setOrderInfo] = useState<{purchaseOrderId?: number, orderLineId?: number} | null>(null);

  const deviceTypes = ['手机', '平板', '笔记本', '其他'];
  const brands = ['苹果', '三星', '华为', '小米', 'OPPO', 'vivo', '联想', '戴尔', '惠普', '华硕', '其他'];
  const conditions = ['几乎全新', '轻微磨损', '需要维修', '拆配件'];
  const idTypes = ['护照', '驾驶证', '其他'];
  const stores = ['Moboplus', 'Birkenhead', 'BrownsBay', 'Avondale'];
  const bankTypes = [
    'ANZ Bank',
    'ASB Bank', 
    'BNZ (Bank of New Zealand)',
    'Westpac',
    'Kiwibank',
    'TSB Bank',
    'Heartland Bank',
    'Co-operative Bank',
    'SBS Bank',
    '其他'
  ];
  const simCardTypes = [
    'Nano SIM', 
    'Micro SIM', 
    '标准SIM', 
    'eSIM', 
    'Nano SIM + eSIM', 
    'Micro SIM + eSIM', 
    'Nano SIM + Nano SIM', 
    'Micro SIM + Nano SIM', 
    'eSIM + eSIM', 
    'Nano SIM + Nano SIM + eSIM', 
    'Micro SIM + Micro SIM', 
    '三卡槽 (双SIM + 存储卡)', 
    '无SIM卡'
  ];
  const networkTypes = ['4G', '5G', 'WiFi', 'WiFi+Cellular', '其他'];
  const cpuCounts = ['单核', '双核', '四核', '六核', '八核', '十核', '十二核', '十六核', '其他'];
  const memoryTypes = ['DDR3', 'DDR4', 'DDR5', 'LPDDR3', 'LPDDR4', 'LPDDR5', '其他'];
  const storageTypes = ['SSD', 'HDD', 'eMMC', 'UFS', 'NVMe', '其他'];
  const replacementParts = [
    '屏幕', '电池', '充电接口', '扬声器', '摄像头', '按键', '主板', '内存', '硬盘', 
    '键盘', '触摸板', '风扇', '散热器', '外壳', '后盖', '天线', '麦克风', '其他'
  ];

  const handleDeviceInfoChange = (field: keyof DeviceInfo, value: string | string[]) => {
    // 特殊处理电池健康度字段
    if (field === 'batteryHealth') {
      const numValue = typeof value === 'string' ? value : '';
      // 只允许数字，且范围在0-100之间
      if (numValue === '' || (numValue !== '' && !isNaN(Number(numValue)) && Number(numValue) >= 0 && Number(numValue) <= 100)) {
        setDeviceInfo(prev => ({ ...prev, [field]: numValue }));
      }
      return;
    }
    
    setDeviceInfo(prev => ({ ...prev, [field]: value }));
  };

  const handleUserInfoChange = (field: keyof UserInfo, value: string) => {
    setUserInfo(prev => ({ ...prev, [field]: value }));
  };

  const handleInspectionInfoChange = (field: keyof InspectionInfo, value: string | string[]) => {
    setInspectionInfo(prev => ({ ...prev, [field]: value }));
  };

  const handleReplacementPartToggle = (part: string) => {
    setInspectionInfo(prev => ({
      ...prev,
      replacementParts: prev.replacementParts.includes(part)
        ? prev.replacementParts.filter(p => p !== part)
        : [...prev.replacementParts, part]
    }));
  };

  const handleAccessoryToggle = (accessory: string) => {
    setDeviceInfo(prev => ({
      ...prev,
      accessories: prev.accessories.includes(accessory)
        ? prev.accessories.filter(a => a !== accessory)
        : [...prev.accessories, accessory]
    }));
  };

  const handleSubmit = useCallback(async () => {
    // 防止重复提交
    if (isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);
      console.log('提交回收信息:', { deviceInfo, userInfo, inspectionInfo });

      // 推送到Raytech Odoo
      const response = await fetch('/api/push-to-raytech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceInfo,
          userInfo,
          inspectionInfo
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('推送失败详情:', result);
        throw new Error(result.details || result.error || '推送失败');
      }

      console.log('推送成功:', result);
      setOrderInfo({
        purchaseOrderId: result.data?.purchaseOrderId,
        orderLineId: result.data?.orderLineId
      });
      setShowSuccess(true);
    } catch (error) {
      console.error('提交失败:', error);
      alert('提交失败: ' + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }, [deviceInfo, userInfo, inspectionInfo, isSubmitting]);

  const nextStep = () => {
    if (currentStep < 3) setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const isStepValid = (step: number) => {
    switch (step) {
      case 1:
        // 如果是其他设备类型，不需要电池健康度
        if (deviceInfo.deviceType === '其他') {
          const otherValid = deviceInfo.deviceDescription;
          // 如果选择了品牌，需要型号
          if (deviceInfo.brand && deviceInfo.brand !== '' && !deviceInfo.model) {
            return false;
          }
          // 如果品牌是其他，需要品牌描述
          if (deviceInfo.brand === '其他' && !deviceInfo.brandDescription) {
            return false;
          }
          return otherValid;
        }
        
        // 其他设备类型需要电池健康度
        const batteryHealthValid = deviceInfo.batteryHealth && 
          !isNaN(Number(deviceInfo.batteryHealth)) && 
          Number(deviceInfo.batteryHealth) >= 0 && 
          Number(deviceInfo.batteryHealth) <= 100;
        const basicValid = deviceInfo.deviceType && deviceInfo.brand && deviceInfo.model && batteryHealthValid;
        // 如果品牌是其他，需要品牌描述
        if (deviceInfo.brand === '其他') {
          const brandOtherValid = basicValid && deviceInfo.brandDescription;
          
          // 如果是手机，需要IMEI、颜色、存储容量
          if (deviceInfo.deviceType === '手机') {
            const phoneValid = brandOtherValid && deviceInfo.imei && deviceInfo.color && deviceInfo.storage;
            // 品牌是"其他"时，不需要检查网络类型限制
            return phoneValid;
          }
          
          return brandOtherValid;
        }
        
        // 如果是手机，需要IMEI、颜色、存储容量
        if (deviceInfo.deviceType === '手机') {
          const phoneValid = basicValid && deviceInfo.imei && deviceInfo.color && deviceInfo.storage;
          // 如果是苹果以外的手机，网络类型必须是4G或5G
          if (deviceInfo.brand !== '苹果') {
            return phoneValid && (deviceInfo.networkType === '4G' || deviceInfo.networkType === '5G');
          }
          return phoneValid;
        }
        
        // 如果是平板，需要序列号、颜色、存储容量、屏幕大小、网络类型
        if (deviceInfo.deviceType === '平板') {
          const tabletValid = basicValid && deviceInfo.serialNumber && deviceInfo.color && 
            deviceInfo.storage && deviceInfo.screenSize && deviceInfo.networkType;
          return tabletValid;
        }
        
        // 如果是笔记本，需要序列号、颜色、屏幕大小、发布年份、所有CPU信息、硬盘信息、内存信息、GPU
        if (deviceInfo.deviceType === '笔记本') {
          const laptopValid = basicValid && deviceInfo.serialNumber && deviceInfo.color && 
            deviceInfo.screenSize && deviceInfo.releaseYear && 
            deviceInfo.cpuCount && deviceInfo.cpuModel && deviceInfo.cpuSpeed && deviceInfo.cpuDescription &&
            deviceInfo.memoryType && deviceInfo.memorySize &&
            deviceInfo.storageType && deviceInfo.storageSize &&
            deviceInfo.gpu;
          return laptopValid;
        }
        
        return basicValid;
      case 2:
        // 用户信息全部为选填，只需要验证条件性字段
        // 如果选择了证件类型，需要证件号码
        if (userInfo.idType && userInfo.idType !== '' && !userInfo.idNumber) {
          return false;
        }
        // 如果是其他证件类型，需要证件描述
        if (userInfo.idType === '其他' && !userInfo.idDescription) {
          return false;
        }
        // 如果选择了银行类型，需要完整的银行信息
        if (userInfo.bankType && userInfo.bankType !== '') {
          const bankValid = userInfo.accountName && userInfo.accountNumber;
          // 如果银行类型是其他，需要其他银行名称
          if (userInfo.bankType === '其他' && !userInfo.otherBankName) {
            return false;
          }
          return bankValid;
        }
        return true;
      case 3:
        const basicInspectionValid = inspectionInfo.store && inspectionInfo.operator && inspectionInfo.condition && inspectionInfo.estimatedValue;
        // 如果选择了"其他"配件，需要配件描述
        if (inspectionInfo.replacementParts.includes('其他')) {
          return basicInspectionValid && inspectionInfo.partDescription;
        }
        return basicInspectionValid;
      default:
        return false;
    }
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
            设备回收
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => window.location.href = '/'}
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
            返回登录
          </button>
        </div>
      </div>

      {/* 步骤指示器 */}
      <div style={{ padding: '20px 16px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: 32
        }}>
          {[1, 2, 3].map((step) => (
            <div key={step} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: currentStep >= step ? '#3b82f6' : '#e5e7eb',
                color: currentStep >= step ? '#fff' : '#6b7280',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: 16
              }}>
                {step}
              </div>
              {step < 3 && (
                <div style={{
                  width: 60,
                  height: 2,
                  background: currentStep > step ? '#3b82f6' : '#e5e7eb',
                  margin: '0 16px'
                }} />
              )}
            </div>
          ))}
        </div>

        {/* 步骤标题 */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, color: '#111827', margin: 0 }}>
            {currentStep === 1 && '设备信息'}
            {currentStep === 2 && '用户信息'}
            {currentStep === 3 && '回收记录'}
          </h2>
          <p style={{ fontSize: 16, color: '#6b7280', margin: '8px 0 0 0' }}>
            {currentStep === 1 && '请填写设备的基本信息'}
            {currentStep === 2 && '请填写客户的基本信息'}
            {currentStep === 3 && '请记录建议更换的配件'}
          </p>
        </div>

        {/* 表单内容 */}
        <div style={{
          maxWidth: 600,
          margin: '0 auto',
          background: '#fff',
          borderRadius: 12,
          padding: 24,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          {/* 步骤1: 设备信息 */}
          {currentStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* 设备类型选择 */}
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                  设备类型 *
                </label>
                <select
                  value={deviceInfo.deviceType}
                  onChange={(e) => handleDeviceInfoChange('deviceType', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    fontSize: 14
                  }}
                >
                  <option value="">请选择设备类型</option>
                  {deviceTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              {/* 其他设备类型描述 */}
              {deviceInfo.deviceType === '其他' && (
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                    设备描述 *
                  </label>
                  <input
                    type="text"
                    value={deviceInfo.deviceDescription}
                    onChange={(e) => handleDeviceInfoChange('deviceDescription', e.target.value)}
                    placeholder="请描述设备类型，如：智能手表、游戏机、音响等"
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      fontSize: 14
                    }}
                  />
                </div>
              )}

              {/* 品牌和型号 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                    品牌 {deviceInfo.deviceType !== '其他' ? '*' : ''}
                  </label>
                  <select
                    value={deviceInfo.brand}
                    onChange={(e) => handleDeviceInfoChange('brand', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      fontSize: 14
                    }}
                  >
                    <option value="">请选择品牌</option>
                    {brands.map(brand => (
                      <option key={brand} value={brand}>{brand}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                    型号 *
                  </label>
                  <input
                    type="text"
                    value={deviceInfo.model}
                    onChange={(e) => handleDeviceInfoChange('model', e.target.value)}
                    placeholder="请输入设备型号"
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      fontSize: 14
                    }}
                  />
                </div>
              </div>

              {/* 品牌描述 - 当选择"其他"时显示 */}
              {deviceInfo.brand === '其他' && (
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                    其他品牌描述 *
                  </label>
                  <input
                    type="text"
                    value={deviceInfo.brandDescription}
                    onChange={(e) => handleDeviceInfoChange('brandDescription', e.target.value)}
                    placeholder="请描述设备品牌，如：一加、魅族、努比亚、黑鲨等"
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      fontSize: 14
                    }}
                  />
                </div>
              )}

              {/* 电池健康度 */}
              {deviceInfo.deviceType !== '其他' && (
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                    电池健康度 * (数字)
                  </label>
                  <input
                    type="number"
                    value={deviceInfo.batteryHealth}
                    onChange={(e) => handleDeviceInfoChange('batteryHealth', e.target.value)}
                    placeholder="请输入电池健康度百分比 (0-100)"
                    min="0"
                    max="100"
                    step="1"
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      fontSize: 14
                    }}
                  />
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    请输入0-100之间的数字，表示电池健康度百分比
                  </div>
                </div>
              )}

              {/* 手机专用字段 */}
              {deviceInfo.deviceType === '手机' && (
                <div style={{ 
                  padding: '16px', 
                  borderRadius: 8, 
                  border: '2px solid #3b82f6', 
                  background: '#f8fafc' 
                }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1e40af', margin: '0 0 16px 0' }}>
                    📱 手机信息
                  </h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* IMEI */}
                    <div>
                      <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                        IMEI *
                      </label>
                      <input
                        type="text"
                        value={deviceInfo.imei}
                        onChange={(e) => handleDeviceInfoChange('imei', e.target.value)}
                        placeholder="请输入IMEI"
                        style={{
                          width: '100%',
                          padding: '12px',
                          borderRadius: 8,
                          border: '1px solid #d1d5db',
                          fontSize: 14
                        }}
                      />
                    </div>

                    {/* 颜色和存储容量 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                          颜色 *
                        </label>
                        <input
                          type="text"
                          value={deviceInfo.color}
                          onChange={(e) => handleDeviceInfoChange('color', e.target.value)}
                          placeholder="请输入颜色"
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: 8,
                            border: '1px solid #d1d5db',
                            fontSize: 14
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                          存储容量 *
                        </label>
                        <input
                          type="text"
                          value={deviceInfo.storage}
                          onChange={(e) => handleDeviceInfoChange('storage', e.target.value)}
                          placeholder="如: 128GB, 256GB"
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: 8,
                            border: '1px solid #d1d5db',
                            fontSize: 14
                          }}
                        />
                      </div>
                    </div>

                    {/* Sim卡类型和网络类型 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                          Sim卡类型
                        </label>
                        <select
                          value={deviceInfo.simCardType}
                          onChange={(e) => handleDeviceInfoChange('simCardType', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: 8,
                            border: '1px solid #d1d5db',
                            fontSize: 14
                          }}
                        >
                          <option value="">请选择Sim卡类型</option>
                          {simCardTypes.map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                          网络类型{deviceInfo.brand !== '苹果' ? ' *' : ''}
                        </label>
                        <select
                          value={deviceInfo.networkType}
                          onChange={(e) => handleDeviceInfoChange('networkType', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: 8,
                            border: '1px solid #d1d5db',
                            fontSize: 14
                          }}
                        >
                          <option value="">请选择网络类型</option>
                          {networkTypes.map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                        {deviceInfo.brand !== '苹果' && (
                          <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0 0' }}>
                            苹果以外的手机必须选择4G或5G
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 平板专用字段 */}
              {deviceInfo.deviceType === '平板' && (
                <div style={{ 
                  padding: '16px', 
                  borderRadius: 8, 
                  border: '2px solid #10b981', 
                  background: '#f0fdf4' 
                }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: '#059669', margin: '0 0 16px 0' }}>
                    📱 平板信息
                  </h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* 序列号和颜色 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                          序列号 *
                        </label>
                        <input
                          type="text"
                          value={deviceInfo.serialNumber}
                          onChange={(e) => handleDeviceInfoChange('serialNumber', e.target.value)}
                          placeholder="请输入序列号"
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: 8,
                            border: '1px solid #d1d5db',
                            fontSize: 14
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                          颜色 *
                        </label>
                        <input
                          type="text"
                          value={deviceInfo.color}
                          onChange={(e) => handleDeviceInfoChange('color', e.target.value)}
                          placeholder="请输入颜色"
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: 8,
                            border: '1px solid #d1d5db',
                            fontSize: 14
                          }}
                        />
                      </div>
                    </div>

                    {/* 存储容量和屏幕大小 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                          存储容量 *
                        </label>
                        <input
                          type="text"
                          value={deviceInfo.storage}
                          onChange={(e) => handleDeviceInfoChange('storage', e.target.value)}
                          placeholder="如: 128GB, 256GB"
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: 8,
                            border: '1px solid #d1d5db',
                            fontSize: 14
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                          屏幕大小 *
                        </label>
                        <input
                          type="text"
                          value={deviceInfo.screenSize}
                          onChange={(e) => handleDeviceInfoChange('screenSize', e.target.value)}
                          placeholder="如: 10.9英寸, 12.9英寸"
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: 8,
                            border: '1px solid #d1d5db',
                            fontSize: 14
                          }}
                        />
                      </div>
                    </div>

                    {/* 网络类型 */}
                    <div>
                        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                          网络类型 *
                        </label>
                      <select
                        value={deviceInfo.networkType}
                        onChange={(e) => handleDeviceInfoChange('networkType', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '12px',
                          borderRadius: 8,
                          border: '1px solid #d1d5db',
                          fontSize: 14
                        }}
                      >
                        <option value="">请选择网络类型</option>
                        {networkTypes.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* 笔记本专用字段 */}
              {deviceInfo.deviceType === '笔记本' && (
                <div style={{ 
                  padding: '16px', 
                  borderRadius: 8, 
                  border: '2px solid #f59e0b', 
                  background: '#fffbeb' 
                }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: '#d97706', margin: '0 0 16px 0' }}>
                    💻 笔记本信息
                  </h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* 序列号和颜色 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                          序列号 *
                        </label>
                        <input
                          type="text"
                          value={deviceInfo.serialNumber}
                          onChange={(e) => handleDeviceInfoChange('serialNumber', e.target.value)}
                          placeholder="请输入序列号"
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: 8,
                            border: '1px solid #d1d5db',
                            fontSize: 14
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                          颜色 *
                        </label>
                        <input
                          type="text"
                          value={deviceInfo.color}
                          onChange={(e) => handleDeviceInfoChange('color', e.target.value)}
                          placeholder="请输入颜色"
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: 8,
                            border: '1px solid #d1d5db',
                            fontSize: 14
                          }}
                        />
                      </div>
                    </div>

                    {/* 屏幕大小和发布年份 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                          屏幕大小 *
                        </label>
                        <input
                          type="text"
                          value={deviceInfo.screenSize}
                          onChange={(e) => handleDeviceInfoChange('screenSize', e.target.value)}
                          placeholder="如: 13.3英寸, 15.6英寸"
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: 8,
                            border: '1px solid #d1d5db',
                            fontSize: 14
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                          发布年份 *
                        </label>
                        <input
                          type="text"
                          value={deviceInfo.releaseYear}
                          onChange={(e) => handleDeviceInfoChange('releaseYear', e.target.value)}
                          placeholder="如: 2023"
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: 8,
                            border: '1px solid #d1d5db',
                            fontSize: 14
                          }}
                        />
                      </div>
                    </div>

                    {/* CPU信息 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <h4 style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: 0 }}>
                        CPU信息
                      </h4>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                            CPU数量 *
                          </label>
                          <select
                            value={deviceInfo.cpuCount}
                            onChange={(e) => handleDeviceInfoChange('cpuCount', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '12px',
                              borderRadius: 8,
                              border: '1px solid #d1d5db',
                              fontSize: 14
                            }}
                          >
                            <option value="">请选择CPU数量</option>
                            {cpuCounts.map(count => (
                              <option key={count} value={count}>{count}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                            CPU型号 *
                          </label>
                          <input
                            type="text"
                            value={deviceInfo.cpuModel}
                            onChange={(e) => handleDeviceInfoChange('cpuModel', e.target.value)}
                            placeholder="请输入CPU型号"
                            style={{
                              width: '100%',
                              padding: '12px',
                              borderRadius: 8,
                              border: '1px solid #d1d5db',
                              fontSize: 14
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                          CPU速度 *
                        </label>
                        <input
                          type="text"
                          value={deviceInfo.cpuSpeed}
                          onChange={(e) => handleDeviceInfoChange('cpuSpeed', e.target.value)}
                          placeholder="如: 3.2GHz, 2.8GHz"
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: 8,
                            border: '1px solid #d1d5db',
                            fontSize: 14
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                          CPU补充描述 *
                        </label>
                        <input
                          type="text"
                          value={deviceInfo.cpuDescription}
                          onChange={(e) => handleDeviceInfoChange('cpuDescription', e.target.value)}
                          placeholder="如: Intel i7-13700H, AMD Ryzen 7 7840H"
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: 8,
                            border: '1px solid #d1d5db',
                            fontSize: 14
                          }}
                        />
                      </div>
                    </div>

                    {/* 内存和硬盘信息 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <h4 style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: 0 }}>
                        内存和硬盘信息
                      </h4>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                            内存类型 *
                          </label>
                          <select
                            value={deviceInfo.memoryType}
                            onChange={(e) => handleDeviceInfoChange('memoryType', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '12px',
                              borderRadius: 8,
                              border: '1px solid #d1d5db',
                              fontSize: 14
                            }}
                          >
                            <option value="">请选择内存类型</option>
                            {memoryTypes.map(type => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                            内存大小 *
                          </label>
                          <input
                            type="text"
                            value={deviceInfo.memorySize}
                            onChange={(e) => handleDeviceInfoChange('memorySize', e.target.value)}
                            placeholder="如: 8GB, 16GB, 32GB"
                            style={{
                              width: '100%',
                              padding: '12px',
                              borderRadius: 8,
                              border: '1px solid #d1d5db',
                              fontSize: 14
                            }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                            硬盘类型 *
                          </label>
                          <select
                            value={deviceInfo.storageType}
                            onChange={(e) => handleDeviceInfoChange('storageType', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '12px',
                              borderRadius: 8,
                              border: '1px solid #d1d5db',
                              fontSize: 14
                            }}
                          >
                            <option value="">请选择硬盘类型</option>
                            {storageTypes.map(type => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                            硬盘大小 *
                          </label>
                          <input
                            type="text"
                            value={deviceInfo.storageSize}
                            onChange={(e) => handleDeviceInfoChange('storageSize', e.target.value)}
                            placeholder="如: 512GB, 1TB, 2TB"
                            style={{
                              width: '100%',
                              padding: '12px',
                              borderRadius: 8,
                              border: '1px solid #d1d5db',
                              fontSize: 14
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                          GPU *
                        </label>
                        <input
                          type="text"
                          value={deviceInfo.gpu}
                          onChange={(e) => handleDeviceInfoChange('gpu', e.target.value)}
                          placeholder="如: NVIDIA RTX 4060, AMD Radeon RX 7600M"
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: 8,
                            border: '1px solid #d1d5db',
                            fontSize: 14
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 配件信息 - 所有设备类型通用 */}
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                  配件
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {['充电器', '数据线', '耳机', '保护壳', '包装盒', '说明书'].map(accessory => (
                    <label key={accessory} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '1px solid #d1d5db',
                      cursor: 'pointer',
                      background: deviceInfo.accessories.includes(accessory) ? '#dbeafe' : '#fff'
                    }}>
                      <input
                        type="checkbox"
                        checked={deviceInfo.accessories.includes(accessory)}
                        onChange={() => handleAccessoryToggle(accessory)}
                        style={{ margin: 0 }}
                      />
                      <span style={{ fontSize: 14 }}>{accessory}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 步骤2: 用户信息 */}
          {currentStep === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                  客户姓名
                </label>
                <input
                  type="text"
                  value={userInfo.customerName}
                  onChange={(e) => handleUserInfoChange('customerName', e.target.value)}
                  placeholder="请输入客户姓名"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    fontSize: 14
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                    手机号码
                  </label>
                  <input
                    type="tel"
                    value={userInfo.phone}
                    onChange={(e) => handleUserInfoChange('phone', e.target.value)}
                    placeholder="请输入手机号码"
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      fontSize: 14
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                    邮箱地址
                  </label>
                  <input
                    type="email"
                    value={userInfo.email}
                    onChange={(e) => handleUserInfoChange('email', e.target.value)}
                    placeholder="请输入邮箱地址"
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      fontSize: 14
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                  地址
                </label>
                <textarea
                  value={userInfo.address}
                  onChange={(e) => handleUserInfoChange('address', e.target.value)}
                  placeholder="请输入详细地址"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    fontSize: 14,
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                    证件类型
                  </label>
                  <select
                    value={userInfo.idType}
                    onChange={(e) => handleUserInfoChange('idType', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      fontSize: 14
                    }}
                  >
                    <option value="">请选择证件类型</option>
                    {idTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                    证件号码
                  </label>
                  <input
                    type="text"
                    value={userInfo.idNumber}
                    onChange={(e) => handleUserInfoChange('idNumber', e.target.value)}
                    placeholder="请输入证件号码"
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      fontSize: 14
                    }}
                  />
                </div>
              </div>

              {/* 证件描述 - 当选择"其他"时显示 */}
              {userInfo.idType === '其他' && (
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                    证件描述 *
                  </label>
                  <input
                    type="text"
                    value={userInfo.idDescription}
                    onChange={(e) => handleUserInfoChange('idDescription', e.target.value)}
                    placeholder="请描述证件类型，如：工作证、学生证、军官证等"
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      fontSize: 14
                    }}
                  />
                </div>
              )}

              {/* 银行信息 */}
              <div style={{ 
                padding: '16px', 
                borderRadius: 8, 
                border: '2px solid #3b82f6', 
                background: '#eff6ff' 
              }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1d4ed8', margin: '0 0 16px 0' }}>
                  🏦 付款银行信息
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* 银行类型 */}
                  <div>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                      银行类型
                    </label>
                    <select
                      value={userInfo.bankType}
                      onChange={(e) => handleUserInfoChange('bankType', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: 8,
                        border: '1px solid #d1d5db',
                        fontSize: 14
                      }}
                    >
                      <option value="">请选择银行类型</option>
                      {bankTypes.map(bank => (
                        <option key={bank} value={bank}>{bank}</option>
                      ))}
                    </select>
                  </div>

                  {/* 其他银行名称 - 当选择"其他"时显示 */}
                  {userInfo.bankType === '其他' && (
                    <div>
                      <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                        其他银行名称
                      </label>
                      <input
                        type="text"
                        value={userInfo.otherBankName}
                        onChange={(e) => handleUserInfoChange('otherBankName', e.target.value)}
                        placeholder="请输入银行名称，如：中国银行、工商银行等"
                        style={{
                          width: '100%',
                          padding: '12px',
                          borderRadius: 8,
                          border: '1px solid #d1d5db',
                          fontSize: 14
                        }}
                      />
                    </div>
                  )}

                  {/* 账户名称和付款账号 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                        账户名称
                      </label>
                      <input
                        type="text"
                        value={userInfo.accountName}
                        onChange={(e) => handleUserInfoChange('accountName', e.target.value)}
                        placeholder="请输入账户名称"
                        style={{
                          width: '100%',
                          padding: '12px',
                          borderRadius: 8,
                          border: '1px solid #d1d5db',
                          fontSize: 14
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                        付款账号
                      </label>
                      <input
                        type="text"
                        value={userInfo.accountNumber}
                        onChange={(e) => handleUserInfoChange('accountNumber', e.target.value)}
                        placeholder="请输入付款账号"
                        style={{
                          width: '100%',
                          padding: '12px',
                          borderRadius: 8,
                          border: '1px solid #d1d5db',
                          fontSize: 14
                        }}
                      />
                    </div>
                  </div>

                  {/* 汇款备注 */}
                  <div>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                      汇款备注
                    </label>
                    <textarea
                      value={userInfo.transferNote}
                      onChange={(e) => handleUserInfoChange('transferNote', e.target.value)}
                      placeholder="请输入汇款备注，如：设备回收款、参考号等"
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: 8,
                        border: '1px solid #d1d5db',
                        fontSize: 14,
                        resize: 'vertical'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 步骤3: 检测信息 */}
          {currentStep === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* 门店和操作人 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                    门店 *
                  </label>
                  <select
                    value={inspectionInfo.store}
                    onChange={(e) => setInspectionInfo(prev => ({ ...prev, store: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      fontSize: 14
                    }}
                  >
                    <option value="">请选择门店</option>
                    {stores.map(store => (
                      <option key={store} value={store}>{store}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                    操作人 *
                  </label>
                  <input
                    type="text"
                    value={inspectionInfo.operator}
                    onChange={(e) => setInspectionInfo(prev => ({ ...prev, operator: e.target.value }))}
                    placeholder="请输入操作人姓名"
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      fontSize: 14
                    }}
                  />
                </div>
              </div>

              {/* 成色 */}
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                  成色 *
                </label>
                <select
                  value={inspectionInfo.condition}
                  onChange={(e) => setInspectionInfo(prev => ({ ...prev, condition: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    fontSize: 14
                  }}
                >
                  <option value="">请选择成色</option>
                  {conditions.map(condition => (
                    <option key={condition} value={condition}>{condition}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                  建议更换的配件
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {replacementParts.map(part => (
                    <label key={part} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '1px solid #d1d5db',
                      cursor: 'pointer',
                      background: inspectionInfo.replacementParts.includes(part) ? '#fef2f2' : '#fff'
                    }}>
                      <input
                        type="checkbox"
                        checked={inspectionInfo.replacementParts.includes(part)}
                        onChange={() => handleReplacementPartToggle(part)}
                        style={{ margin: 0 }}
                      />
                      <span style={{ fontSize: 14 }}>{part}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 配件描述 - 当选择"其他"时显示 */}
              {inspectionInfo.replacementParts.includes('其他') && (
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                    配件描述 *
                  </label>
                  <input
                    type="text"
                    value={inspectionInfo.partDescription}
                    onChange={(e) => setInspectionInfo(prev => ({ ...prev, partDescription: e.target.value }))}
                    placeholder="请描述需要更换的其他配件，如：指纹识别模块、振动马达、光线传感器等"
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      fontSize: 14
                    }}
                  />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                  回收价格 *
                </label>
                <input
                  type="text"
                  value={inspectionInfo.estimatedValue}
                  onChange={(e) => handleInspectionInfoChange('estimatedValue', e.target.value)}
                  placeholder="请输入回收价格"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    fontSize: 14
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                  备注
                </label>
                <textarea
                  value={inspectionInfo.notes}
                  onChange={(e) => handleInspectionInfoChange('notes', e.target.value)}
                  placeholder="请输入其他备注信息"
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    fontSize: 14,
                    resize: 'vertical'
                  }}
                />
              </div>
            </div>
          )}

          {/* 按钮区域 */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 32,
            paddingTop: 24,
            borderTop: '1px solid #e5e7eb'
          }}>
            <button
              onClick={prevStep}
              disabled={currentStep === 1}
              style={{
                padding: '12px 24px',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                background: '#fff',
                color: '#374151',
                fontSize: 14,
                fontWeight: 500,
                cursor: currentStep === 1 ? 'not-allowed' : 'pointer',
                opacity: currentStep === 1 ? 0.5 : 1
              }}
            >
              上一步
            </button>

            {currentStep < 3 ? (
              <button
                onClick={nextStep}
                disabled={!isStepValid(currentStep)}
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background: isStepValid(currentStep) ? '#3b82f6' : '#9ca3af',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: isStepValid(currentStep) ? 'pointer' : 'not-allowed'
                }}
              >
                下一步
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!isStepValid(currentStep) || isSubmitting}
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background: (isStepValid(currentStep) && !isSubmitting) ? '#059669' : '#9ca3af',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: (isStepValid(currentStep) && !isSubmitting) ? 'pointer' : 'not-allowed',
                  opacity: isSubmitting ? 0.7 : 1
                }}
              >
                {isSubmitting ? '提交中...' : '记录回收信息'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 成功提示 */}
      {showSuccess && (
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
            padding: 32,
            textAlign: 'center',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: '#d1fae5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <span style={{ fontSize: 32, color: '#059669' }}>✓</span>
            </div>
            <h3 style={{
              fontSize: 20,
              fontWeight: 600,
              color: '#111827',
              margin: '0 0 16px 0',
            }}>
              回收信息记录成功！
            </h3>
            
            {orderInfo?.purchaseOrderId && (
              <div style={{
                background: '#f3f4f6',
                borderRadius: 8,
                padding: '12px 16px',
                margin: '0 0 16px 0',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: 4
                }}>
                  采购订单号:
                </div>
                <div style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#111827',
                  fontFamily: 'monospace'
                }}>
                  PO{orderInfo.purchaseOrderId}
                </div>
                {orderInfo.orderLineId && (
                  <div style={{
                    fontSize: 12,
                    color: '#6b7280',
                    marginTop: 4
                  }}>
                    订单行ID: {orderInfo.orderLineId}
                  </div>
                )}
              </div>
            )}
            
            <p style={{
              fontSize: 14,
              color: '#6b7280',
              margin: '0 0 20px 0',
            }}>
              设备回收信息已成功记录到系统中。
            </p>
            
            <button
              onClick={() => {
                setShowSuccess(false);
                setOrderInfo(null);
                // 重置表单
                setDeviceInfo({
                  deviceType: '',
                  brand: '',
                  brandDescription: '',
                  model: '',
                  serialNumber: '',
                  imei: '',
                  color: '',
                  storage: '',
                  accessories: [],
                  batteryHealth: '',
                  memory: '',
                  memorySize: '',
                  screenSize: '',
                  simCardType: '',
                  networkType: '',
                  releaseYear: '',
                  cpuDescription: '',
                  cpuCount: '',
                  cpuModel: '',
                  cpuSpeed: '',
                  memoryType: '',
                  storageType: '',
                  storageSize: '',
                  gpu: '',
                  deviceDescription: ''
                });
                setUserInfo({
                  customerName: '',
                  phone: '',
                  email: '',
                  address: '',
                  idNumber: '',
                  idType: '',
                  idDescription: '',
                  bankType: '',
                  otherBankName: '',
                  accountName: '',
                  accountNumber: '',
                  transferNote: ''
                });
                setInspectionInfo({
                  store: '',
                  operator: '',
                  replacementParts: [],
                  estimatedValue: '',
                  notes: '',
                  condition: '',
                  partDescription: ''
                });
                setCurrentStep(1);
              }}
              style={{
                padding: '12px 24px',
                borderRadius: 8,
                border: 'none',
                background: '#059669',
                color: '#fff',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                minWidth: 120
              }}
            >
              确认
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
