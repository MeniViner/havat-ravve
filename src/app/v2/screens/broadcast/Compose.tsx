// B1-Compose: a broadcast to the team. Text up to 200, audience, normal or urgent, and how it will look on the phone.
// "שליחה" writes the broadcast, a C1 notification per person and one push job (data/broadcast.ts).
import { useState, type ReactNode } from 'react';
import { AppScreen, useToast, go } from '../../core';
import { BottomBar, Button, ChoiceGroup, FormHeader, BigTextInput, Icon } from '../../kit';
import { back } from '../../../router';
import type { ScreenProps } from '../../ctx';
import type { BroadcastAudience } from '../../../types';
import { AUDIENCES, AUDIENCE_LABELS, TEXT_MAX, pushTitle, sendBroadcast, useAudiences } from '../../data/broadcast';

const sendLabel = (n: number) => (n === 0 ? 'שליחה' : n === 1 ? 'שליחה לאדם אחד' : `שליחה ל־${n} אנשים`);

export function BroadcastCompose({ ctx, params }: ScreenProps): ReactNode {
  const toast = useToast();
  const wanted = (AUDIENCES as string[]).includes(params.audience) ? (params.audience as BroadcastAudience) : 'all';
  const [text, setText] = useState((params.text || '').slice(0, TEXT_MAX));
  const [audience, setAudience] = useState<BroadcastAudience>(wanted);
  const [urgent, setUrgent] = useState(params.urgent === '1');
  const [busy, setBusy] = useState(false);
  const { members, event } = useAudiences(ctx, params.event || undefined);
  const to = members[audience];
  const n = to.length;
  const canSend = !busy && text.trim().length > 0 && n > 0;

  async function send() {
    if (!canSend) return;
    setBusy(true);
    try {
      await sendBroadcast(ctx.actor, { text, audience, urgent, ...((audience === 'crew' || audience === 'vendors') && event ? { eventId: event.id } : {}) }, to.map((p) => p.uid));
      toast.show({ text: n === 1 ? 'נשלח לאדם אחד' : `נשלח ל־${n} אנשים` });
      go('/manage/broadcasts', true);
    } catch (e) {
      toast.refused(`לא נשמר. ${(e as Error).message}`);
      setBusy(false);
    }
  }

  return (
    <AppScreen variant="form" bar={
      <BottomBar>
        <Button size="bar" grow icon="megaphone" onClick={send} disabled={!canSend} aria-disabled={!canSend}>{sendLabel(n)}</Button>
      </BottomBar>
    }>
      <FormHeader title="הודעה לצוות" onCancel={() => back('/manage/broadcasts')} />
      <div className="broadcast-field">
        <BigTextInput label="תוכן ההודעה" size="lg" rows={3} maxLength={TEXT_MAX} value={text} onChange={(e) => setText(e.target.value.slice(0, TEXT_MAX))} />
        <span className="broadcast-count">{text.length} מתוך {TEXT_MAX}</span>
      </div>
      <ChoiceGroup<BroadcastAudience> label="למי" value={audience} onChange={setAudience}
        options={AUDIENCES.map((a) => ({ value: a, label: `${AUDIENCE_LABELS[a]} · ${members[a].length}` }))} />
      <ChoiceGroup<'normal' | 'urgent'> label="איך" value={urgent ? 'urgent' : 'normal'} onChange={(v) => setUrgent(v === 'urgent')}
        options={[{ value: 'normal', label: 'רגילה' }, { value: 'urgent', label: 'דחופה, נשארת בראש עד שקוראים' }]} />
      <div className="broadcast-preview">
        <span className="k-group__label">כך זה יקפוץ בטלפון</span>
        <div className="broadcast-phone">
          <span className="broadcast-phone__icon" aria-hidden="true"><Icon name="farm" size={20} /></span>
          <div className="broadcast-phone__body">
            <div className="broadcast-phone__top"><span>חוות רווה</span><span>עכשיו</span></div>
            <b className="broadcast-phone__title">{pushTitle(ctx.actor)}</b>
            <span className="broadcast-phone__text">{text.trim()}</span>
          </div>
        </div>
      </div>
    </AppScreen>
  );
}
