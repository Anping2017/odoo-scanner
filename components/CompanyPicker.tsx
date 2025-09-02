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

  return (
    <fieldset style={{ border: '1px solid #e5e7eb', padding: 12, borderRadius: 8, marginTop: 12 }}>
      <legend style={{ padding: '0 6px' }}>选择公司（1:Brownsbay,2:Birkenhead,3:Avondale,4:Moboplus）</legend>
      {[1, 2, 3, 4].map((id) => (
        <label key={id} style={{ display: 'inline-flex', alignItems: 'center', marginRight: 16 }}>
          <input
            type="radio"
            name="company"
            value={id}
            checked={val === String(id)}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => setTouched(true)}
            style={{ marginRight: 6 }}
          />
          {id}
        </label>
      ))}
      {required && touched && !val ? (
        <div style={{ color: '#dc2626', marginTop: 8, fontSize: 12 }}>请先选择公司 ID</div>
      ) : null}
    </fieldset>
  );
}
