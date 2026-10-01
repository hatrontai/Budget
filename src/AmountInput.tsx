import { useState } from 'react';
import { formatVndInput } from './shared';

export default function AmountInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [focused, setFocused] = useState(false);
  const formatted = formatVndInput(value);
  return <>
    <input type="text" inputMode="numeric" maxLength={focused ? 13 : 17}
      aria-label="Số tiền (VND)" autoComplete="off" placeholder="Ví dụ: 2500"
      value={focused ? value : formatted}
      onFocus={event => { setFocused(true); onChange(event.currentTarget.value.replace(/\D/g, '')); }}
      onChange={event => onChange(event.currentTarget.value)}
      onBlur={event => { setFocused(false); onChange(formatVndInput(event.currentTarget.value)); }} required />
    <small className="amount-preview" aria-hidden="true">{formatted ? formatted + ' ₫' : 'Số tiền sẽ được phân cách hàng nghìn khi nhập xong.'}</small>
  </>;
}
