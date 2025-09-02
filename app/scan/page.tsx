'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Scanner from '@/components/Scanner';

type Product = {
  id: number;
  name: string;
  barcode?: string;
  default_code?: string;
  qty_available?: number;
  free_qty?: number;
  standard_price?: number; // 成本价
  lst_price?: number;      // 销售价
};

type HistoryItem = {
  id: number;
  date: string;
  qty_done: number;
  uom?: string;
  from?: string;
  to?: string;
  ref?: string;
  created_by?: string;
  updated_by?: string;
};

export default function ScanPage() {
  const [scanning, setScanning] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [lastCode, setLastCode] = useState<string>('');
  const [product, setProduct] = useState<Product | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [counted, setCounted] = useState<string>(''); // 盘点数量
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [updating, setUpdating] = useState(false);

  const fetchLockRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastFetchedCodeRef = useRef<string>('');

  const loadHistory = useCallback(async (pid: number) => {
    try {
      const res = await fetch(`/api/inventory?product_id=${pid}&limit=10`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      setHistory(Array.isArray(data?.history) ? data.history : []);
    } catch {
      setHistory([]);
    }
  }, []);

  const fetchByCode = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    if (fetchLockRef.current) return;
    if (lastFetchedCodeRef.current === trimmed) return;

    fetchLockRef.current = true;
    lastFetchedCodeRef.current = trimmed;
    setIsLoading(true);

    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch(`/api/product?code=${encodeURIComponent(trimmed)}`, {
        signal: ac.signal,
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      setLastCode(trimmed);
      const p = data?.product || null;
      setProduct(p);
      // 默认把盘点数量填成当前库存（可手改）
      setCounted(
        typeof p?.qty_available === 'number' ? String(p.qty_available) : ''
      );
      if (p?.id) loadHistory(p.id);
    } finally {
      setIsLoading(false);
      fetchLockRef.current = false;
    }
  }, [loadHistory]);

  const handleDetected = useCallback((code: string) => {
    if (!code) return;
    setScanning(false);
    setCodeInput(code);
    fetchByCode(code);
  }, [fetchByCode]);

  const handleRescan = useCallback(() => {
    setProduct(null);
    setLastCode('');
    setCodeInput('');
    setCounted('');
    setHistory([]);
    lastFetchedCodeRef.current = '';
    setScanning(true);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    window.location.href = '/';
  }, []);

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const val = codeInput.trim();
    if (!val) return;
    setScanning(false);
    fetchByCode(val);
  }, [codeInput, fetchByCode]);

  const handleClear = useCallback(() => {
    setProduct(null);
    setLastCode('');
    setCodeInput('');
    setCounted('');
    setHistory([]);
    lastFetchedCodeRef.current = '';
  }, []);

  // 格式化价格显示
  const formatPrice = (price?: number) => {
    if (price === undefined || price === null) return '-';
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY'
    }).format(price);
  };

  // 提交盘点：把产品在当前库位的数量调整到 counted
  const handleUpdateInventory = useCallback(async () => {
    if (!product?.id) return;
    const qty = Number(counted);
    if (Number.isNaN(qty)) {
      alert('请输入正确的数量');
      return;
    }
    setUpdating(true);
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ product_id: product.id, new_qty: qty }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || '更新失败');
      }
      // 成功后：刷新产品与历史
      // 允许再次查询同一条码
      lastFetchedCodeRef.current = '';
      if (lastCode) await fetchByCode(lastCode);
      if (product.id) await loadHistory(product.id);
      alert('库存已更新（Odoo 中已记录库存调整历史）。');
    } catch (e: any) {
      alert(e?.message || '库存更新失败');
    } finally {
      setUpdating(false);
    }
  }, [product?.id, counted, lastCode, fetchByCode, loadHistory]);

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: '#f8fafc',
        paddingBottom: 92,
      }}
    >
      {/* 顶部栏 */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
        }}
      >
        <div style={{ fontWeight: 700 }}>库存扫码</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleRescan}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff' }}
          >
            重新扫码
          </button>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #ef4444',
              background: '#fff',
              color: '#ef4444',
              fontWeight: 600,
            }}
          >
            退出
          </button>
        </div>
      </div>

      {/* 摄像头区域 */}
      <div style={{ padding: 12 }}>
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 12,
            background: '#000',
            height: '56vh',
          }}
        >
          {scanning ? (
            <Scanner onDetected={handleDetected} />
          ) : (
            <div
              style={{
                color: '#9ca3af',
                height: '100%',
                display: 'grid',
                placeItems: 'center',
                fontSize: 14,
              }}
            >
              摄像头已暂停
            </div>
          )}
        </div>

        {/* 最近条码 */}
        {lastCode ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              fontSize: 14,
            }}
          >
            最近条码：<strong>{lastCode}</strong>
            {isLoading ? <span style={{ marginLeft: 8, color: '#6b7280' }}>查询中…</span> : null}
          </div>
        ) : null}

        {/* 结果 + 盘点输入 */}
        <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
          {product ? (
            <div
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 14,
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{product.name}</div>
              <div style={{ color: '#6b7280', fontSize: 13 }}>
                条码：{product.barcode || '-'} | 编码：{product.default_code || '-'}
              </div>
              
              {/* 价格信息 */}
              <div style={{ marginTop: 8, fontSize: 14, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  成本：<strong style={{ color: '#dc2626' }}>{formatPrice(product.standard_price)}</strong>
                </div>
                <div>
                  售价：<strong style={{ color: '#059669' }}>{formatPrice(product.lst_price)}</strong>
                </div>
              </div>

              {/* 库存信息 */}
              <div style={{ marginTop: 8, fontSize: 14 }}>
                现有库存：<strong>{product.qty_available ?? '-'}</strong>
                {typeof product.free_qty === 'number' ? (
                  <span style={{ marginLeft: 10, color: '#6b7280' }}>可用：{product.free_qty}</span>
                ) : null}
              </div>

              {/* 盘点输入区 */}
              <div
                style={{
                  marginTop: 12,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <label style={{ fontSize: 14 }}>盘点数量（调整到）：</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={counted}
                  onChange={(e) => setCounted(e.target.value)}
                  style={{
                    width: 140,
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid #e5e7eb',
                    outline: 'none',
                    fontSize: 16,
                  }}
                />
                <button
                  onClick={handleUpdateInventory}
                  disabled={updating}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: 'none',
                    background: updating ? '#9ca3af' : '#111827',
                    color: '#fff',
                    fontWeight: 600,
                  }}
                >
                  {updating ? '更新中…' : '更新库存'}
                </button>
              </div>
            </div>
          ) : lastCode && !isLoading ? (
            <div
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 14,
                fontSize: 14,
              }}
            >
              未找到产品（条码：{lastCode}）
            </div>
          ) : null}

          {/* 最近调整记录 */}
          {product ? (
            <div
              style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}
            >
              <div style={{ fontWeight: 700, marginBottom: 8 }}>最近库存调整记录</div>
              {history.length ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {history.map((h) => (
                    <div
                      key={h.id}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: 10,
                        padding: 10,
                        fontSize: 13,
                        lineHeight: 1.5,
                      }}
                    >
                      <div><strong>{h.qty_done}</strong> {h.uom || ''}</div>
                      <div style={{ color: '#6b7280' }}>
                        {h.from || '-'} → {h.to || '-'}
                      </div>
                      <div style={{ color: '#6b7280' }}>
                        {new Date(h.date).toLocaleString()} | {h.created_by || h.updated_by || ''}
                      </div>
                      {h.ref ? <div style={{ color: '#6b7280' }}>Ref: {h.ref}</div> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#6b7280', fontSize: 13 }}>暂无记录</div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* 底部固定输入条（手动输入条码） */}
      <form
        onSubmit={handleSubmit}
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 20,
          background: '#fff',
          borderTop: '1px solid #e5e7eb',
          padding: '10px 12px calc(10px + env(safe-area-inset-bottom))',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <input
          inputMode="search"
          placeholder="手动输入/粘贴条码"
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          style={{
            flex: 1,
            padding: '12px 12px',
            borderRadius: 10,
            border: '1px solid #e5e7eb',
            outline: 'none',
            fontSize: 16,
          }}
        />
        <button
          type="submit"
          style={{
            padding: '12px 14px',
            borderRadius: 10,
            border: 'none',
            background: '#111827',
            color: '#fff',
            fontWeight: 600,
          }}
        >
          查询
        </button>
        <button
          type="button"
          onClick={handleClear}
          style={{
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid #e5e7eb',
            background: '#fff',
          }}
        >
          清空
        </button>
      </form>
    </div>
  );
}