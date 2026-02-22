import type { NextRequest } from 'next/server';
import http from 'node:http';
import https from 'node:https';

const ODOO_LOCATION_ID = process.env.ODOO_LOCATION_ID ? Number(process.env.ODOO_LOCATION_ID) : undefined;
const ALLOW_INSECURE_TLS = process.env.ALLOW_INSECURE_TLS === '1';
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true, rejectUnauthorized: !ALLOW_INSECURE_TLS });

const ALLOWED = (process.env.ODOO_ALLOWED_BASES || 'http://localhost:8069,https://shop.moboplus.co.nz,https://repair.raytech.co.nz')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function isAllowedBase(u: string) {
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) return false;
    return ALLOWED.includes(`${url.protocol}//${url.host}`);
  } catch { return false; }
}

export function getCookie(req: NextRequest, name: string) {
  const cookie = req.headers.get('cookie') || '';
  const re = new RegExp(`${name}=([^;]+)`);
  const m = cookie.match(re);
  return m ? decodeURIComponent(m[1]) : '';
}

export function getBaseFromCookie(req: NextRequest) {
  const b = getCookie(req, 'od_base');
  console.log('Cookie debug:', {
    cookie: req.headers.get('cookie'),
    od_base: b,
    isAllowed: b ? isAllowedBase(b) : false,
    allowedBases: ALLOWED
  });
  
  if (!b) {
    throw new Error('Odoo base missing - please login first');
  }
  
  if (!isAllowedBase(b)) {
    throw new Error(`Odoo base not allowed: ${b}. Allowed bases: ${ALLOWED.join(', ')}`);
  }
  
  return b.replace(/\/+$/, '');
}

export function getDbFromCookie(req: NextRequest) {
  return getCookie(req, 'od_db') || '';
}

export async function rpc(path: string, payload: any, sessionId: string, baseUrl?: string) {
  const base = (baseUrl || '').replace(/\/+$/, '');
  if (!base || !isAllowedBase(base)) throw new Error('Invalid or missing Odoo base');

  const url = `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionId) headers['Cookie'] = `session_id=${sessionId}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'call', params: payload }),
      cache: 'no-store',
      // @ts-ignore
      agent: (url.startsWith('https:') ? httpsAgent : httpAgent)
    });

    // 先读取响应文本，以便检查格式
    const responseText = await res.text().catch(() => '');
    
    if (!res.ok) {
      if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
        throw new Error(`Odoo返回了HTML错误页面 (HTTP ${res.status}): ${responseText.slice(0, 500)}`);
      }
      throw new Error(`HTTP ${res.status} ${res.statusText} when calling ${url} :: ${responseText.slice(0, 300)}`);
    }
    
    // 检查Content-Type，如果不是JSON则可能是HTML错误页面
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
        throw new Error(`Odoo返回了HTML错误页面，可能是会话过期或权限问题: ${responseText.slice(0, 500)}`);
      }
      throw new Error(`意外的Content-Type: ${contentType}, 响应: ${responseText.slice(0, 300)}`);
    }
    
    // 尝试解析JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (err) {
      if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
        throw new Error(`Odoo返回了HTML错误页面: ${responseText.slice(0, 500)}`);
      }
      throw new Error(`Invalid JSON from ${url}: ${String(err)}, 响应: ${responseText.slice(0, 300)}`);
    }
    
    if (data.error) {
      const msg = data.error?.data?.message || data.error?.message || 'Odoo RPC error';
      throw new Error(`${msg} @ ${url}`);
    }
    return data.result;
  } catch (e: any) {
    throw new Error(`Fetch to Odoo failed: ${e?.message || e}`);
  }
}

export function getSessionId(req: NextRequest): string | undefined {
  return getCookie(req, 'od_session');
}

export function getLoginUser(req: NextRequest): string | undefined {
  return getCookie(req, 'od_user');
}

export { ODOO_LOCATION_ID };
