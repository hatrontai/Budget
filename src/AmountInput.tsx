import { useLayoutEffect, useRef, type ChangeEvent, type KeyboardEvent } from 'react';
import { formatVndEdit } from './shared';

export default function AmountInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (pendingCaret.current !== null && inputRef.current === document.activeElement) {
      inputRef.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  });

  function edit(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const result = formatVndEdit(input.value, input.selectionStart ?? input.value.length);
    pendingCaret.current = result.caret;
    onChange(result.value);
  }

  function remove(event: KeyboardEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const start = input.selectionStart;
    if (start === null || start !== input.selectionEnd) return;
    // Let the browser delete a digit when the caret is next to a separator.
    if (event.key === 'Backspace' && input.value[start - 1] === '.') {
      input.setSelectionRange(start - 1, start - 1);
    } else if (event.key === 'Delete' && input.value[start] === '.') {
      input.setSelectionRange(start + 1, start + 1);
    }
  }

  return <input ref={inputRef} type="text" inputMode="numeric" maxLength={17}
    placeholder="Ví dụ: 50.000" value={value} onChange={edit} onKeyDown={remove} required />;
}
