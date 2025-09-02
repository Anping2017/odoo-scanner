import type { NextRequest } from 'next/server';
import http from 'node:http';
import https from 'node:https';

const ODOO_LOCATION_ID = process.env.ODOO_LOCATION_ID ? Number(process.env.ODOO_LOCATION_ID) : undefined;
const ALLOW_INSECURE_TLS = process.env.ALLOW_INSECURE_TLS === '1';
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true, rejectUnauthorized: !ALLOW_INSECURE_TLS });

const ALLOWED = (process.env.ODOO_ALLOWED_BASES || '')
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

export function getSessionId(req: NextRequest) {
  return getCookie(req, 'odoo_session_id');
}

export function getBaseFromCookie(req: NextRequest) {
  const b = getCookie(req, 'odoo_base');
  if (!b || !isAllowedBase(b)) throw new Error('Odoo base missing or not allowed');
  return b.replace(/\/+$/, '');
}

export function getDbFromCookie(req: NextRequest) {
  return getCookie(req, 'odoo_db') || '';
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

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText} when calling ${url} :: ${text.slice(0, 300)}`);
    }
    const data = await res.json().catch(err => { throw new Error(`Invalid JSON from ${url}: ${String(err)}`); });
    if (data.error) {
      const msg = data.error?.data?.message || data.error?.message || 'Odoo RPC error';
      throw new Error(`${msg} @ ${url}`);
    }
    return data.result;
  } catch (e: any) {
    throw new Error(`Fetch to Odoo failed: ${e?.message || e}`);
  }
}

export { ODOO_LOCATION_ID };
