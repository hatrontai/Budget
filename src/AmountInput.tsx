import { useState } from 'react';
import { formatVndInput } from './shared';

export default function AmountInput({ value, onChange, label = 'Số tiền (VND)', disabled = false, required = true }: { value: string; onChange: (value: string) => void; label?: string; disabled?: boolean; required?: boolean }) {
  const [focused, setFocused] = useState(false);
  const formatted = formatVndInput(value);
  return <>
    <input type="text" inputMode="numeric" maxLength={focused ? 13 : 17}
      aria-label={label} disabled={disabled} autoComplete="off" placeholder="Ví dụ: 2500"
      value={focused ? value : formatted}
      onFocus={event => { setFocused(true); onChange(event.currentTarget.value.replace(/\D/g, '')); }}
      onChange={event => onChange(event.currentTarget.value)}
      onBlur={event => { setFocused(false); onChange(formatVndInput(event.currentTarget.value)); }} required={required} />
    <small className="amount-preview" aria-hidden="true">{formatted ? formatted + ' ₫' : 'Số tiền sẽ được phân cách hàng nghìn khi nhập xong.'}</small>
  </>;
}
