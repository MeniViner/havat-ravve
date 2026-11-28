import type { ReactNode } from 'react';

/** Native disclosure keeps the list open while several independent checkboxes are selected. */
export function CheckboxSelect({ label, summary, children }: { label: string; summary: string; children: ReactNode }) {
  return <details className="k-check-select">
    <summary><span>{label}</span><small>{summary || 'בחירה'}</small></summary>
    <div role="group" aria-label={label}>{children}</div>
  </details>;
}
