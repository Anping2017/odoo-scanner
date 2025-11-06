'use client';
import { useEffect, useState } from 'react';

type Props = {
  show?: boolean;          // 仅当选中 moboplus 时为 true
  required?: boolean;      // moboplus 下必选
  initialId?: number;
  onChange: (id: number | undefined) => void;
};

export default function CompanyPicker({ show = false, required = false, initialId, onChange }: Props) {
  const [val, setVal] = useState<string>(initialId ? String(initialId) : '');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    onChange(val ? Number(val) : undefined);
  }, [val, onChange]);

  if (!show) return null;

  const companies = [
    { id: 1, name: 'Brownsbay' },
    { id: 2, name: 'Birkenhead' },
    { id: 3, name: 'Avondale' },
    { id: 4, name: 'Moboplus' },
  ];

  return (
    <>
      <style>{`
        @media (max-width: 480px) {
          .company-grid {
            grid-template-columns: 1fr !important;
          }
          .company-item {
            padding: 14px 16px !important;
          }
        }
      `}</style>
      <div style={{
        border: `2px solid ${touched && required && !val ? '#dc2626' : '#e5e7eb'}`,
        padding: '20px',
        borderRadius: '12px',
        marginTop: '4px',
        background: '#f9fafb',
        transition: 'all 0.2s ease',
      }}>
        <div style={{
          fontSize: '11px',
          fontWeight: '300',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          color: '#6b7280',
          marginBottom: '10px',
          letterSpacing: '0.2px',
        }}>
          选择公司 <span style={{ color: '#dc2626' }}>{required ? '*' : ''}</span>
        </div>
        <div className="company-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '12px',
        }}>
        {companies.map((company) => (
          <label
            key={company.id}
            className="company-item"
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 16px',
              borderRadius: '10px',
              border: `2px solid ${val === String(company.id) ? '#667eea' : '#e5e7eb'}`,
              background: val === String(company.id) ? '#f0f4ff' : '#fff',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              userSelect: 'none',
            }}
            onMouseEnter={(e) => {
              if (val !== String(company.id)) {
                e.currentTarget.style.borderColor = '#c7d2fe';
                e.currentTarget.style.background = '#f9fafb';
              }
            }}
            onMouseLeave={(e) => {
              if (val !== String(company.id)) {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.background = '#fff';
              }
            }}
          >
            <input
              type="radio"
              name="company"
              value={company.id}
              checked={val === String(company.id)}
              onChange={(e) => {
                setVal(e.target.value);
                setTouched(true);
              }}
              onBlur={() => setTouched(true)}
              style={{
                marginRight: '10px',
                width: '18px',
                height: '18px',
                cursor: 'pointer',
                accentColor: '#667eea',
              }}
            />
            <div>
              <div style={{
                fontWeight: '400',
                fontSize: '13px',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                color: '#111827',
                letterSpacing: '0.1px',
              }}>
                {company.id}: {company.name}
              </div>
            </div>
          </label>
        ))}
      </div>
      {required && touched && !val ? (
        <div style={{
          color: '#dc2626',
          marginTop: '12px',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <span>⚠️</span>
          <span>请先选择公司</span>
        </div>
      ) : null}
      </div>
    </>
  );
}
