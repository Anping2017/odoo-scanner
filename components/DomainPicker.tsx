'use client';
import { useEffect, useState } from 'react';

export type DomainPreset = { key: string; label: string; url: string; db: string };

const PRESETS: DomainPreset[] = [
  { key: 'moboplus.co.nz', label: 'https://moboplus.co.nz', url: 'https://moboplus.co.nz', db: 'test' },
  { key: 'repair.raytech.co.nz', label: 'https://repair.raytech.co.nz', url: 'https://repair.raytech.co.nz', db: 'db-raytech-repair' },
  { key: 'localhost:8069', label: 'http://localhost:8069', url: 'http://localhost:8069', db: 'test-odoo2' },
];


type Props = {
  initialKey?: string;
  onChange: (preset: DomainPreset) => void;
};

export default function DomainPicker({ initialKey, onChange }: Props) {
  const [sel, setSel] = useState<string>(initialKey || PRESETS[0].key);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const p = PRESETS.find((x) => x.key === sel) || PRESETS[0];
    onChange(p);
  }, [sel, onChange]);

  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
        选择域名
      </div>
      <div style={{ position: 'relative' }}>
        <select
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%',
            padding: '14px 16px',
            paddingLeft: '44px',
            border: `2px solid ${focused ? '#667eea' : '#e5e7eb'}`,
            borderRadius: '12px',
            outline: 'none',
            fontSize: '15px',
            transition: 'all 0.2s ease',
            background: focused ? '#fff' : '#f9fafb',
            boxShadow: focused ? '0 0 0 4px rgba(102, 126, 234, 0.1)' : 'none',
            cursor: 'pointer',
            appearance: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
          }}
        >
          {PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <span style={{
          position: 'absolute',
          left: '16px',
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '18px',
          color: focused ? '#667eea' : '#9ca3af',
          transition: 'color 0.2s ease',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          🌐
        </span>
        <span style={{
          position: 'absolute',
          right: '16px',
          fontSize: '12px',
          color: '#9ca3af',
          pointerEvents: 'none',
          top: '50%',
          transform: 'translateY(-50%)',
        }}>
          ▼
        </span>
      </div>
    </label>
  );
}
