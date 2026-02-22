// /lib/odooPresets.ts
export type HostPreset = { url: string; db: string; defaultLocationId?: number };

export const HOST_PRESETS: Record<string, HostPreset> = {
  'shop.moboplus.co.nz': {
    url: 'https://shop.moboplus.co.nz',
    db: 'test',
    defaultLocationId: 1, // TODO: 替换成真实 Internal 库位ID
  },
  'repair.raytech.co.nz': {
    url: 'https://repair.raytech.co.nz',
    db: 'db-raytech-repair',
    defaultLocationId: 1, // TODO: 替换成真实 Internal 库位ID
  },
  'localhost:8069': {
    url: 'http://localhost:8069',
    db: 'test-odoo2',
    defaultLocationId: 1, // TODO: 替换成真实 Internal 库位ID
  },
};

// 环境变量兜底：在服务器上设置 ODOO_URL / ODOO_DB（以及可选 ODOO_LOCATION_ID）
export const ENV_FALLBACK: HostPreset | undefined =
  process.env.ODOO_URL && process.env.ODOO_DB
    ? {
        url: process.env.ODOO_URL,
        db: process.env.ODOO_DB,
        defaultLocationId: Number(process.env.ODOO_LOCATION_ID || 0) || undefined,
      }
    : undefined;

export function resolvePreset(hostRaw?: string): HostPreset | undefined {
  const h = (hostRaw || '')
    .toLowerCase()
    .replace(/^www\./, '')
    .split(':')[0]; // 去端口

  // 匹配 shop.moboplus.co.nz（旧域名 moboplus.co.nz 已不再使用）
  if (h === 'shop.moboplus.co.nz') return HOST_PRESETS['shop.moboplus.co.nz'];
  if (h.endsWith('repair.raytech.co.nz') || h === 'raytech.co.nz')
    return HOST_PRESETS['repair.raytech.co.nz'];
  if (h === 'localhost') return HOST_PRESETS['localhost:8069'];

  // 回退到环境变量
  return ENV_FALLBACK;
}
