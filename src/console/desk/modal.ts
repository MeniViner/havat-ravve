// While a window or a confirmation is open, Tab stays inside it.
import { useEffect } from 'react';

const INSIDE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';
export function useModalTrap() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const open = document.querySelectorAll<HTMLElement>('.k-sheet__panel, .d-dialog__box');
      const box = [...open].find((x) => x.matches('.k-sheet__panel')) || open[open.length - 1];
      if (!box) return;
      const all = [...box.querySelectorAll<HTMLElement>(INSIDE)].filter((x) => x.tabIndex >= 0 && x.offsetParent !== null);
      if (!all.length) { e.preventDefault(); box.focus(); return; }
      const at = all.indexOf(document.activeElement as HTMLElement);
      const out = at < 0 || (e.shiftKey ? at === 0 : at === all.length - 1);
      if (out) { e.preventDefault(); all[at < 0 ? (e.shiftKey ? all.length - 1 : 0) : e.shiftKey ? all.length - 1 : 0].focus(); }
    };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, []);
}
