'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import DomainPicker, { DomainPreset } from '@/components/DomainPicker';

export default function LoginPage() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true); // 30 天保持登录
  const [preset, setPreset] = useState<DomainPreset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const loginInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = useMemo(() => {
    if (!login || !password || !preset) return false;
    return !submitting;
  }, [login, password, preset, submitting]);

  // 页面加载时自动聚焦第一个输入框
  useEffect(() => {
    if (loginInputRef.current && !login) {
      loginInputRef.current.focus();
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!canSubmit || !preset) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login,
          password,
          remember,
          baseUrl: preset.url,                             // 指定 Odoo URL
          dbName: preset.db,                               // 指定 Odoo DB
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || '登录失败');

      // 登录成功后，清除扫码工具的显示状态，下次打开时默认为关闭
      if (typeof window !== 'undefined') {
        localStorage.removeItem('scan_show_scanner');
      }

      // 跳转到功能主页
      window.location.href = '/dashboard';
    } catch (e: any) {
      setErr(e?.message || '登录失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-container" style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* 背景装饰 */}
      <div style={{
        position: 'absolute',
        top: '-50%',
        right: '-50%',
        width: '200%',
        height: '200%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)',
        backgroundSize: '50px 50px',
        animation: 'float 20s infinite linear',
        pointerEvents: 'none',
      }} />
      
      <style>{`
        @keyframes float {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(-50px, -50px) rotate(360deg); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .shake {
          animation: shake 0.5s;
        }
        @media (max-width: 768px) {
          form {
            max-width: 90% !important;
            padding: 32px 24px !important;
            border-radius: 20px !important;
            margin: 16px !important;
          }
        }
        @media (max-width: 480px) {
          form {
            max-width: 95% !important;
            padding: 28px 20px !important;
            border-radius: 20px !important;
            margin: 12px !important;
            max-height: calc(100vh - 24px) !important;
          }
          h1 {
            font-size: 24px !important;
          }
          input, select {
            font-size: 16px !important; /* 防止iOS自动缩放 */
          }
        }
        @media (min-width: 769px) {
          form {
            max-width: 800px !important;
            padding: 48px 40px !important;
          }
        }
        @media (max-height: 700px) {
          .login-container {
            align-items: flex-start !important;
            padding-top: 20px !important;
            padding-bottom: 20px !important;
          }
          form {
            max-height: calc(100vh - 40px) !important;
          }
        }
        /* 确保CompanyPicker在移动端可见 */
        @media (max-width: 480px) {
          .company-picker-container {
            margin-bottom: 16px !important;
          }
        }
        /* 触摸设备优化 */
        @media (hover: none) and (pointer: coarse) {
          button {
            min-height: 44px !important; /* iOS推荐的最小触摸目标 */
          }
          input, select {
            min-height: 44px !important;
          }
        }
      `}</style>

      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: '800px',
          maxHeight: '90vh',
          borderRadius: '24px',
          padding: '40px 32px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1)',
          background: 'rgba(255,255,255,0.98)',
          backdropFilter: 'blur(10px)',
          position: 'relative',
          zIndex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {/* Logo/标题区域 */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            marginBottom: '0px',
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              fontWeight: 'bold',
              color: '#fff',
              boxShadow: '0 8px 16px rgba(102, 126, 234, 0.3)',
              flexShrink: 0,
            }}>
              O
            </div>
            <h1 style={{
              fontSize: '28px',
              fontWeight: '700',
              margin: 0,
              color: '#111827',
              letterSpacing: '-0.5px',
            }}>
              欢迎回来
            </h1>
          </div>
        </div>

        {/* 域名选择框 */}
        <div style={{ marginBottom: '20px' }}>
          <DomainPicker onChange={setPreset} />
        </div>

        {/* 账号输入框 */}
        <div style={{ marginBottom: '20px', position: 'relative' }}>
          <label style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: '600',
            color: '#374151',
            marginBottom: '8px',
          }}>
            账号
          </label>
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}>
            <input
              ref={loginInputRef}
              value={login}
              onChange={(e) => {
                setLogin(e.target.value);
                setErr('');
              }}
              onFocus={() => setFocusedField('login')}
              onBlur={() => setFocusedField(null)}
              required
              autoComplete="username"
              placeholder="请输入邮箱或账号"
              style={{
                width: '100%',
                padding: '14px 16px',
                paddingLeft: '44px',
                border: `2px solid ${focusedField === 'login' ? '#667eea' : '#e5e7eb'}`,
                borderRadius: '12px',
                outline: 'none',
                fontSize: '15px',
                transition: 'all 0.2s ease',
                background: focusedField === 'login' ? '#fff' : '#f9fafb',
                boxShadow: focusedField === 'login' ? '0 0 0 4px rgba(102, 126, 234, 0.1)' : 'none',
              }}
            />
            <span style={{
              position: 'absolute',
              left: '16px',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '18px',
              color: focusedField === 'login' ? '#667eea' : '#9ca3af',
              transition: 'color 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              lineHeight: '1',
            }}>
              👤
            </span>
          </div>
        </div>

        {/* 密码输入框 */}
        <div style={{ marginBottom: '20px', position: 'relative' }}>
          <label style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: '600',
            color: '#374151',
            marginBottom: '8px',
          }}>
            密码
          </label>
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErr('');
              }}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
              required
              autoComplete="current-password"
              placeholder="请输入密码"
              style={{
                width: '100%',
                padding: '14px 16px',
                paddingLeft: '44px',
                paddingRight: '48px',
                border: `2px solid ${focusedField === 'password' ? '#667eea' : '#e5e7eb'}`,
                borderRadius: '12px',
                outline: 'none',
                fontSize: '15px',
                transition: 'all 0.2s ease',
                background: focusedField === 'password' ? '#fff' : '#f9fafb',
                boxShadow: focusedField === 'password' ? '0 0 0 4px rgba(102, 126, 234, 0.1)' : 'none',
              }}
            />
            <span style={{
              position: 'absolute',
              left: '16px',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '18px',
              color: focusedField === 'password' ? '#667eea' : '#9ca3af',
              transition: 'color 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              lineHeight: '1',
            }}>
              🔒
            </span>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '12px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6b7280',
                fontSize: '18px',
                transition: 'color 0.2s ease',
              }}
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
            >
              {showPassword ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
        </div>

        {/* 记住登录选项 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
        }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            userSelect: 'none',
            fontSize: '14px',
            color: '#374151',
          }}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              style={{
                width: '18px',
                height: '18px',
                marginRight: '10px',
                cursor: 'pointer',
                accentColor: '#667eea',
              }}
            />
            <span>保持登录 30 天</span>
          </label>
        </div>

        {/* 错误提示 */}
        {err ? (
          <div
            className={err ? 'shake' : ''}
            style={{
              color: '#dc2626',
              marginBottom: '20px',
              fontSize: '14px',
              padding: '12px 16px',
              background: '#fee2e2',
              borderRadius: '10px',
              border: '1px solid #fecaca',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>⚠️</span>
            <span>{err}</span>
          </div>
        ) : null}

        {/* 登录按钮 */}
        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '12px',
            border: 'none',
            background: canSubmit
              ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
              : '#d1d5db',
            color: '#fff',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontWeight: '600',
            fontSize: '16px',
            letterSpacing: '0.3px',
            transition: 'all 0.2s ease',
            boxShadow: canSubmit
              ? '0 4px 12px rgba(102, 126, 234, 0.4)'
              : 'none',
            transform: canSubmit ? 'translateY(0)' : 'none',
            opacity: submitting ? 0.7 : 1,
          }}
          onMouseEnter={(e) => {
            if (canSubmit) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.5)';
            }
          }}
          onMouseLeave={(e) => {
            if (canSubmit) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
            }
          }}
          >
            {submitting ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span style={{
                  display: 'inline-block',
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff',
                  borderRadius: '50%',
                  animation: 'spin 0.6s linear infinite',
                }} />
                登录中…
              </span>
            ) : (
              <>
                <span style={{ display: 'inline-block', marginRight: '8px' }}>🔐</span>
                <span>登录</span>
              </>
            )}
          </button>

        {/* 分隔线 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          margin: '32px 0',
          gap: '16px',
        }}>
          <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
          <span style={{ fontSize: '13px', color: '#9ca3af' }}>或</span>
          <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
        </div>

        {/* 设备回收入口 */}
        <button
          type="button"
          onClick={() => window.location.href = '/recycle'}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '12px',
            border: '2px solid #e5e7eb',
            background: '#fff',
            color: '#374151',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '15px',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#667eea';
            e.currentTarget.style.color = '#667eea';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e5e7eb';
            e.currentTarget.style.color = '#374151';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          设备回收 (无需登录)
        </button>
      </form>
    </div>
  );
}
