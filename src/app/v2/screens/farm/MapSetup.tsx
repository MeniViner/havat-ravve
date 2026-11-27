import { useState, type ReactNode } from 'react';
import { useDoc, write } from '../../../db';
import type { Place } from '../../../types';
import type { Trail } from '../../../survey/model';
import { Button } from '../../kit';

const steps = [
  'לפני שיוצאים לשטח',
  'גישה למיקום',
  'בדיקת הדיוק',
  'מבט הפתיחה והכניסה',
  'המקום הראשון',
  'השביל הראשון',
  'סקירה ושמירה',
];
export function Setup({
  scope,
  places,
  trails,
  gpsPanel,
  onPlaces,
  onTrails,
}: {
  scope: string;
  places: Place[];
  trails: Trail[];
  gpsPanel: ReactNode;
  onPlaces: () => void;
  onTrails: () => void;
}) {
  const key = 'farm-map-setup:' + scope;
  const [step, change] = useState(() => {
    try {
      return Math.min(6, Math.max(0, Number(localStorage.getItem(key)) || 0));
    } catch {
      return 0;
    }
  });
  const [entrance, choose] = useState(() => {
    try {
      return localStorage.getItem(key + ':entrance') || '';
    } catch {
      return '';
    }
  });
  const [message, notify] = useState(''),
    [saving, setSaving] = useState(false);
  const saved = useDoc<{ entrance: string }>('farmMap/setup'),
    home = useDoc('farmMap/home');
  const chosen = places.find((p) => p.id === (entrance || saved.item?.entrance));
  const next = (n: number) => {
    change(n);
    try {
      localStorage.setItem(key, String(n));
    } catch {
      /* still usable in this tab */
    }
  };
  async function save() {
    if (!chosen) return;
    setSaving(true);
    try {
      await write.batch([{ op: 'set', col: 'farmMap', id: 'setup', data: { entrance: chosen.id } }], {
        wait: true,
      });
      notify('הגדרת החווה נשמרה');
    } catch {
      notify('השמירה נכשלה. אפשר לנסות שוב.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="survey-panel">
      <small>
        שלב {step + 1} מתוך {steps.length}
      </small>
      <h2>{steps[step]}</h2>
      {step === 0 && <p>המיקום עוזר לסמן את הכניסה לחווה ולמדוד שבילים בהליכה. אפשר גם לסמן מקומות ידנית.</p>}
      {(step === 1 || step === 2) && gpsPanel}
      {step === 3 && (
        <>
          <p>{home.item ? 'מבט הפתיחה שמור.' : 'אפשר לכוון את אזור החווה דרך „הגדרת מבט הפתיחה”.'}</p>
          <label>
            הכניסה לחווה{' '}
            <select
              aria-label="הכניסה לחווה"
              value={chosen?.id || ''}
              onChange={(e) => {
                choose(e.target.value);
                try {
                  localStorage.setItem(key + ':entrance', e.target.value);
                } catch {}
              }}
            >
              <option value="">בחירת מקום שמור</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <Button variant="quiet" onClick={onPlaces}>
            הוספת מקום לכניסה
          </Button>
        </>
      )}
      {step === 4 && (
        <>
          <p>
            {places.length
              ? places.length + ' מקומות כבר מופיעים במפה.'
              : 'אפשר להוסיף מקום מהמיקום הנוכחי או לבחור נקודה במפה.'}
          </p>
          <Button variant="outline" onClick={onPlaces}>
            פתיחת המקומות
          </Button>
        </>
      )}
      {step === 5 && (
        <>
          <p>
            {trails.length
              ? trails.length + ' שבילים כבר שמורים בחווה.'
              : 'הקליטו הליכה או שרטטו שביל ובדקו את התוואי לפני האישור.'}
          </p>
          <Button variant="outline" onClick={onTrails}>
            פתיחת השבילים
          </Button>
        </>
      )}
      {step === 6 && (
        <p>
          כניסה: {chosen?.name || 'טרם נבחרה'} · {places.length} מקומות ·{' '}
          {trails.filter((t) => t.status === 'confirmed').length} שבילים מאושרים
        </p>
      )}
      <div className="survey-actions">
        {step < 6 ? (
          <Button disabled={step === 3 && !chosen} onClick={() => next(step + 1)}>
            המשך
          </Button>
        ) : (
          <Button disabled={!chosen || saving} onClick={save}>
            שמירת ההגדרה
          </Button>
        )}
        {step > 0 && (
          <Button variant="quiet" onClick={() => next(step - 1)}>
            השלב הקודם
          </Button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
