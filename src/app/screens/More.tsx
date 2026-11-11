import { useEffect, useState } from 'react';
import type { Profile } from '../types';
import { ROLE_LABELS, STATUS_LABELS } from '../types';
import { updateOwnProfile } from '../store';
import { signOutUser } from '../firebase';
import { Icon, Button, Avatar, useToast } from '../ui';
import { navigate, back } from '../router';

let installPrompt: any = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });

export function MoreScreen({ profile, manager }: { profile: Profile; manager: boolean }) {
  const toast = useToast();
  const [name, setName] = useState(profile.displayName);
  const [phone, setPhone] = useState(profile.phone);
  const [editing, setEditing] = useState(false);
  useEffect(() => { setName(profile.displayName); setPhone(profile.phone); }, [profile.displayName, profile.phone]);
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const go = (path: string) => (e: React.MouseEvent) => { e.preventDefault(); navigate(path); };
  return (
    <>
      <header className="topbar"><div><h1>עוד</h1></div></header>
      <div className="card" style={{ padding: 16 }}>
        <div className="person"><Avatar name={profile.displayName} size={46} /><div><b>{profile.displayName}</b><small>{ROLE_LABELS[profile.role]} · {STATUS_LABELS[profile.status]} · {profile.email}</small></div></div>
        {editing ? (
          <div style={{ marginTop: 14 }}>
            <label className="field"><span>השם בעברית</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="field"><span>טלפון</span><input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" inputMode="tel" /></label>
            <div className="row-actions"><Button kind="primary" className="sm" onClick={async () => { try { await updateOwnProfile(profile.uid, { displayName: name, phone }); setEditing(false); toast({ text: 'נשמר' }, 2000); } catch { toast({ text: 'לא נשמר', kind: 'error' }); } }}>שמירה</Button><Button kind="quiet" className="sm" onClick={() => setEditing(false)}>ביטול</Button></div>
          </div>
        ) : <div className="row-actions"><Button kind="quiet" className="sm" onClick={() => setEditing(true)}><Icon name="edit" />עריכת פרטים</Button></div>}
      </div>
      <div className="section"><div className="menu">
        {manager && <a href="/app/manage" onClick={go('/manage')}><Icon name="people" /><div>ניהול<small>אנשים, קודי הצטרפות, משימות חוזרות, מקומות</small></div><Icon name="chev" className="chev" size={18} /></a>}
        <a href="/app/history" onClick={go('/history')}><Icon name="history" /><div>היסטוריית משימות<small>מי עשה מה ומתי</small></div><Icon name="chev" className="chev" size={18} /></a>
        <a href="/app/terms" onClick={go('/terms')}><Icon name="info" /><div>תנאי שימוש ופרטיות</div><Icon name="chev" className="chev" size={18} /></a>
        <a href="/admin" target="_blank" rel="noopener" hidden={!manager}><Icon name="edit" /><div>עריכת האתר<small>נפתח בחלון נפרד</small></div><Icon name="chev" className="chev" size={18} /></a>
      </div></div>
      {!standalone && (
        <div className="section"><div className="card" style={{ padding: 16 }}>
          <b style={{ fontWeight: 500 }}>להתקין על מסך הבית</b>
          <p className="hint" style={{ marginTop: 6 }}>{ios ? 'ב־Safari: לחצו על כפתור השיתוף ואז "הוספה למסך הבית". ככה גם התראות יעבדו.' : 'בתפריט הדפדפן בחרו "התקנת אפליקציה" או "הוספה למסך הבית".'}</p>
          {installPrompt && !ios && <Button kind="secondary" className="sm" style={{ marginTop: 10 }} onClick={async () => { await installPrompt.prompt(); installPrompt = null; }}><Icon name="download" />התקנה</Button>}
        </div></div>
      )}
      <div className="section"><Button kind="quiet" onClick={async () => { if (confirm('לצאת מהחשבון במכשיר הזה?')) await signOutUser(); }}><Icon name="logout" />יציאה מהחשבון</Button></div>
      <p className="hint" style={{ marginTop: 20 }}>חוות רווה · גרסה 0.1 · <a href="/" style={{ color: 'var(--olive)' }}>לאתר</a></p>
    </>
  );
}

export function TermsScreen() {
  return (
    <>
      <header className="topbar"><div><h1>תנאי שימוש</h1><div className="sub">טיוטה. גרסה ראשונה לאישור המנהלים.</div></div><div className="topbar-actions"><button type="button" className="icon-btn ghost" onClick={() => back('/more')} aria-label="חזרה"><Icon name="back" /></button></div></header>
      <div className="prose card" style={{ padding: '6px 18px 18px' }}>
        <h2>מה האפליקציה</h2>
        <p>האפליקציה של חוות רווה משמשת את צוות החווה, מתנדבים ואורחים לניהול משימות, קניות, אירועים, ביקורים ותרומות. האפליקציה מופעלת על ידי חוות רווה ("החווה").</p>
        <h2>הרשמה ופרטים</h2>
        <p>ההרשמה נעשית באמצעות חשבון Google. אנחנו שומרים את השם שכתבתם, מספר הטלפון וכתובת המייל, ובהמשך פרטים נוספים שתבחרו למסור. מספר לקוח פנימי מוקצה לכל נרשם לצורכי ניהול בלבד.</p>
        <h2>למה משמש המידע</h2>
        <ul>
          <li>תפעול שוטף: משימות שסימנתם, פריטים שקניתם, כרטיסים שהזמנתם וביקורים שתיאמתם, לצד שמכם.</li>
          <li>יצירת קשר אתכם בנוגע לפעילותכם בחווה.</li>
          <li>שליחת עדכונים על אירועים ופעילות בחווה, בהתראות באפליקציה, במייל, בוואטסאפ או ב־SMS. אפשר לבקש להפסיק בכל עת דרך "עוד" באפליקציה או בפנייה למנהלים.</li>
        </ul>
        <h2>מי רואה מה</h2>
        <p>חברי צוות רואים את שמות חברי הצוות האחרים ליד משימות ופריטים. מנהלי החווה רואים את פרטי הקשר של הנרשמים. המידע אינו נמכר ואינו מועבר לגורמים חיצוניים, למעט ספקי התשתית שמפעילים את האפליקציה (Google Firebase) וספקי תשלום כשיופעלו.</p>
        <h2>תמונות ומיקום</h2>
        <p>צירוף תמונה או מיקום למשימה הוא לבחירתכם. תמונות ומיקומים שצורפו נראים לחברי הצוות.</p>
        <h2>אחריות</h2>
        <p>האפליקציה ניתנת כמות שהיא. החווה עושה מאמץ סביר לשמור על זמינות ודיוק אבל אינה מתחייבת לכך. אין להשתמש באפליקציה לפגיעה באחרים או להפצת תוכן פוגעני.</p>
        <h2>הסרה</h2>
        <p>אפשר לבקש מהמנהלים למחוק את החשבון והפרטים בכל עת. רשומות של משימות שבוצעו עשויות להישמר ללא פרטים מזהים.</p>
        <p className="hint">עדכון אחרון: נובמבר 2026. מסמך זה הוא טיוטה שטרם עברה בדיקה משפטית.</p>
      </div>
    </>
  );
}
