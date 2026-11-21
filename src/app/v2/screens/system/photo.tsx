// A1-Photo (choose the source) and A2-Crop (place the picture in the circle). The picture is cropped and compressed in the
// browser and stored on users/{uid}.photo (a small data URL; no Storage on the Spark plan).
import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as RPointerEvent } from 'react';
import { AppScreen, go, useToast } from '../../core';
import { FormHeader, BottomBar, Button, RadioList, RadioRow, IconTile, Icon, initials } from '../../kit';
import { back, navigate } from '../../../router';
import type { ScreenProps } from '../../ctx';
import { sourceOf, setPicked, usePicked, savePhotoSource, saveCustomPhoto, cropToDataUrl, type PhotoSource as Source } from '../../data/system';
import './system.css';

/** Hidden file inputs behind "לצלם עכשיו" and "מהגלריה". */
function usePickers(onFile: (f: File) => void) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const take = (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); };
  const inputs = (
    <>
      <input ref={camera} className="system-file" type="file" accept="image/*" capture="user" tabIndex={-1} aria-hidden="true" onChange={take} />
      <input ref={gallery} className="system-file" type="file" accept="image/*" tabIndex={-1} aria-hidden="true" onChange={take} />
    </>
  );
  return { inputs, openCamera: () => camera.current?.click(), openGallery: () => gallery.current?.click() };
}

export function PhotoSource({ ctx }: ScreenProps) {
  const p = ctx.profile;
  const toast = useToast();
  const [src, setSrc] = useState<Source>(sourceOf(p));
  const [busy, setBusy] = useState(false);
  const pick = (f: File) => { if (!f.type.startsWith('image/')) { toast.refused('לא נשמר. בחרו תמונה'); return; } setPicked(f); go('/me/photo/crop'); };
  const { inputs, openCamera, openGallery } = usePickers(pick);
  const shown = src === 'custom' ? p.photo : src === 'google' ? p.googlePhoto : undefined;
  const save = async () => {
    if (busy) return;
    if (src === 'custom' && !p.photo) { openGallery(); return; }
    setBusy(true);
    try { await savePhotoSource(p.uid, src); toast.show({ text: 'נשמר', duration: 2500 }); back('/me'); }
    catch (e) { toast.refused(`לא נשמר. ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  return (
    <AppScreen variant="form" bar={<BottomBar><Button size="bar" grow disabled={busy} onClick={save}>שמירה</Button></BottomBar>}>
      <FormHeader title="תמונת פרופיל" onCancel={() => back('/me')} />
      <div className="system-preview">
        <span role="img" aria-label="תמונת פרופיל" className="system-preview__circle">
          {shown ? <img src={shown} alt="" /> : src === 'none' ? initials(p.displayName || '') : <Icon name="user" size={70} />}
        </span>
        <span className="system-note">כך רואים אותך בצוות</span>
      </div>
      <RadioList label="מקור התמונה">
        <RadioRow checked={src === 'custom'} onSelect={() => setSrc('custom')} leading={<IconTile icon="camera" />} title="תמונה משלי" meta="מיוחדת לאפליקציה הזו" />
        <RadioRow checked={src === 'google'} onSelect={() => setSrc('google')}
          leading={<span role="img" aria-label="התמונה מ-Google" className="system-mini">{p.googlePhoto ? <img src={p.googlePhoto} alt="" /> : <Icon name="user" size={19} />}</span>}
          title="התמונה מחשבון Google" meta="מתעדכנת לבד כשמחליפים שם" />
        <RadioRow checked={src === 'none'} onSelect={() => setSrc('none')} leading={<span className="system-mini system-mini--initials" aria-hidden="true">{initials(p.displayName || '')}</span>} title="בלי תמונה" meta="רק ראשי התיבות" />
      </RadioList>
      <div className="system-btnrow">
        <Button variant="outline" size="tall" icon="camera" iconSize={18} onClick={openCamera}>לצלם עכשיו</Button>
        <Button variant="outline" size="tall" onClick={openGallery}>מהגלריה</Button>
      </div>
      <span className="system-note">רק צוות החווה רואה את התמונה. אורחים לא.</span>
      {inputs}
    </AppScreen>
  );
}

const CIRCLE = 280;
export function PhotoCrop({ ctx }: ScreenProps) {
  const picked = usePicked();
  const toast = useToast();
  const img = useRef<HTMLImageElement>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1.6);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; ox: number; oy: number } | null>(null);
  const { inputs, openGallery } = usePickers((f) => { if (f.type.startsWith('image/')) setPicked(f); });
  useEffect(() => { setNat(null); setPos({ x: 0, y: 0 }); }, [picked?.url]);
  const scale = nat ? (CIRCLE / Math.min(nat.w, nat.h)) * zoom : 1;
  const clamp = (x: number, y: number) => {
    if (!nat) return { x: 0, y: 0 };
    const mx = Math.max(0, (nat.w * scale - CIRCLE) / 2); const my = Math.max(0, (nat.h * scale - CIRCLE) / 2);
    return { x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
  };
  useEffect(() => { setPos((s) => clamp(s.x, s.y)); }, [zoom, nat?.w]);
  const down = (e: RPointerEvent<HTMLDivElement>) => { if (!picked) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y }; };
  const move = (e: RPointerEvent<HTMLDivElement>) => { const d = drag.current; if (!d || d.id !== e.pointerId) return; setPos(clamp(d.ox + e.clientX - d.x, d.oy + e.clientY - d.y)); };
  const up = () => { drag.current = null; };
  const done = async () => {
    if (!picked || !img.current || !nat) { navigate('/me/photo', true); return; }
    if (busy) return;
    setBusy(true);
    try {
      const url = await cropToDataUrl(img.current, { size: 0, circle: CIRCLE, scale, x: pos.x, y: pos.y });
      await saveCustomPhoto(ctx.user.uid, url);
      setPicked(null);
      toast.show({ text: 'נשמר', duration: 2500 });
      navigate('/me', true);
    } catch (e) { toast.refused(`לא נשמר. ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  return (
    <AppScreen variant="form" bar={<BottomBar><Button size="bar" grow icon="check" disabled={busy} onClick={done}>זה טוב</Button></BottomBar>}>
      <FormHeader title="למקם את התמונה" onCancel={() => { setPicked(null); back('/me/photo'); }} />
      <div role="img" aria-label="מקום לתמונה שנבחרה, עם עיגול חיתוך" className="system-crop" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {picked ? (
          <img ref={img} src={picked.url} alt="" className="system-crop__img" draggable={false}
            onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            style={nat ? { width: nat.w * scale, height: nat.h * scale, transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` } : { opacity: 0 }} />
        ) : (
          <span className="system-crop__empty"><Icon name="user" size={64} />התמונה שנבחרה</span>
        )}
        <span className="system-crop__ring" aria-hidden="true" />
      </div>
      <div className="system-zoom">
        <span>קטן</span>
        <label htmlFor="system-zoom" className="k-sr">הגדלה</label>
        <input id="system-zoom" type="range" min={1} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(+e.target.value)} />
        <span>גדול</span>
      </div>
      <div className="system-btnrow"><Button variant="outline" size="tall" onClick={openGallery}>תמונה אחרת</Button></div>
      {inputs}
    </AppScreen>
  );
}
