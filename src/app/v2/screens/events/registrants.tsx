// Event-scoped attendance and order data. The ticket snapshot supplies the purchaser's contact details.
import { useMemo, useState } from 'react';
import type { Profile, Ticket, FarmEvent, RegistrationField } from '../../../types';
import { Button, DataTable, PageTitle, SearchField, StatRow, StatTile, TopBar, type TableCell } from '../../kit';
import { AppScreen } from '../../core';
import { userNumber } from '../../data/manage';
import { downloadCsv } from '../../../data';
import { tableCell } from '../../patterns';
import { link } from './shared';
import type { TestTicket } from '../../data/eventTestTickets';
import { ordersOf } from './logic';

export const personPath = (person: Profile) => '/manage/people/' + encodeURIComponent(person.uid);
export const reportHeaders = ['User ID', 'שם פרטי', 'שם משפחה', 'טלפון', 'כרטיסים', 'תאריך ושעת רכישה', 'הגיעו', 'שאלת האירוע'];
export function registrationReport(event: FarmEvent, tickets: Ticket[], people: ReadonlyMap<string, Profile | undefined>, fields: RegistrationField[], tests:TestTicket[] = []) {
  const firstField = fields.find((field) => field.label.trim() === 'שם פרטי')?.id;
  const lastField = fields.find((field) => field.label.trim() === 'שם משפחה')?.id;
  const real = ordersOf(tickets.filter((ticket) => ticket.eventId === event.id)).map((order) => {
    const person = people.get(order.orderId);
    const [given = '', ...rest] = (order.name || '').trim().split(/\s+/);
    const sameName = person?.displayName.trim() === order.name.trim();
    const first = (sameName && firstField && person?.fields?.[firstField]) || given;
    const last = (sameName && lastField && person?.fields?.[lastField]) || rest.join(' ');
    const answers = order.tickets[0].answers || {};
    const labels = new Map((event.questions || []).map((q) => [q.id, q.label]));
    const answer = Object.entries(answers).filter(([, value]) => value).map(([id, value]) => labels.has(id) ? labels.get(id) + ' · ' + value : value).join(' / ');
    const values: TableCell[] = [userNumber(person?.customerNumber) ?? '', first, last, order.phone, order.count, tableCell.time(order.createdAt), order.arrived, answer];
    return { count:order.count, arrived:order.arrived, createdAt:order.createdAt, test:false, person, first, last, values };
  });
  const practice = tests.filter((t)=>t.eventId===event.id).map((t)=>{
    const [first='',...rest]=t.ownerName.trim().split(/\s+/), last=rest.join(' ');
    const values:TableCell[]=['',first,last,'',1,tableCell.time(t.createdAt),0,'כרטיס לבדיקה'];
    return {count:0,arrived:0,createdAt:t.createdAt,test:true,person:undefined,first,last,values};
  });
  return [...real,...practice].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
type Report = ReturnType<typeof registrationReport>;

export function RegistrantsReport({ event, rows, full, onBack }: { event: FarmEvent; rows: Report; full?: boolean; onBack?: () => void }) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => rows.filter((row) => (row.first + ' ' + row.last).includes(query.trim())), [rows, query]);
  const download = () => downloadCsv(event.title + ' - נרשמים.csv', reportHeaders, visible.map((row) => row.values));
  const content = <>
    <StatRow><StatTile label="נרשמים בכרטיסים" value={rows.reduce((sum, r) => sum + r.count, 0)} /><StatTile label="הגיעו" value={rows.reduce((sum, r) => sum + r.arrived, 0)} /></StatRow>
    <SearchField label="חיפוש לפי שם פרטי או שם משפחה" value={query} onChange={(ev) => setQuery(ev.target.value)} />
    <DataTable headers={reportHeaders} rows={visible.map((r) => r.values)} label={'נרשמים · ' + event.title} renderCell={(value, col, idx) => {
      const row = visible[idx];
      if (col === 0 && row.person && value) return <a {...link(personPath(row.person))} aria-label={'User ID ' + value + ' · ' + row.person.displayName}>{value}</a>;
      if (row.test && col===7) return <span className="k-tag k-tag--warm">כרטיס לבדיקה</span>;
      if (row.test && col===6) return 0;
      if (col === 6) return <span className="events-arrivals" aria-label={row.arrived + ' מתוך ' + row.count}><span style={{ width: (row.arrived / row.count) * 100 + '%' }} /><b>{value}</b></span>;
      return value === '' ? '—' : value;
    }} />
  </>;
  if (!full) return <section className="events-report" aria-label="דוח נרשמים לאירוע">{content}</section>;
  return <AppScreen variant="detail"><TopBar back={{label:'נרשמים',onClick:onBack}} end={<Button icon="download" onClick={download}>הורדה לאקסל</Button>} /><PageTitle>{event.title}</PageTitle>{content}</AppScreen>;
}
