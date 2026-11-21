// Icons of the v2 design, extracted verbatim from design/html/*.html by script (every distinct icon).
// All are stroke icons: viewBox 0 0 24 24, fill none, stroke currentColor, width 1.8, round caps and joins.
// The gate result screens (E3, E5) draw `check` and `close` with strokeWidth 3: pass strokeWidth={3}.
// The comment on each entry names the icon's meaning and a few design ids that use it.
import type { CSSProperties } from 'react';

type El = [tag: 'path' | 'circle' | 'rect', attrs: Record<string, string | number>];

const ICONS = {
  /** person silhouette (photo placeholder) (A1-Photo, A2-Crop) */
  'user': [["circle",{"cx":12,"cy":9,"r":3.5}],["path",{"d":"M5 20a7 7 0 0 1 14 0"}]],
  /** take a photo (A1-Photo, B4-Receive, C12-Profile) */
  'camera': [["path",{"d":"M4 8h3l1.5-2h7L17 8h3v11H4z"}],["circle",{"cx":12,"cy":13,"r":3.5}]],
  /** done / confirm (A2-Crop, B4-Receive, C3-TaskLinks) */
  'check': [["path",{"d":"m5 12.5 4.5 4.5L19 7"}]],
  /** farm buildings (nav: החווה) (B1-Compose, B2-Sent, B3-Read) */
  'farm': [["path",{"d":"M3 20V10l6-5 6 5v10M15 20v-7h6v7M3 20h18M8 20v-5h2v5"}]],
  /** announcement to team (B1-Compose, B4-Receive, V4-Staffing) */
  'megaphone': [["path",{"d":"M4 10v4h3l7 4V6l-7 4zM17 9a4 4 0 0 1 0 6"}]],
  /** chevron pointing right: the back link in RTL (B2-Sent, B3-Read, C1-Notifs) */
  'back': [["path",{"d":"m9 6 6 6-6 6"}]],
  /** add (B2-Sent, B4-Receive, C3-TaskLinks) */
  'plus': [["path",{"d":"M12 5v14M5 12h14"}]],
  /** checklist (nav: משימות) (B2-Sent, B3-Read, B4-Receive) */
  'tasks': [["path",{"d":"M9 6h11M9 12h11M9 18h11"}],["path",{"d":"m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"}]],
  /** shopping cart (nav: קניות) (B2-Sent, B3-Read, B4-Receive) */
  'cart': [["path",{"d":"M3 4h2l2.4 11h10.2L20 7H6.2"}],["circle",{"cx":9,"cy":19,"r":1.4}],["circle",{"cx":17,"cy":19,"r":1.4}]],
  /** four squares (nav: ניהול) (B2-Sent, B3-Read, C12-Profile) */
  'grid': [["rect",{"x":4,"y":4,"width":7,"height":7,"rx":1.5}],["rect",{"x":13,"y":4,"width":7,"height":7,"rx":1.5}],["rect",{"x":4,"y":13,"width":7,"height":7,"rx":1.5}],["rect",{"x":13,"y":13,"width":7,"height":7,"rx":1.5}]],
  /** speech bubble / WhatsApp (B3-Read, C5-Teammate, D1-Invite) */
  'message': [["path",{"d":"M4 20l1.5-4A8 8 0 1 1 9 19z"}]],
  /** magnifier (B4-Receive, C2-Search, C4-Assign) */
  'search': [["circle",{"cx":11,"cy":11,"r":6}],["path",{"d":"m20 20-4.5-4.5"}]],
  /** notifications (B4-Receive, C8-Offline, E1-Home) */
  'bell': [["path",{"d":"M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0"}]],
  /** map pin / place (B4-Receive, C2-Search, C3-TaskLinks) */
  'pin': [["path",{"d":"M12 21s6-5.6 6-11a6 6 0 0 0-12 0c0 5.4 6 11 6 11z"}],["circle",{"cx":12,"cy":10,"r":2}]],
  /** record voice (B4-Receive, C8-Offline, F1-Root) */
  'mic': [["rect",{"x":9,"y":3,"width":6,"height":11,"rx":3}],["path",{"d":"M5 11a7 7 0 0 0 14 0M12 18v3"}]],
  /** chevron pointing left: forward / open a row in RTL (C1-Notifs, C12-Profile, C2-Search) */
  'chevron': [["path",{"d":"m15 6-6 6 6 6"}]],
  /** QR code / gate scan (C1-Notifs, C3-TaskLinks, E1-Home) */
  'qr': [["rect",{"x":4,"y":4,"width":6,"height":6}],["rect",{"x":14,"y":4,"width":6,"height":6}],["rect",{"x":4,"y":14,"width":6,"height":6}],["path",{"d":"M14 14h2v2M20 14v6h-4M14 20v-2"}]],
  /** pencil (C12-Profile, C3-TaskLinks, D7-Stall) */
  'edit': [["path",{"d":"M4 20h4L19 9l-4-4L4 16zM13 7l4 4"}]],
  /** bell with a wider base (profile notification settings) (C12-Profile, L6-Me) */
  'bell-settings': [["path",{"d":"M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"}]],
  /** two people / team (C12-Profile, C4-Assign, D3-Home) */
  'people': [["circle",{"cx":9,"cy":9,"r":3}],["path",{"d":"M3 19a6 6 0 0 1 12 0M16 6a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5"}]],
  /** export / download (C12-Profile, F6-Event, L6-Me) */
  'download': [["path",{"d":"M12 4v11m0 0-4-4m4 4 4-4M5 20h14"}]],
  /** event ticket (C12-Profile, L6-Me, M1-Root) */
  'ticket': [["path",{"d":"M4 8a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v8a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2z"}],["path",{"d":"M14 7v10","strokeDasharray":"2 2"}]],
  /** call (C5-Teammate, D11-HelperHome, D4-Event) */
  'phone': [["path",{"d":"M6 4h3l2 5-2 1a11 11 0 0 0 5 5l1-2 5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 4 6a2 2 0 0 1 2-2z"}]],
  /** wifi off (C8-Offline) */
  'offline': [["path",{"d":"M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4-2.6M19 13a10 10 0 0 0-5-3M12 20h.01"}]],
  /** calendar (D10-Empty, D11-HelperHome, D3-Home) */
  'calendar': [["rect",{"x":4,"y":5,"width":16,"height":15,"rx":2}],["path",{"d":"M4 10h16M8 3v4M16 3v4"}]],
  /** market stall / shop (D10-Empty, D11-HelperHome, D3-Home) */
  'stall': [["path",{"d":"M4 10l1.5-5h13L20 10M5 10v9h14v-9M4 10a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M10 19v-5h4v5"}]],
  /** document (D3-Home, D4-Event, V3-Files) */
  'file': [["path",{"d":"M7 3h7l4 4v14H7zM14 3v4h4"}]],
  /** navigation arrow (D4-Event, D5-Day, L4-Place, T3-Task) */
  'nav': [["path",{"d":"M12 3 5 20l7-4 7 4z"}]],
  /** lightning / live (D6-DayLive) */
  'bolt': [["path",{"d":"M13 3 5 13h6l-1 8 8-10h-6z"}]],
  /** package / supplies (D6-DayLive) */
  'box': [["path",{"d":"M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8"}]],
  /** question in a circle (D6-DayLive) */
  'help': [["circle",{"cx":12,"cy":12,"r":8}],["path",{"d":"M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.700M12 16.500v.5"}]],
  /** X / remove / cancelled (D8-Helper, G1-Amounts, E5-Bad with strokeWidth 3) */
  'close': [["path",{"d":"m6 6 12 12M18 6 6 18"}]],
  /** reorder handle (G1-Amounts, G2-VisitTypes, G3-Questions) */
  'drag': [["path",{"d":"M5 9h14M5 15h14"}]],
  /** donation (M1-Root, M2-Inbox, Z4-DemoOwner) */
  'heart': [["path",{"d":"M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"}]],
  /** bar chart / reports (M1-Root, Z4-DemoOwner) */
  'chart': [["path",{"d":"M4 20V10M10 20V4M16 20v-8M22 20H2"}]],
  /** settings sliders (M1-Root, Z4-DemoOwner) */
  'sliders': [["path",{"d":"M4 7h10M18 7h2M4 17h2M10 17h10"}],["circle",{"cx":16,"cy":7,"r":2}],["circle",{"cx":8,"cy":17,"r":2}]],
  /** link / URL (S4-Item, S5-Add) */
  'link': [["path",{"d":"M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"}]],
  /** circle with a slash / suspended (X2-Suspended) */
  'blocked': [["circle",{"cx":12,"cy":12,"r":8}],["path",{"d":"m6.5 6.5 11 11"}]],
  /** opens a menu (Z2-DemoBanner, Z3-DemoSwitch, Z4-DemoOwner) */
  'chevron-down': [["path",{"d":"m6 9 6 6 6-6"}]],
  /** leave / log out (Z2-DemoBanner, Z3-DemoSwitch, Z4-DemoOwner) */
  'exit': [["path",{"d":"M10 5H5v14h5M14 8l4 4-4 4M18 12H9"}]],
} satisfies Record<string, El[]>;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export interface IconProps {
  name: IconName;
  /** Rendered width and height in px. The design uses 14 to 24 in UI, 28 to 104 in gate and empty states. Default 22. */
  size?: number;
  /** Stroke width. Default 1.8; 3 on the gate result screens. */
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
  /** Only for an icon that stands alone and carries meaning; otherwise the icon stays aria-hidden. */
  label?: string;
}

export function Icon({ name, size = 22, strokeWidth = 1.8, className, style, label }: IconProps) {
  const els = ICONS[name] as El[];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `k-icon ${className}` : 'k-icon'}
      style={style}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      {els.map(([Tag, attrs], i) => (
        <Tag key={i} {...attrs} />
      ))}
    </svg>
  );
}
