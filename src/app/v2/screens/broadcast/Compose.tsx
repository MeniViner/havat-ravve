// Q26-ComposeAll (was B1): a message up to 200, the audience in two groups (the team; outside the team), normal or urgent,
// and "לשלוח גם במייל" for the people whose phone gets no push. "שליחה" writes the broadcast, a notification per person,
// one push job and the e-mail jobs (data/broadcast.ts). Registrants are of one event: a picker when there is more than one (rule 9).
import { useState, type ReactNode } from 'react';
import { AppScreen, useToast, go } from '../../core';
import { BottomBar, Button, ChoiceGroup, FormHeader, BigTextInput, Icon, ListCard, PickerSheet, Row, Toggle } from '../../kit';
import { back } from '../../../router';
import type { ScreenProps } from '../../ctx';
import { OUTSIDE_AUDIENCES, type BroadcastAudience } from '../../../types';
import { ddmm } from '../../format';
import { AUDIENCES, EMAIL_CAP, TEAM_AUDIENCES, TEXT_MAX, audienceLabel, broadcastReceiptText, emailTargets, isOutside, pushTitle, sendBroadcast, useAudiences } from '../../data/broadcast';
import { usePushConfig } from '../../data/push';

/** Where the messages list lives now (Q25, inside People). */
export const MESSAGES_PATH = '/manage/people?tab=messages';

const sendLabel = (n: number, registrants: boolean) =>
  n === 0 ? 'שליחה' : registrants ? (n === 1 ? 'שליחה להזמנה אחת' : `שליחה ל־${n} הזמנות`) : n === 1 ? 'שליחה לאדם אחד' : `שליחה ל־${n} אנשים`;

export function BroadcastCompose({ ctx, params }: ScreenProps): ReactNode {
  const push = usePushConfig();
  const toast = useToast();
  const wanted = (AUDIENCES as string[]).includes(params.audience) ? (params.audience as BroadcastAudience) : 'all';
  const [text, setText] = useState((params.text || '').slice(0, TEXT_MAX));
  const [audience, setAudience] = useState<BroadcastAudience>(wanted);
  const [eventId, setEventId] = useState(params.event || '');
  const [urgent, setUrgent] = useState(params.urgent === '1');
  const [mail, setMail] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const { members, event, candidates } = useAudiences(ctx, eventId || undefined);
  const to = members[audience];
  const n = to.length;
  const targets = emailTargets(to, ctx.user.uid);
  const canSend = !busy && text.trim().length > 0 && n > 0;

  // the registrants choice names its event; with more than one candidate event it opens the picker (rule 9)
  function choose(a: BroadcastAudience) {
    if (a === 'registrants' && candidates.length > 1) setPicking(true);
    setAudience(a);
  }

  async function send() {
    if (!canSend) return;
    setBusy(true);
    try {
      const withEvent = (audience === 'crew' || audience === 'vendors' || audience === 'registrants') && event;
      const { receipt } = await sendBroadcast(ctx.actor, { text, audience, urgent, ...(withEvent ? { eventId: event.id } : {}) }, to.map((p) => p.uid),
        { email: mail ? targets.send.map((p) => p.uid) : [] });
      toast.show({ text: broadcastReceiptText(receipt, push.mode !== 'off') });
      go(MESSAGES_PATH, true);
    } catch (e) {
      toast.refused(`לא נשמר. ${(e as Error).message}`);
      setBusy(false);
    }
  }

  const option = (a: BroadcastAudience) => ({ value: a, label: `${audienceLabel(a, event?.title)} · ${members[a].length}` });
  const mailMeta = !targets.withoutPush ? 'לכל הנמענים מופעלות התראות לטלפון'
    : targets.mailable > EMAIL_CAP ? `${targets.withoutPush} מהם לא מקבלים התראות בטלפון. המייל ייכנס לתור עבור עד ${EMAIL_CAP} מהם`
    : `${targets.withoutPush} מהם לא מקבלים התראות בטלפון`;
  return (
    <AppScreen variant="form" bar={
      <BottomBar>
        <Button size="bar" grow icon="megaphone" onClick={send} disabled={!canSend} aria-disabled={!canSend}>{sendLabel(n, audience === 'registrants')}</Button>
      </BottomBar>
    }>
      <FormHeader title="הודעה חדשה" onCancel={() => back(MESSAGES_PATH)} />
      <div className="broadcast-field">
        <BigTextInput label="תוכן ההודעה" size="lg" rows={3} maxLength={TEXT_MAX} value={text} onChange={(e) => setText(e.target.value.slice(0, TEXT_MAX))} />
        <span className="broadcast-count">{text.length} מתוך {TEXT_MAX}</span>
      </div>
      <div className="k-group broadcast-audience">
        <span className="k-group__label">למי</span>
        <ChoiceGroup<BroadcastAudience> className="broadcast-sub" label="הצוות" value={audience} onChange={choose} options={TEAM_AUDIENCES.map(option)} />
        <ChoiceGroup<BroadcastAudience> className="broadcast-sub" label="מחוץ לצוות" value={audience} onChange={choose} options={OUTSIDE_AUDIENCES.map(option)} />
      </div>
      <ChoiceGroup<'normal' | 'urgent'> label="איך" value={urgent ? 'urgent' : 'normal'} onChange={(v) => setUrgent(v === 'urgent')}
        options={[{ value: 'normal', label: 'רגילה' }, { value: 'urgent', label: 'דחופה, נשארת בראש עד שרואים' }]} />
      <ListCard>
        <Row className="broadcast-mailrow" title="לשלוח גם במייל" meta={mailMeta}
          actions={<Toggle checked={mail && targets.mailable > 0} onChange={(v) => setMail(v && targets.mailable > 0)} label="לשלוח גם במייל" />} />
      </ListCard>
      {isOutside(audience) ? (
        <span className="broadcast-note">אורחים רואים את ההודעה באפליקציה, ליד הכרטיסים שלהם.</span>
      ) : (
        <div className="broadcast-preview">
          <span className="k-group__label">תצוגה מקדימה של התראה בטלפון</span>
          <div className="broadcast-phone">
            <span className="broadcast-phone__icon" aria-hidden="true"><Icon name="farm" size={20} /></span>
            <div className="broadcast-phone__body">
              <div className="broadcast-phone__top"><span>חוות רווה</span><span>עכשיו</span></div>
              <b className="broadcast-phone__title">{pushTitle(ctx.actor)}</b>
              <span className="broadcast-phone__text">{text.trim()}</span>
            </div>
          </div>
        </div>
      )}
      <PickerSheet open={picking} onClose={() => setPicking(false)} title="נרשמי איזה אירוע" value={event?.id || ''}
        onChange={(id) => { setEventId(id); setAudience('registrants'); }}
        options={candidates.map((e) => ({ value: e.id, label: e.title, meta: ddmm(e.start) }))} />
    </AppScreen>
  );
}
