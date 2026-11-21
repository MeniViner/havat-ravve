// V3 event files: permits, maps, lists. No file storage on the free plan: photos are compressed and small PDFs are kept
// inside the file document (under the 1 MiB document limit); a bigger file is refused with a clear message, or saved as a link.
import { useRef, useState } from 'react';
import type { ScreenProps, V2Ctx } from '../../ctx';
import { AppScreen, useToast, useExternal } from '../../core';
import { TopBar, PageTitle, ListCard, Row, IconTile, Button, Sheet, Field, EmptyState } from '../../kit';
import { useEvent } from '../../../data';
import { compressPhoto } from '../../../store';
import { nowIso } from '../../../clock';
import { ddmm, firstName } from '../../format';
import { logActivity } from '../../../activity';
import { useFiles, addFileV2, removeFileV2, type EventFileV2 } from '../../data/events';
import { fileKindLabel, FILE_MAX_CHARS } from './logic';
import { Loading, Missing, ButtonRow, backTo, useRun } from './shared';
import type { FarmEvent } from '../../../types';

export function FilesScreen({ ctx, params }: ScreenProps) {
  const { item: e, loading } = useEvent(params.id, ctx.manager);
  if (loading && !e) return <Loading backLabel="האירוע" parent={`/manage/events/${params.id}`} />;
  if (!e) return <Missing backLabel="אירועים" parent="/manage/events" />;
  return <Files ctx={ctx} e={e} />;
}

const readAsDataUrl = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
const baseName = (n: string) => n.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
/** Opens a stored file: data URLs through a blob (browsers block opening data: pages), links as links. */
function openStored(url: string, external: (u: string) => void) {
  if (!url.startsWith('data:')) { external(url); return; }
  const [head, body] = url.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] || 'application/octet-stream';
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  window.open(URL.createObjectURL(new Blob([bytes], { type: mime })), '_blank', 'noopener');
}

type Draft = { url: string; kind: 'doc' | 'image'; mime: string; size: number; name: string };

function Files({ ctx, e }: { ctx: V2Ctx; e: FarmEvent }) {
  const toast = useToast(); const run = useRun(); const external = useExternal();
  const files = useFiles(e.id, ctx.manager);
  const camRef = useRef<HTMLInputElement>(null); const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [opened, setOpened] = useState<EventFileV2 | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (f: File | undefined, fromCamera: boolean) => {
    if (!f) return;
    setBusy(true);
    try {
      if (f.type.startsWith('image/')) {
        const url = await compressPhoto(f, 1600, FILE_MAX_CHARS);
        setDraft({ url, kind: 'image', mime: url.slice(5, url.indexOf(';')), size: url.length, name: fromCamera ? '' : baseName(f.name) });
      } else if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        const url = await readAsDataUrl(f);
        if (url.length > FILE_MAX_CHARS) { toast.show({ text: 'הקובץ גדול מדי לשמירה כאן. אפשר לצלם את המסמך.', tone: 'error' }); return; }
        setDraft({ url, kind: 'doc', mime: 'application/pdf', size: f.size, name: baseName(f.name) });
      } else {
        toast.show({ text: 'אפשר להוסיף תמונה או PDF', tone: 'error' });
      }
    } catch (err) { toast.show({ text: (err as Error).message || 'לא הצלחנו לקרוא את הקובץ', tone: 'error' }); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!draft || !draft.name.trim()) return;
    const name = draft.name.trim();
    const id = await run(() => addFileV2(e.id, { name, url: draft.url.trim(), kind: draft.kind, by: ctx.actor, at: nowIso(), mime: draft.mime, size: draft.size }));
    if (!id) return;
    logActivity(ctx.actor, 'event', e.id, 'edited', `${e.title}: נוסף קובץ "${name}"`, { eventId: e.id });
    setDraft(null);
    toast.show({ text: `${name} נשמר`, check: true });
  };
  const remove = async (f: EventFileV2) => {
    const ok = await run(async () => { await removeFileV2(e.id, f.id); return true; });
    if (!ok) return;
    setOpened(null);
    logActivity(ctx.actor, 'event', e.id, 'edited', `${e.title}: נמחק קובץ "${f.name}"`, { eventId: e.id });
    const { id: _id, ...rest } = f;
    toast.show({ text: `${f.name} נמחק`, check: true, actions: [{ label: 'ביטול', onClick: () => { addFileV2(e.id, rest); } }] });
  };

  return (
    <AppScreen variant="detail">
      <TopBar back={backTo(e.title, `/manage/events/${e.id}`)} />
      <PageTitle>קבצים</PageTitle>
      {files.items.length > 0 ? (
        <ListCard>
          {files.items.map((f) => (
            <Row key={f.id} minHeight={58} leading={<IconTile icon={f.kind === 'image' ? 'camera' : /^https?:/.test(f.url) ? 'link' : 'file'} />}
              title={f.name} meta={`${fileKindLabel(f)} · ${firstName(f.by?.name || '')} · ${ddmm(f.at)}`} onClick={() => setOpened(f)} />
          ))}
        </ListCard>
      ) : !files.loading && <EmptyState variant="card" icon="file" title="עוד אין קבצים" />}
      <ButtonRow>
        <Button variant="outline" size="tall" icon="camera" disabled={busy} onClick={() => camRef.current?.click()}>צילום מסמך</Button>
        <Button variant="outline" size="tall" icon="file" disabled={busy} onClick={() => fileRef.current?.click()}>קובץ מהטלפון</Button>
      </ButtonRow>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(ev) => { pick(ev.target.files?.[0], true); ev.target.value = ''; }} />
      <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(ev) => { pick(ev.target.files?.[0], false); ev.target.value = ''; }} />
      <span className="events-softline">רק מנהלים רואים את הקבצים.</span>

      <Sheet open={!!draft} onClose={() => setDraft(null)} title="שם הקובץ">
        {draft && (
          <div className="events-sheet">
            {draft.kind === 'image' && <img src={draft.url} alt="" className="events-filepreview" />}
            <Field label="שם" value={draft.name} onChange={(ev) => setDraft({ ...draft, name: ev.target.value })} placeholder="אישור משטרה" autoFocus />
            <Button size="bar" block disabled={!draft.name.trim()} onClick={save}>שמירה</Button>
          </div>
        )}
      </Sheet>
      <Sheet open={!!opened} onClose={() => setOpened(null)} title={opened?.name || ''} aside={opened ? `${fileKindLabel(opened)} · ${ddmm(opened.at)}` : undefined}>
        {opened && (
          <div className="events-sheet">
            {opened.kind === 'image' && <img src={opened.url} alt={opened.name} className="events-filepreview" />}
            <p className="events-sheet__meta">{opened.by?.name} · {ddmm(opened.at)}</p>
            <div className="events-sheet__actions">
              <Button size="tall" block onClick={() => openStored(opened.url, external)}>פתיחה</Button>
              <Button variant="danger" size="tall" block onClick={() => remove(opened)}>מחיקה</Button>
            </div>
          </div>
        )}
      </Sheet>
    </AppScreen>
  );
}
