// V3 event files: permits, maps, lists. Files go to R2 through the Worker (upload.ts) when they can; otherwise photos are compressed and small PDFs are kept
// inside the file document (under the 1 MiB document limit); a bigger file is refused with a clear message, or saved as a link.
import { useRef, useState } from 'react';
import type { ScreenProps, V2Ctx } from '../../ctx';
import { AppScreen, useToast, useExternal } from '../../core';
import { TopBar, PageTitle, ListCard, Row, IconTile, Button, Sheet, Field, EmptyState, ChoiceGroup, ActionSheet, MoreMenu } from '../../kit';
import { useEvent } from '../../../data';
import { compressPhoto } from '../../../store';
import { storeFile, storePhoto } from '../../../upload';
import { nowIso } from '../../../clock';
import { ddmm, firstName } from '../../format';
import { logActivity } from '../../../activity';
import { useFiles, addFileV2, removeFileV2, removeLegacyFile, type EventFileV2 } from '../../data/events';
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
/** A file row: the files subcollection, or (index >= 0) a link the old app kept in the event document. */
type Shown = EventFileV2 & { legacy?: number };
const httpsOk = (u: string) => /^https?:\/\/\S+$/.test(u.trim());

function Files({ ctx, e }: { ctx: V2Ctx; e: FarmEvent }) {
  const toast = useToast(); const run = useRun(); const external = useExternal();
  const files = useFiles(e.id, ctx.manager);
  const camRef = useRef<HTMLInputElement>(null); const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [opened, setOpened] = useState<Shown | null>(null);
  // the sheet stays mounted after it closes, so the delete confirmation it opens can still run
  const last = useRef<Shown | null>(null);
  if (opened) last.current = opened;
  const [busy, setBusy] = useState(false);
  const [linkDraft, setLinkDraft] = useState<{ name: string; url: string; kind: 'doc' | 'image' } | null>(null);
  const legacy: Shown[] = (e.files || []).map((f, i) => ({ ...f, id: `legacy-${i}`, legacy: i }));
  const shown: Shown[] = [...files.items, ...legacy].sort((a, b) => (b.at || '').localeCompare(a.at || ''));

  const pick = async (f: File | undefined, fromCamera: boolean) => {
    if (!f) return;
    setBusy(true);
    try {
      if (f.type.startsWith('image/')) {
        const inline = await compressPhoto(f, 1600, FILE_MAX_CHARS);
        const url = await storePhoto(inline, 'eventfile');
        setDraft({ url, kind: 'image', mime: inline.slice(5, inline.indexOf(';')), size: url.startsWith('data:') ? url.length : Math.floor((inline.length - inline.indexOf(',') - 1) * 0.75), name: fromCamera ? '' : baseName(f.name) });
      } else if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        // R2 first (up to 10 MB); without it, a small PDF stays inside the document as before
        const stored = f.size <= 10 * 1024 * 1024 ? await storeFile(new Blob([f], { type: 'application/pdf' }), 'eventfile') : null;
        const url = stored || await readAsDataUrl(f);
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
  const saveLink = async () => {
    if (!linkDraft || !linkDraft.name.trim() || !httpsOk(linkDraft.url)) return;
    const name = linkDraft.name.trim();
    const id = await run(() => addFileV2(e.id, { name, url: linkDraft.url.trim(), kind: linkDraft.kind, by: ctx.actor, at: nowIso() }));
    if (!id) return;
    logActivity(ctx.actor, 'event', e.id, 'edited', `${e.title}: נוסף קובץ "${name}"`, { eventId: e.id });
    setLinkDraft(null);
    toast.show({ text: `${name} נשמר`, check: true });
  };
  const remove = async (f: Shown) => {
    const isLegacy = f.legacy !== undefined;
    const ok = await run(async () => { if (isLegacy) await removeLegacyFile(e, f.legacy!); else await removeFileV2(e.id, f.id); return true; });
    if (!ok) return;
    logActivity(ctx.actor, 'event', e.id, 'edited', `${e.title}: נמחק קובץ "${f.name}"`, { eventId: e.id });
    const { id: _id, legacy: _l, ...rest } = f;
    toast.show({ text: `${f.name} נמחק`, check: true, actions: [{ label: 'ביטול', onClick: () => { addFileV2(e.id, rest); } }] });
  };

  return (
    <AppScreen variant="detail">
      {/* rule 5: "הוספת קישור" is a ⋯ item; the two upload buttons stay */}
      <TopBar back={backTo(e.title, `/manage/events/${e.id}`)}
        end={<MoreMenu title="קבצים" items={[{ label: 'הוספת קישור', icon: 'link', onSelect: () => setLinkDraft({ name: '', url: '', kind: 'doc' }) }]} />} />
      <PageTitle>קבצים</PageTitle>
      {shown.length > 0 ? (
        <ListCard>
          {shown.map((f) => (
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
      <Sheet open={!!linkDraft} onClose={() => setLinkDraft(null)} title="הוספת קישור">
        {linkDraft && (
          <div className="events-sheet">
            <Field label="שם" value={linkDraft.name} onChange={(ev) => setLinkDraft({ ...linkDraft, name: ev.target.value })} placeholder="שם הקובץ (אישור משטרה, מפת הצבה…)" autoFocus />
            <Field label="קישור" ltr inputMode="url" value={linkDraft.url} onChange={(ev) => setLinkDraft({ ...linkDraft, url: ev.target.value })} placeholder="https://drive.google.com/…" />
            <ChoiceGroup label="סוג" value={linkDraft.kind} onChange={(k) => setLinkDraft({ ...linkDraft, kind: k })} options={[{ value: 'doc', label: 'מסמך' }, { value: 'image', label: 'תמונה' }]} />
            <Button size="bar" block disabled={!linkDraft.name.trim() || !httpsOk(linkDraft.url)} onClick={saveLink}>הוספה</Button>
          </div>
        )}
      </Sheet>
      {/* the file's row sheet (Q11): open it, or delete it in red at the bottom (rule 6) */}
      {last.current && (
        <ActionSheet open={!!opened} onClose={() => setOpened(null)} title={last.current.name}
          sub={`${fileKindLabel(last.current)} · ${last.current.by?.name || ''} · ${ddmm(last.current.at)}`}
          items={[
            { label: 'פתיחה', icon: last.current.kind === 'image' ? 'camera' : 'file', onSelect: () => { const f = last.current; if (f) openStored(f.url, external); } },
            { label: 'מחיקה', icon: 'trash', tone: 'danger', confirm: { title: 'למחוק את הקובץ?', text: `"${last.current.name}" יימחק מהאירוע.`, onConfirm: () => { const f = last.current; return f ? remove(f) : undefined; } } },
          ]} />
      )}
    </AppScreen>
  );
}
