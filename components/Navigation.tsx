'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);

  // 不需要导航的页面
  const noNavPages = ['/'];
  const shouldShowNav = !noNavPages.includes(pathname);

  useEffect(() => {
    setShowMenu(false);
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
      router.push('/');
    } catch (error) {
      console.error('退出登录失败:', error);
      router.push('/');
    }
  };

  if (!shouldShowNav) {
    return null;
  }

  const navItems = [
    { href: '/dashboard', label: '首页', icon: '🏠' },
    { href: '/scan', label: '扫码', icon: '📷' },
    { href: '/products', label: '产品', icon: '🔍' },
    { href: '/receiving', label: '收货', icon: '📥' },
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .bottom-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: #fff;
          border-top: 1px solid #e5e7eb;
          padding: 8px 0 calc(8px + env(safe-area-inset-bottom));
          z-index: 100;
          box-shadow: 0 -2px 8px rgba(0,0,0,0.05);
        }
        .bottom-nav-items {
          display: flex;
          justify-content: space-around;
          align-items: center;
          max-width: 600px;
          margin: 0 auto;
          padding: 0 12px;
        }
        .bottom-nav-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 8px 12px;
          text-decoration: none;
          color: #6b7280;
          transition: all 0.2s ease;
          border-radius: 10px;
          min-height: 56px;
          gap: 4px;
        }
        .bottom-nav-item.active {
          color: #667eea;
          background: #f0f4ff;
        }
        .bottom-nav-item-icon {
          font-size: 20px;
          line-height: 1;
        }
        .bottom-nav-item-label {
          font-size: 11px;
          font-weight: 500;
        }
        .top-nav {
          position: sticky;
          top: 0;
          z-index: 50;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid #e5e7eb;
          padding: 12px 16px;
        }
        .top-nav-content {
          display: flex;
          align-items: center;
          justify-content: space-between;
          max-width: 1400px;
          margin: 0 auto;
        }
        .top-nav-title {
          font-size: 18px;
          font-weight: 600;
          color: #111827;
        }
        .top-nav-menu-button {
          display: none;
          padding: 8px;
          border: none;
          background: none;
          cursor: pointer;
          font-size: 20px;
        }
        .top-nav-links {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .top-nav-link {
          padding: 8px 16px;
          border-radius: 8px;
          text-decoration: none;
          color: #374151;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        .top-nav-link:hover {
          background: #f3f4f6;
          color: #667eea;
        }
        .top-nav-link.active {
          background: #f0f4ff;
          color: #667eea;
        }
        .mobile-menu {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 200;
          display: none;
        }
        .mobile-menu.active {
          display: block;
        }
        .mobile-menu-content {
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          width: 280px;
          background: #fff;
          box-shadow: -2px 0 8px rgba(0,0,0,0.1);
          padding: 20px;
          overflow-y: auto;
        }
        .mobile-menu-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 1px solid #e5e7eb;
        }
        .mobile-menu-title {
          font-size: 20px;
          font-weight: 600;
          color: #111827;
        }
        .mobile-menu-close {
          padding: 8px;
          border: none;
          background: none;
          cursor: pointer;
          font-size: 24px;
          color: #6b7280;
        }
        .mobile-menu-items {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .mobile-menu-item {
          padding: 14px 16px;
          border-radius: 10px;
          text-decoration: none;
          color: #374151;
          font-size: 15px;
          font-weight: 500;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .mobile-menu-item:hover,
        .mobile-menu-item.active {
          background: #f0f4ff;
          color: #667eea;
        }
        .mobile-menu-item-icon {
          font-size: 20px;
        }
        @media (max-width: 768px) {
          .top-nav-menu-button {
            display: block;
          }
          .top-nav-links {
            display: none;
          }
          .mobile-menu.active {
            display: block;
          }
          .bottom-nav {
            display: block;
          }
        }
        @media (min-width: 769px) {
          .mobile-menu {
            display: none !important;
          }
          .bottom-nav {
            display: none;
          }
        }
      `}} />

      {/* 顶部导航栏（桌面端） */}
      <nav className="top-nav">
        <div className="top-nav-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              className="top-nav-menu-button"
              onClick={() => setShowMenu(true)}
              aria-label="打开菜单"
            >
              ☰
            </button>
            <a href="/dashboard" className="top-nav-title" style={{ textDecoration: 'none', color: 'inherit' }}>
              Odoo 库存管理
            </a>
          </div>
          <div className="top-nav-links">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`top-nav-link ${pathname === item.href ? 'active' : ''}`}
              >
                {item.label}
              </a>
            ))}
            <button
              onClick={handleLogout}
              className="top-nav-link"
              style={{ border: 'none', background: 'none', cursor: 'pointer' }}
            >
              退出
            </button>
          </div>
        </div>
      </nav>

      {/* 移动端菜单 */}
      <div className={`mobile-menu ${showMenu ? 'active' : ''}`} onClick={() => setShowMenu(false)}>
        <div className="mobile-menu-content" onClick={(e) => e.stopPropagation()}>
          <div className="mobile-menu-header">
            <div className="mobile-menu-title">菜单</div>
            <button
              className="mobile-menu-close"
              onClick={() => setShowMenu(false)}
              aria-label="关闭菜单"
            >
              ✕
            </button>
          </div>
          <div className="mobile-menu-items">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`mobile-menu-item ${pathname === item.href ? 'active' : ''}`}
                onClick={() => setShowMenu(false)}
              >
                <span className="mobile-menu-item-icon">{item.icon}</span>
                <span>{item.label}</span>
              </a>
            ))}
            <button
              onClick={handleLogout}
              className="mobile-menu-item"
              style={{ border: 'none', background: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}
            >
              <span className="mobile-menu-item-icon">🚪</span>
              <span>退出登录</span>
            </button>
          </div>
        </div>
      </div>

      {/* 底部导航栏（移动端） */}
      <nav className="bottom-nav">
        <div className="bottom-nav-items">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`bottom-nav-item ${pathname === item.href ? 'active' : ''}`}
            >
              <span className="bottom-nav-item-icon">{item.icon}</span>
              <span className="bottom-nav-item-label">{item.label}</span>
            </a>
          ))}
        </div>
      </nav>
    </>
  );
}

