// app/api/logout/route.ts
import { NextResponse } from 'next/server';

function clearCookie(res: NextResponse, name: string) {
  res.cookies.set({
    name,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
}

function buildResponse() {
  const res = NextResponse.json({ ok: true });
  ['odoo_session_id', 'odoo_base', 'odoo_db'].forEach(n => clearCookie(res, n));
  return res;
}

export async function POST() { return buildResponse(); }
export async function GET() { return buildResponse(); }
