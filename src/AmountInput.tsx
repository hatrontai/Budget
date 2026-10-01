import { useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { formatVndEdit } from './shared';

export default function AmountInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const composing = useRef(false);
  const [draft, setDraft] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (pendingCaret.current !== null && !composing.current && inputRef.current === document.activeElement) {
      inputRef.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  });

  function commit(input: HTMLInputElement) {
    const result = formatVndEdit(input.value, input.selectionStart ?? input.value.length);
    pendingCaret.current = result.caret;
    composing.current = false;
    setDraft(null);
    onChange(result.value);
  }

  function edit(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    if (composing.current || (event.nativeEvent as InputEvent).isComposing) {
      composing.current = true;
      setDraft(input.value);
      return;
    }
    commit(input);
  }

  function remove(event: KeyboardEvent<HTMLInputElement>) {
    if (composing.current || event.nativeEvent.isComposing) return;
    const input = event.currentTarget;
    const start = input.selectionStart;
    if (start === null || start !== input.selectionEnd) return;
    if (event.key === 'Backspace' && input.value[start - 1] === '.') {
      input.setSelectionRange(start - 1, start - 1);
    } else if (event.key === 'Delete' && input.value[start] === '.') {
      input.setSelectionRange(start + 1, start + 1);
    }
  }

  return <input ref={inputRef} type="text" inputMode="numeric" maxLength={17}
    placeholder="Ví dụ: 50.000" value={draft ?? value} onChange={edit} onKeyDown={remove}
    onCompositionStart={event => {
      composing.current = true;
      pendingCaret.current = null;
      setDraft(event.currentTarget.value);
    }}
    onCompositionEnd={event => commit(event.currentTarget)}
    onBlur={event => { if (composing.current) commit(event.currentTarget); }} required />;
}
