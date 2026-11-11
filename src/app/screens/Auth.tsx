import { useState } from 'react';
import type { User } from 'firebase/auth';
import { authErrorMessage, signOutUser } from '../firebase';
import { createProfile } from '../store';
import { Button, Icon } from '../ui';
import { navigate } from '../router';
import type { Profile } from '../types';

/** First sign-in: name in Hebrew + phone. The role comes from the account (pre-assigned by a manager, or guest). */
export function Onboarding({ user }: { user: User }) {
  const [name, setName] = useState(user.displayName && /[֐-׿]/.test(user.displayName) ? user.displayName : '');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (name.trim().length < 2) return setError('כתבו את השם שלכם בעברית');
    setBusy(true); setError('');
    try { await createProfile(user, { displayName: name, phone }); }
    catch (e: any) { setError(authErrorMessage(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="auth onboard">
      <div>
        <img src="/assets/rava-logo.png" alt="" style={{ width: 56, height: 56, objectFit: 'contain', marginBottom: 14 }} />
        <h1>נעים להכיר</h1>
        <p>פעם אחת בלבד. השם יופיע ליד כל פעולה שלכם, והטלפון כדי שנוכל לחזור אליכם.</p>
        <label className="field"><span>השם שלך בעברית</span><input data-autofocus value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: בני גוטמן" autoComplete="name" /></label>
        <label className="field"><span>טלפון</span><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="050-0000000" inputMode="tel" dir="ltr" autoComplete="tel" /></label>
        <div className="terms-box">בלחיצה על "סיום" אני מאשר/ת את <a href="/app/terms" onClick={(e) => { e.preventDefault(); navigate('/terms'); }}>תנאי השימוש</a> ומסכים/ה לקבל עדכונים מהחווה.</div>
        {error && <p className="err">{error}</p>}
      </div>
      <div className="auth-foot">
        <Button kind="primary" className="block" disabled={busy} onClick={submit}>סיום</Button>
        <p className="hint">נכנסים עם {user.email}. <button type="button" className="link-btn" onClick={() => signOutUser()}>לא אני? להחליף חשבון</button></p>
      </div>
    </div>
  );
}

export function Blocked({ profile }: { profile: Profile }) {
  return (
    <div className="auth onboard">
      <div>
        <h1>החשבון הושעה</h1>
        <p>שלום {profile.displayName}. החשבון הזה חסום כרגע. אם זו טעות, פנו למנהלי החווה.</p>
      </div>
      <div className="auth-foot"><Button kind="quiet" onClick={() => signOutUser()}><Icon name="logout" />יציאה מהחשבון</Button></div>
    </div>
  );
}
