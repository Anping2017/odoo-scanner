'use client';
import { useEffect, useState } from 'react';

export type DomainPreset = { key: string; label: string; url: string; db: string };

const PRESETS: DomainPreset[] = [
  { key: 'moboplus.co.nz', label: 'https://moboplus.co.nz', url: 'https://moboplus.co.nz', db: 'odoo' },
  { key: 'repair.raytech.co.nz', label: 'https://repair.raytech.co.nz', url: 'https://repair.raytech.co.nz', db: 'db-raytech-repair' },
];

type Props = {
  initialKey?: string;
  onChange: (preset: DomainPreset) => void;
};

export default function DomainPicker({ initialKey, onChange }: Props) {
  const [sel, setSel] = useState<string>(initialKey || PRESETS[0].key);

  useEffect(() => {
    const p = PRESETS.find((x) => x.key === sel) || PRESETS[0];
    onChange(p);
  }, [sel, onChange]);

  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>选择域名</div>
      <select
        value={sel}
        onChange={(e) => setSel(e.target.value)}
        style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, outline: 'none' }}
      >
        {PRESETS.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}
