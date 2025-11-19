'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface FeatureCard {
  id: string;
  title: string;
  description: string;
  icon: string;
  href: string;
  color: string;
  gradient: string;
}

const features: FeatureCard[] = [
  {
    id: 'scan',
    title: '库存扫码',
    description: '扫描条码快速查询和更新库存',
    icon: '📷',
    href: '/scan',
    color: '#667eea',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  {
    id: 'products',
    title: '产品查询',
    description: '搜索和查看产品详细信息',
    icon: '🔍',
    href: '/products',
    color: '#10b981',
    gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
  },
  {
    id: 'device-inventory',
    title: '设备盘点',
    description: '设备库存盘点和记录',
    icon: '📱',
    href: '/device-inventory',
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
  },
  {
    id: 'parts-inventory',
    title: '零配件盘点',
    description: '零配件库存盘点和记录',
    icon: '📦',
    href: '/parts-inventory',
    color: '#3b82f6',
    gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
  },
  {
    id: 'receiving',
    title: '收货入库',
    description: '处理收货订单和入库操作',
    icon: '📥',
    href: '/receiving',
    color: '#8b5cf6',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
  },
  {
    id: 'inventory-history',
    title: '库存历史',
    description: '查看库存变动历史记录',
    icon: '📊',
    href: '/inventory-history',
    color: '#ec4899',
    gradient: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
  },
  {
    id: 'recycle',
    title: '设备回收',
    description: '设备回收和记录管理',
    icon: '♻️',
    href: '/recycle',
    color: '#14b8a6',
    gradient: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
  },
  {
    id: 'user-guide',
    title: '使用指南',
    description: '查看系统使用说明和帮助',
    icon: '📖',
    href: '/user-guide',
    color: '#6366f1',
    gradient: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
  },
];

interface Company {
  id: number;
  name: string;
}

const styleContent = `@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}@keyframes slideIn{from{opacity:0;transform:translateX(-20px)}to{opacity:1;transform:translateX(0)}}.feature-card{animation:fadeIn 0.4s ease-out;animation-fill-mode:both}.feature-card:nth-child(1){animation-delay:0.05s}.feature-card:nth-child(2){animation-delay:0.1s}.feature-card:nth-child(3){animation-delay:0.15s}.feature-card:nth-child(4){animation-delay:0.2s}.feature-card:nth-child(5){animation-delay:0.25s}.feature-card:nth-child(6){animation-delay:0.3s}.feature-card:nth-child(7){animation-delay:0.35s}.feature-card:nth-child(8){animation-delay:0.4s}@media (max-width:768px){.dashboard-container{padding:12px!important;paddingBottom:calc(92px + env(safe-area-inset-bottom))!important}.header-section{padding:16px!important;margin-bottom:16px!important}.header-title{font-size:24px!important}.header-subtitle{font-size:14px!important}.features-grid{grid-template-columns:repeat(2,1fr)!important;gap:12px!important}.feature-card{padding:16px!important;min-height:120px!important}.feature-icon{font-size:32px!important;margin-bottom:8px!important}.feature-title{font-size:15px!important;margin-bottom:4px!important}.feature-description{font-size:12px!important;line-height:1.4!important}.logout-button{padding:10px 16px!important;font-size:14px!important;min-height:44px!important}}@media (max-width:480px){.dashboard-container{padding:8px!important;paddingBottom:calc(92px + env(safe-area-inset-bottom))!important}.header-section{padding:12px!important;margin-bottom:12px!important}.header-title{font-size:20px!important}.header-subtitle{font-size:13px!important}.features-grid{grid-template-columns:1fr!important;gap:10px!important}.feature-card{padding:14px!important;min-height:110px!important}.feature-icon{font-size:28px!important;margin-bottom:6px!important}.feature-title{font-size:14px!important}.feature-description{font-size:11px!important}}@media (hover:none) and (pointer:coarse){.feature-card{min-height:120px!important}button{min-height:44px!important}}`;

export default function DashboardPage() {
  const router = useRouter();
  const [userInfo, setUserInfo] = useState<{ 
    name?: string; 
    company?: string;
    currentCompanyId?: number;
    companies?: Company[];
    canSwitchCompany?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCompanyPicker, setShowCompanyPicker] = useState(false);
  const [switchingCompany, setSwitchingCompany] = useState(false);

  useEffect(() => {
    // 检查登录状态并获取用户信息
    fetch('/api/user-info')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setUserInfo({
            company: data.company_name,
            currentCompanyId: data.current_company_id,
            companies: data.companies || [],
            canSwitchCompany: data.can_switch_company || false,
          });
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  // 点击外部关闭公司选择器
  useEffect(() => {
    if (!showCompanyPicker) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.company-picker-wrapper') && !target.closest('.company-switch-button')) {
        setShowCompanyPicker(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCompanyPicker]);

  const handleSwitchCompany = async (companyId: number) => {
    if (switchingCompany) return;
    
    setSwitchingCompany(true);
    try {
      const res = await fetch('/api/switch-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ companyId }),
      });
      
      const data = await res.json();
      
      if (!res.ok || !data.success) {
        throw new Error(data.error || '切换公司失败');
      }
      
      // 刷新页面以应用新的公司设置
      window.location.reload();
    } catch (error: any) {
      alert(`切换公司失败: ${error.message || '未知错误'}`);
      setSwitchingCompany(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
      router.push('/');
    } catch (error) {
      console.error('退出登录失败:', error);
      router.push('/');
    }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styleContent }} />

      <div className="dashboard-container" style={{
        minHeight: '100dvh',
        background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
        padding: '20px',
        paddingBottom: 'calc(92px + env(safe-area-inset-bottom))',
      }}>
        {/* 顶部导航栏 */}
        <div className="header-section" style={{
          background: '#fff',
          borderRadius: '16px',
          padding: '20px 24px',
          marginBottom: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <h1 className="header-title" style={{
              margin: 0,
              fontSize: '28px',
              fontWeight: 700,
              color: '#111827',
              marginBottom: '4px',
            }}>
              功能中心
            </h1>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              flexWrap: 'wrap',
              position: 'relative',
            }}>
              <p className="header-subtitle" style={{
                margin: 0,
                fontSize: '15px',
                color: '#6b7280',
              }}>
                {loading ? '加载中...' : userInfo?.company ? userInfo.company : '选择功能开始使用'}
              </p>
              {userInfo?.canSwitchCompany && userInfo.companies && userInfo.companies.length > 1 && (
                <div className="company-picker-wrapper" style={{ position: 'relative' }}>
                  <button
                    className="company-switch-button"
                    onClick={() => setShowCompanyPicker(!showCompanyPicker)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db',
                      background: showCompanyPicker ? '#f0f4ff' : '#fff',
                      color: '#667eea',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!showCompanyPicker) {
                        e.currentTarget.style.borderColor = '#667eea';
                        e.currentTarget.style.background = '#f0f4ff';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!showCompanyPicker) {
                        e.currentTarget.style.borderColor = '#d1d5db';
                        e.currentTarget.style.background = '#fff';
                      }
                    }}
                  >
                    🔄 切换公司
                  </button>
                  {showCompanyPicker && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: '8px',
                      background: '#fff',
                      borderRadius: '12px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      border: '1px solid #e5e7eb',
                      padding: '12px',
                      minWidth: '200px',
                      zIndex: 100,
                    }}>
                      <div style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#374151',
                        marginBottom: '8px',
                        paddingBottom: '8px',
                        borderBottom: '1px solid #e5e7eb',
                      }}>
                        选择公司
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {userInfo.companies.map((company) => (
                          <button
                            key={company.id}
                            onClick={() => handleSwitchCompany(company.id)}
                            disabled={switchingCompany || company.id === userInfo.currentCompanyId}
                            style={{
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: company.id === userInfo.currentCompanyId 
                                ? '2px solid #667eea' 
                                : '1px solid #e5e7eb',
                              background: company.id === userInfo.currentCompanyId 
                                ? '#f0f4ff' 
                                : '#fff',
                              color: company.id === userInfo.currentCompanyId 
                                ? '#667eea' 
                                : '#374151',
                              fontSize: '13px',
                              fontWeight: company.id === userInfo.currentCompanyId ? 600 : 500,
                              cursor: switchingCompany || company.id === userInfo.currentCompanyId 
                                ? 'not-allowed' 
                                : 'pointer',
                              transition: 'all 0.2s ease',
                              textAlign: 'left',
                              opacity: switchingCompany && company.id !== userInfo.currentCompanyId ? 0.6 : 1,
                            }}
                            onMouseEnter={(e) => {
                              if (!switchingCompany && company.id !== userInfo.currentCompanyId) {
                                e.currentTarget.style.borderColor = '#667eea';
                                e.currentTarget.style.background = '#f9fafb';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!switchingCompany && company.id !== userInfo.currentCompanyId) {
                                e.currentTarget.style.borderColor = '#e5e7eb';
                                e.currentTarget.style.background = '#fff';
                              }
                            }}
                          >
                            {company.id === userInfo.currentCompanyId && '✓ '}
                            {company.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              className="logout-button"
              onClick={handleLogout}
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                border: '1px solid #e5e7eb',
                background: '#fff',
                color: '#374151',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#ef4444';
                e.currentTarget.style.color = '#ef4444';
                e.currentTarget.style.background = '#fef2f2';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.color = '#374151';
                e.currentTarget.style.background = '#fff';
              }}
            >
              退出登录
            </button>
          </div>
        </div>

        {/* 功能卡片网格 */}
        <div className="features-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '16px',
          maxWidth: '1400px',
          margin: '0 auto',
        }}>
          {features.map((feature) => (
            <a
              key={feature.id}
              href={feature.href}
              className="feature-card"
              style={{
                display: 'block',
                background: '#fff',
                borderRadius: '16px',
                padding: '20px',
                textDecoration: 'none',
                color: 'inherit',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                transition: 'all 0.3s ease',
                border: '1px solid #f3f4f6',
                minHeight: '140px',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)';
                e.currentTarget.style.borderColor = feature.color;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
                e.currentTarget.style.borderColor = '#f3f4f6';
              }}
              onClick={(e) => {
                e.preventDefault();
                router.push(feature.href);
              }}
            >
              {/* 背景渐变装饰 */}
              <div style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: '80px',
                height: '80px',
                background: feature.gradient,
                opacity: 0.1,
                borderRadius: '0 16px 0 100%',
                pointerEvents: 'none',
              }} />
              
              {/* 图标 */}
              <div className="feature-icon" style={{
                fontSize: '40px',
                marginBottom: '12px',
                lineHeight: 1,
              }}>
                {feature.icon}
              </div>
              
              {/* 标题 */}
              <h3 className="feature-title" style={{
                margin: 0,
                marginBottom: '6px',
                fontSize: '18px',
                fontWeight: 600,
                color: '#111827',
              }}>
                {feature.title}
              </h3>
              
              {/* 描述 */}
              <p className="feature-description" style={{
                margin: 0,
                fontSize: '13px',
                color: '#6b7280',
                lineHeight: 1.5,
              }}>
                {feature.description}
              </p>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}

