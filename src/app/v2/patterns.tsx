// Screen-level wiring of the shared tidy patterns (the kit parts are in kit/patterns.tsx):
//   useTableView  Q9: "צפייה בטבלה" opens `<route>/table` (its own screen, same nav tab) and "ייצוא לאקסל" downloads the CSV.
//                 Both are ⋯ items (Q5), never top-bar text.
//   usePayConfirm Q7: after a payment is approved, the sheet that sends the confirmation (WhatsApp / automatic e-mail / none).
import { useState, type ReactNode } from 'react';
import { back, navigate, useRoute, useSearch } from '../router';
import { AppScreen, useExternal, useToast, useV2, waUrl } from './core';
import { Button, DataTable, PageTitle, PayConfirmSheet, TopBar, type ActionItem, type PayChannel, type TableCell } from './kit';
import { downloadCsv } from './data/manage';
import { fillTemplate, markPaymentConfirmation, receiptDestination, receiptPreference } from '../data';
import { DEFAULT_SETTINGS } from '../types';
import { money } from './format';

/* ═════════════ Q9 table view ═════════════ */

type Cell = string | number | null | undefined;
export type TableViewSpec = {
  /** The list's name: the back link on the table screen and the start of its title ("תרומות"). */
  title: string;
  /** The current filter, added to the title ("החודש" → "תרומות · החודש"). */
  filter?: string;
  /** CSV file name ("donations.csv"). */
  filename: string;
  headers: string[];
  /** Read when the table opens or the file downloads, so it always follows the current filter. */
  rows: () => Cell[][];
};
const clean = (rows: Cell[][]): TableCell[][] => rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : c)));

/**
 * Table view and export for a list screen. Call it at the top of the screen and return `screen` when `active`:
 *   const table = useTableView({...}); if (table.active) return table.screen;
 * Put `table.items` into the screen's MoreMenu.
 */
export function useTableView(spec: TableViewSpec) {
  const route = useRoute();
  const search = useSearch();
  const active = route.endsWith('/table');
  const base = active ? route.slice(0, -'/table'.length) || '/' : route;
  const open = () => navigate(`${base}/table${search}`);
  const download = () => downloadCsv(spec.filename, spec.headers, clean(spec.rows()));
  const items: ActionItem[] = [
    { label: 'צפייה בטבלה', icon: 'table', meta: 'כל העמודות, כמו בקובץ', onSelect: open },
    { label: 'ייצוא לאקסל', icon: 'download', onSelect: download },
  ];
  const screen: ReactNode = active ? <TableScreen spec={spec} onBack={() => back(`${base}${search}`)} onDownload={download} /> : null;
  return { active, open, download, items, screen };
}

function TableScreen({ spec, onBack, onDownload }: { spec: TableViewSpec; onBack: () => void; onDownload: () => void }) {
  const rows = clean(spec.rows());
  return (
    <AppScreen variant="detail" gap={10}>
      <TopBar back={{ label: spec.title, onClick: onBack }} end={<Button icon="download" iconSize={18} onClick={onDownload}>הורדה לאקסל</Button>} />
      <div className="k-titleblock">
        <PageTitle size="detail">{spec.filter ? `${spec.title} · ${spec.filter}` : spec.title}</PageTitle>
        <span className="k-titleblock__sub">{rows.length} שורות · {spec.headers.length} עמודות · כך זה ייראה בקובץ</span>
      </div>
      <DataTable headers={spec.headers} rows={rows} label={spec.title} />
      <p className="k-note">גוררים הצידה כדי לראות את שאר העמודות.</p>
    </AppScreen>
  );
}

/* ═════════════ Q7 payment confirmation ═════════════ */

export type PayConfirmTarget = {
  collection: 'tickets' | 'donations' | 'tabs';
  ids: string[];
  uid: string;
  name: string;
  phone: string;
  amount: number;
  purpose: string;
  event?: string;
};
/**
 * After approving a payment: `ask(target)` opens "התשלום אושר". WhatsApp opens the prepared message and records that the
 * confirmation was sent. E-mail is offered when the guest chose e-mail: the Worker sends it by itself within minutes.
 * "בלי אישור" only closes; for a guest who chose e-mail it also records a manual confirmation so no e-mail goes out.
 */
export function usePayConfirm() {
  const { actor, peopleByUid, settings } = useV2();
  const ext = useExternal();
  const toast = useToast();
  const [t, setT] = useState<PayConfirmTarget | null>(null);
  const profile = t ? peopleByUid.get(t.uid) : undefined;
  const pref = receiptPreference(profile);
  const to = { phone: profile?.phone || t?.phone || '', email: profile?.email || '' };
  const wa = t ? receiptDestination(to, 'whatsapp') : '';
  const channels: PayChannel[] = [...(wa ? ['whatsapp' as const] : []), ...(pref === 'email' ? ['email' as const] : [])];
  const name = (profile?.displayName || t?.name || '').trim();
  const preview = t ? fillTemplate(settings.templates.paymentConfirmation?.trim() || DEFAULT_SETTINGS.templates.paymentConfirmation!, {
    'שם': name, 'סכום': money(t.amount), 'עבור': t.purpose, 'אירוע': t.event || '',
  }) : '';
  const send = async (c: PayChannel) => {
    if (!t) return;
    if (c === 'whatsapp') {
      ext(waUrl(wa, preview));
      await markPaymentConfirmation(actor, t.collection, t.ids);
      toast.show({ text: 'סומן: אישור התשלום נשלח', check: true, duration: 2500 });
    } else if (c === 'none' && pref === 'email') {
      await markPaymentConfirmation(actor, t.collection, t.ids);
    }
  };
  const sheet = (
    <PayConfirmSheet key={t ? t.ids.join() : 'none'} open={!!t} onClose={() => setT(null)} name={name.split(/\s+/)[0] || name} channels={channels}
      initial={pref === 'email' ? 'email' : wa ? 'whatsapp' : 'none'} preview={preview} onSend={send} />
  );
  return { ask: (target: PayConfirmTarget) => setT(target), sheet };
}
