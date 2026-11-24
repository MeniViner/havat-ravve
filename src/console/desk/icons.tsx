// The sidebar's and the pages' icons that the v2 kit draws differently or does not have (paths from the console designs).
import type { ReactNode } from 'react';

const P: Record<string, ReactNode> = {
  server: <><rect x="4" y="5" width="16" height="6" rx="1.5" /><rect x="4" y="13" width="16" height="6" rx="1.5" /><path d="M8 8h.01M8 16h.01" /></>,
  pulse: <path d="M3 12h4l2-6 4 12 2-6h6" />,
  bolt: <path d="M13 3 5 13h6l-1 8 8-10h-6z" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />,
  eye: <><path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12z" /><circle cx="12" cy="12" r="2.500" /></>,
  coin: <><circle cx="12" cy="12" r="8" /><path d="M12 7.500v9M14.500 9.500c-.5-1-1.500-1.300-2.500-1.300-1.500 0-2.500.8-2.500 1.900 0 2.400 5 1.200 5 3.800 0 1.100-1 1.900-2.500 1.900-1.200 0-2.200-.4-2.700-1.400" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  people: <><circle cx="9" cy="9" r="3" /><path d="M3 19a6 6 0 0 1 12 0M16 6a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5" /></>,
  upload: <path d="M12 16V5M8 9l4-4 4 4M5 19h14" />,
  box: <path d="M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8" />,
  mail: <><rect x="4" y="6" width="16" height="12" rx="1.5" /><path d="m4 8 8 5 8-5" /></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M8 3v4M16 3v4" /></>,
  toggle: <><rect x="3" y="8" width="18" height="8" rx="4" /><circle cx="16" cy="12" r="2" /></>,
  key: <><circle cx="8" cy="15" r="3.5" /><path d="M10.500 12.500 19 4M16 7l2 2M13.500 9.500l2 2" /></>,
  play: <path d="M8 5v14l11-7z" />,
  shield: <path d="M12 3l7 3v6c0 4.500-3 7.500-7 9-4-1.500-7-4.500-7-9V6z" />,
  farm: <path d="M3 20V10l6-5 6 5v10M15 20v-7h6v7M3 20h18M8 20v-5h2v5" />,
  exit: <path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" />,
  refresh: <path d="M5 12a7 7 0 0 1 12-5l2 2M19 5v4h-4M19 12a7 7 0 0 1-12 5l-2-2M5 19v-4h4" />,
  download: <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />,
  search: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4.500-4.500" /></>,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12.500 4.500 4.500L19 7" />,
  bell: <path d="M6 16V11a6 6 0 0 1 12 0v5l1.500 2h-15zM10 20a2 2 0 0 0 4 0" />,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  down: <path d="m6 9 6 6 6-6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
};
export type DIconName = keyof typeof P;
export function DIcon({ name, size = 16, stroke = 1.8 }: { name: string; size?: number; stroke?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', display: 'block' }}>{P[name]}</svg>;
}
