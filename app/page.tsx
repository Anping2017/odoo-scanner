'use client';

import { useMemo, useState } from 'react';
import DomainPicker, { DomainPreset } from '@/components/DomainPicker';
import CompanyPicker from '@/components/CompanyPicker';

export default function LoginPage() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true); // 30 天保持登录
  const [preset, setPreset] = useState<DomainPreset | null>(null);
  const [companyId, setCompanyId] = useState<number | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const isMoboplus = preset?.key === 'moboplus.co.nz';

  const canSubmit = useMemo(() => {
    if (!login || !password || !preset) return false;
    if (isMoboplus && !companyId) return false;
    return !submitting;
  }, [login, password, preset, isMoboplus, companyId, submitting]);

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
          companyId: isMoboplus ? companyId : undefined, // 只有 moboplus 传公司
          baseUrl: preset.url,                             // 指定 Odoo URL
          dbName: preset.db,                               // 指定 Odoo DB
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || '登录失败');

      // 跳转到扫码页
      window.location.href = '/scan';
    } catch (e: any) {
      setErr(e?.message || '登录失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: 420,
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 20,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          background: '#fff',
        }}
      >
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>登录 Odoo</h1>

        {/* 域名选择框（决定 baseUrl/dbName） */}
        <DomainPicker onChange={setPreset} />

        <label style={{ display: 'block', marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>账号</div>
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            required
            autoComplete="username"
            placeholder="登录邮箱/账号"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, outline: 'none' }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>密码</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="密码"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, outline: 'none' }}
          />
        </label>

        {/* moboplus 域名时，显示公司 ID 单选（1/2/3/4） */}
        <CompanyPicker show={isMoboplus} required={isMoboplus} onChange={setCompanyId} />

        <label style={{ display: 'flex', alignItems: 'center', marginTop: 12 }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ marginRight: 8 }} />
          保持登录 30 天
        </label>

        {err ? <div style={{ color: '#dc2626', marginTop: 12, fontSize: 13 }}>{err}</div> : null}

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            marginTop: 16,
            width: '100%',
            padding: '12px 14px',
            borderRadius: 10,
            border: 'none',
            background: canSubmit ? '#111827' : '#9ca3af',
            color: '#fff',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontWeight: 600,
            letterSpacing: 0.3,
          }}
        >
          {submitting ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  );
}
