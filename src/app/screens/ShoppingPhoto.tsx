import { useEffect, useRef, useState } from 'react';
import { Btn, pickImage } from '../kit';
import { compressPhoto } from '../store';

export function ShoppingPhoto({ photo, title, thumb }: { photo: string; title: string; thumb?: boolean }) {
  const [open, setOpen] = useState(false);
  const viewer = useRef<HTMLDialogElement>(null);
  const name = title || 'פריט לקניות';
  useEffect(() => {
    if (open && viewer.current && !viewer.current.open) viewer.current.showModal();
  }, [open]);
  return (
    <>
      <button type="button" className={thumb ? 'r-shop-thumb' : 'r-shop-photo-preview'} onClick={() => setOpen(true)} aria-label={`הגדלת תמונה: ${name}`}>
        <img src={photo} alt="" loading={thumb ? 'lazy' : undefined} />
      </button>
      {open && <dialog ref={viewer} className="r-shop-photo-viewer" aria-label={`תמונה: ${name}`} onClose={() => setOpen(false)} onClick={(event) => {
        if (event.target === event.currentTarget) viewer.current?.close();
      }}>
        <div>
          <img src={photo} alt={name} />
          <Btn kind="ghost" onClick={() => viewer.current?.close()}>סגירה</Btn>
        </div>
      </dialog>}
    </>
  );
}

export function ShoppingPhotoField({ photo, title, busy, onChange, onBusy, onError }: {
  photo: string;
  title: string;
  busy: boolean;
  onChange: (photo: string) => void;
  onBusy: (busy: boolean) => void;
  onError: (message: string) => void;
}) {
  const pick = async () => {
    if (busy) return;
    onBusy(true);
    onError('');
    try {
      const file = await pickImage();
      if (file) onChange(await compressPhoto(file));
    } catch (error) {
      onError((error as Error).message || 'לא הצלחנו לפתוח את התמונה');
    } finally {
      onBusy(false);
    }
  };
  return (
    <div className="r-shop-photo-field">
      {photo && <ShoppingPhoto photo={photo} title={title} />}
      <div className="r-shop-photo-controls">
        <Btn kind="ghost" small onClick={pick} disabled={busy}>{photo ? 'החלפת תמונה' : 'הוספת תמונה'}</Btn>
        {photo && <Btn kind="quiet" small onClick={() => { onChange(''); onError(''); }} disabled={busy}>הסרת תמונה</Btn>}
      </div>
    </div>
  );
}
