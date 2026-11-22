// Visual QA page for the v2 kit: every component in its states, plus screen compositions built only from kit parts.
// Rendered by scripts/kit-gallery.mjs (Playwright, 390x844 @2x) and compared against design/png.
import { useState, type ReactNode } from 'react';
import {
  AddChip, Avatar, AvatarStack, BackLink, Bar, BarList, BigTextInput, BottomBar, BottomNav, Button, CaptureBar, Card, CheckButton,
  Checkbox, Chip, ChipRow, ChoiceChip, ChoiceGroup, CountBadge, DateBox, DemoStrip, DetailList, DetailRow, Dot, EmptyState, Field,
  FieldRow, FormHeader, GateButton, GateCamera, GateResult, Hero, HeroNumber, History, Icon, ICON_NAMES, IconButton, IconTile, Inline,
  ListCard, LiveStatus, NextUpCard, Overline, PageTitle, ProgressSegments, Quote, RadioList, RadioRow, RootHeader, Row, Screen,
  SearchField, SectionHeader, SectionTitle, Segmented, Sheet, Stack, StatRow, StatTile, Stepper, Strip, Tabs, Tag, TextAreaField,
  TextLink, Tile, TileGrid, Toast, Toggle, TopBar, type NavItem,
} from './index';

const noop = () => {};

export const NAV_STAFF: NavItem[] = [
  { key: 'tasks', label: 'משימות', icon: 'tasks', href: '#', active: true },
  { key: 'shop', label: 'קניות', icon: 'cart', href: '#' },
  { key: 'farm', label: 'החווה', icon: 'farm', href: '#' },
];
const NAV_MANAGER: NavItem[] = [...NAV_STAFF.map((n) => ({ ...n, active: false })), { key: 'manage', label: 'ניהול', icon: 'grid', href: '#', active: true }];
const NAV_EVENT: NavItem[] = [...NAV_MANAGER, { key: 'event', label: 'אירוע', icon: 'ticket', href: '#', badge: 2 }];
const NAV_VENDOR: NavItem[] = [
  { key: 'stall', label: 'הדוכן', icon: 'stall', href: '#', active: true },
  { key: 'farm', label: 'החווה', icon: 'farm', href: '#' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="k-gallery__section">
      <h2 className="k-gallery__h">{title}</h2>
      {children}
    </section>
  );
}

/** Every kit component in its states. */
export function Gallery() {
  const [seg, setSeg] = useState<'place' | 'time' | 'mine'>('place');
  const [tab, setTab] = useState<'super' | 'build' | 'web' | 'look'>('super');
  const [chip, setChip] = useState('all');
  const [where, setWhere] = useState<string>('greenhouse');
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(true);
  const [qty, setQty] = useState(6);
  const [qty2, setQty2] = useState(5);
  const [radio, setRadio] = useState('v');
  const [cb, setCb] = useState(true);
  const [sheet, setSheet] = useState(true);
  const [cap, setCap] = useState('');

  return (
    <div className="v2" dir="rtl" style={{ maxWidth: 390, margin: '0 auto', background: 'var(--bg)' }}>
      <div className="k-gallery">
        <Section title="ROOT HEADER · PROGRESS">
          <RootHeader overline="חמישי · 19.11" title="משימות" unread={3} avatar="יפ" searchHref="#" bellHref="#" avatarHref="#" />
          <ProgressSegments total={5} done={3} caption="3 מתוך 5 שלך בוצעו" />
          <ProgressSegments total={7} done={3} tone="warm" label="3 מתוך 7 צעדים" />
        </Section>

        <Section title="TOP BAR · TITLES">
          <TopBar back={{ label: 'משימות', href: '#' }} end={<Button variant="outline" icon="edit" iconSize={16}>עריכה</Button>} />
          <TopBar back={{ label: 'ניהול', href: '#' }} end={<Button icon="plus">הודעה חדשה</Button>} />
          <TopBar back={{ label: 'פסטיבל הסתיו', href: '#' }} end={<><LiveStatus>חי · 17:20</LiveStatus><IconButton icon="megaphone" label="הודעה לצוות האירוע" variant="outline" /></>} />
          <PageTitle size="detail">לסדר את ארגז הכלים במכולה</PageTitle>
          <FormHeader title="הוספה" onCancel={noop} />
          <SectionTitle>מה קרה עד עכשיו</SectionTitle>
          <Overline>הבא בתור</Overline>
          <BackLink label="חזרה" href="#" />
        </Section>

        <Section title="NEXT UP · SEGMENTED">
          <NextUpCard
            title="לסדר את ארגז הכלים במכולה"
            meta="מאחורי המכולה · בני ביקש"
            actions={<><Button size="big" grow icon="check">בוצע</Button><Button variant="secondary" size="lg" icon="camera">צילום</Button></>}
          />
          <Segmented label="תצוגה" value={seg} onChange={setSeg} options={[{ value: 'place', label: 'לפי מקום' }, { value: 'time', label: 'לפי זמן' }, { value: 'mine', label: 'רק שלי' }]} />
          <Segmented label="סוג" size="lg" value="task" onChange={noop} options={[{ value: 'task', label: 'משימה' }, { value: 'buy', label: 'קנייה' }]} />
          <Segmented label="שלב" mode="tabs" value="prep" onChange={noop} options={[{ value: 'prep', label: 'הכנה' }, { value: 'reg', label: 'נרשמים' }, { value: 'day', label: 'יום האירוע' }, { value: 'sum', label: 'סיכום' }]} />
          <Tabs label="סוג הרשימה" value={tab} onChange={setTab} options={[{ value: 'super', label: 'סופר', count: 4 }, { value: 'build', label: 'בניין', count: 2 }, { value: 'web', label: 'אינטרנט', count: 0 }, { value: 'look', label: 'מחפשים', count: 3 }]} />
        </Section>

        <Section title="LIST CARDS · ROWS">
          <ListCard title="ליד הכניסה" icon="pin" count={2}>
            <Row
              check={<CheckButton checked={c1} onChange={setC1} label="סימון בוצע: להחליף את הדגל" />}
              title="להחליף את הדגל"
              tags={<Tag tone="urgent">דחוף</Tag>}
              meta="פנויה · עם תמונה"
              done={c1}
              actions={<Button variant="outline">לקחת</Button>}
            />
            <Row
              check={<CheckButton checked={c2} onChange={setC2} label="סימון בוצע: לסדר את ארגז הכלים" />}
              title="לסדר את ארגז הכלים"
              tags={!c2 && <Tag tone="outline">שלך</Tag>}
              meta="בוצע עכשיו · יואב"
              done={c2}
            />
          </ListCard>
          <ListCard title="לקנות" count={2} tone="quiet" end={<TextLink href="#">היסטוריה</TextLink>}>
            <Row check={<CheckButton checked={false} onChange={noop} label="נקנה: חלב 3%" />} href="#" chevron={false} title="חלב 3%" tags={<Tag tone="urgent">דחוף</Tag>} meta="דנה · לפני שעה" value="6 קרטונים" />
            <Row check={<CheckButton checked onChange={noop} label="להחזיר לרשימה: ביצים" />} href="#" chevron={false} done title="ביצים" meta="נועה קנתה · 08:40" value="2 תבניות" />
          </ListCard>
          <ListCard title="חדש" count={3}>
            <Row minHeight={64} leading={<IconTile icon="cart" />} title="יואב יוצא לסופר עכשיו" meta="צריך משהו? עוד אפשר להוסיף" actions={<Button>הוספה</Button>} />
            <Row minHeight={64} href="#" unread leading={<IconTile icon="tasks" />} title="משימה חדשה עליך" meta="לתקן את הברז · בני, לפני 20 דק׳" />
            <Row minHeight={64} href="#" unread leading={<IconTile icon="tasks" tone="red" />} title="דחוף לכולם" meta="להחליף את הדגל בכניסה" />
          </ListCard>
          <ListCard>
            <Row href="#" leading={<Avatar initials="אל" size={32} />} title="אורלי לוי" meta={<span className="k-ltr">054-000-0087</span>} trailing={<span className="k-meta">#87</span>} />
            <Row href="#" leading={<Avatar initials="אכ" size={32} />} title="אליה כהן" tags={<Tag tone="warm">בעלים</Tag>} meta="052-000-0001" />
            <Row muted leading={<Avatar initials="דא" size={32} />} title="דנה אברהם" meta="יצאה ב־12:00" />
          </ListCard>
        </Section>

        <Section title="DETAIL LIST · QUOTE · HISTORY">
          <DetailList>
            <DetailRow term="על מי" action={<Button variant="outline" style={{ padding: '0 12px' }}>לשחרר</Button>}>עליך</DetailRow>
            <DetailRow term="איפה" action={<Button variant="outline" icon="nav" iconSize={16} style={{ padding: '0 12px' }}>ניווט</Button>}>מאחורי המכולה</DetailRow>
            <DetailRow term="כמות" action={<Stepper value={qty} onChange={setQty} />}>{qty} קרטונים</DetailRow>
            <DetailRow term="הערה" plain>המקדח והמברגות חוזרים לארגז האדום.</DetailRow>
          </DetailList>
          <Quote>נשמח שתבואו שוב. שמרנו לכם את המקום.</Quote>
          <SectionTitle>מה קרה עד עכשיו</SectionTitle>
          <History items={['אתמול 08:15 · בני יצר את המשימה', 'אתמול 08:40 · יואב לקח אותה']} />
        </Section>

        <Section title="CARDS · TILES · DATES">
          <Card href="#" pad="md" layout="col">
            <span className="k-row__title">מחר מתחילים ב־15:30 ולא ב־16:00.</span>
            <Bar value={0.75} label="9 מתוך 12 קראו" />
            <Inline justify="space-between" className="k-meta"><span>בני · היום 14:10</span><span style={{ fontWeight: 600, color: 'var(--ink)' }}>קראו 9 מתוך 12</span></Inline>
          </Card>
          <Card href="#" pad="md" layout="row">
            <DateBox day={28} month="נוב׳" />
            <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
              <span className="k-row__title" style={{ fontSize: 17, fontWeight: 700 }}>פסטיבל הסתיו <Tag tone="warm">בעוד 9 ימים</Tag></span>
              <span className="k-meta">21 כרטיסים · 8 ממתינים לתשלום</span>
            </Stack>
            <span className="k-row__chev"><Icon name="chevron" size={20} /></span>
          </Card>
          <Card pad="md" layout="row"><DateBox day={3} tone="warm" /><span style={{ fontSize: 17, fontWeight: 700 }}>הדוכן שלך: מספר 3</span></Card>
          <TileGrid>
            <Tile href="#" icon="ticket" title="אירועים" meta="פסטיבל הסתיו בעוד 9 ימים" />
            <Tile href="#" icon="pin" title="ביקורים" meta="3 מאושרים החודש" badge={1} />
          </TileGrid>
        </Section>

        <Section title="HERO">
          <Hero href="#">
            <HeroNumber>4</HeroNumber>
            <span className="k-hero__body" style={{ gap: 0 }}><span className="k-hero__title">מחכים לטיפול שלך</span><span className="k-hero__meta">2 תשלומים · ביקור · פנייה</span></span>
          </Hero>
          <Hero tight>
            <Inline gap={12} align="baseline"><HeroNumber size="xl">212</HeroNumber><Stack gap={0}><span className="k-hero__title">נכנסו</span><span className="k-hero__sub" style={{ color: 'rgba(255,255,255,.85)' }}>מתוך 640 כרטיסים</span></Stack></Inline>
            <Bar tone="hero" value={0.33} label="שליש מהכרטיסים נכנסו" />
            <div className="k-hero__split"><span>428 עוד לא הגיעו</span><span>נשארו 3 שעות ו־40 דקות</span></div>
          </Hero>
          <Hero>
            <Inline justify="space-between" gap={12}><h2 className="k-hero__h2">3 בחווה עכשיו</h2><Button variant="onhero">שינוי הנוכחות שלי</Button></Inline>
            <Inline gap={10}><Avatar initials="בג" tone="ondark" /><Avatar initials="יפ" tone="onhero-me" /><AvatarStack onHero><Avatar initials="נש" size={28} tone="ondark" /><Avatar initials="אכ" size={28} tone="ondark" /></AvatarStack></Inline>
          </Hero>
        </Section>

        <Section title="BUTTONS">
          <Inline wrap gap={8}>
            <Button>הוספה</Button>
            <Button variant="outline">לקחת</Button>
            <Button variant="secondary">מחיקה</Button>
            <Button variant="neutral" icon="camera">תמונה</Button>
            <Button variant="quiet">אחר כך</Button>
            <Button variant="link">הוספה, ועוד אחת</Button>
            <Button variant="danger">מחיקת החשבון</Button>
            <Button disabled>מושבת</Button>
          </Inline>
          <Button size="tall" icon="cart" block style={{ fontSize: 16 }}>אני בסופר, מתחילים</Button>
          <Button variant="dashed" size="tall" icon="camera" iconSize={20}>הוספת תמונה למשימה</Button>
          <Inline gap={8}>
            <Button size="lg">לקחת אחת מהפנויות · 5</Button>
            <Button variant="outline" size="lg">איפוס הנתונים</Button>
          </Inline>
          <Inline gap={8}>
            <IconButton icon="search" label="חיפוש" />
            <IconButton icon="megaphone" label="הודעה" variant="outline" />
            <IconButton icon="back" label="הבא" variant="bordered" />
            <IconButton icon="phone" label="התקשרות" variant="solid" />
            <IconButton icon="plus" label="הוספה" variant="dashed" />
            <IconButton icon="close" label="הסרה" variant="quiet" />
            <IconButton icon="plus" label="עוד" variant="secondary" size="lg" />
          </Inline>
          <div style={{ background: 'var(--selected)', padding: 12, borderRadius: 8 }}><Button variant="onhero-solid">קראתי</Button></div>
        </Section>

        <Section title="CHIPS · CHOICES · TOGGLE">
          <ChipRow label="סינון">
            {['all', 'people', 'tasks', 'events', 'visits'].map((k, i) => (
              <Chip key={k} selected={chip === k} onClick={() => setChip(k)}>{['הכל · 6', 'אנשים', 'משימות', 'אירועים', 'ביקורים'][i]}</Chip>
            ))}
          </ChipRow>
          <ChoiceGroup label="איפה" value={where} onChange={setWhere} options={[{ value: 'greenhouse', label: 'חממה' }, { value: 'here', label: 'כאן, לפי המיקום שלי' }, { value: 'other', label: 'אחר' }]} />
          <Inline gap={8}><ChoiceChip fill selected>בוקר</ChoiceChip><ChoiceChip fill>אחה״צ</ChoiceChip><ChoiceChip fill>כל היום</ChoiceChip></Inline>
          <Inline gap={8}><AddChip>ביצים</AddChip><AddChip>לחם</AddChip><AddChip>מזון לעיזים</AddChip></Inline>
          <Inline gap={12}><Toggle checked={on} onChange={setOn} label="מפורסם" /><Toggle checked={off} onChange={setOff} label="כבוי" /></Inline>
        </Section>

        <Section title="CHECKBOX · RADIO · STEPPER">
          <Inline gap={8}>
            <CheckButton checked={false} onChange={noop} label="ריק" />
            <CheckButton checked onChange={noop} label="מסומן" />
            <CheckButton checked={false} onChange={noop} label="ריק גדול" size="lg" />
            <CheckButton checked onChange={noop} label="מסומן גדול" size="lg" />
            <Checkbox label="לזכור אותי" checked={cb} onChange={setCb} />
          </Inline>
          <RadioList label="להיכנס בתור">
            <RadioRow compact checked={radio === 'o'} onSelect={() => setRadio('o')} leading={<Avatar initials="בג" size={36} />} title="בעלים · בני" />
            <RadioRow compact checked={radio === 'v'} onSelect={() => setRadio('v')} leading={<Avatar initials="יפ" size={36} />} title="מתנדב · יואב" />
            <RadioRow checked={false} disabled onSelect={noop} title="לא זמין" meta="בחופש עד ראשון" />
          </RadioList>
          <Inline gap={16}><Stepper value={qty2} onChange={setQty2} size="lg" min={1} max={9} /><Stepper value={qty} onChange={setQty} /></Inline>
        </Section>

        <Section title="TAGS · AVATARS · DOTS">
          <Inline wrap gap={6}>
            <Tag tone="urgent">דחוף</Tag><Tag tone="paid">שולם</Tag><Tag tone="waiting">200 ₪</Tag><Tag>טיוטה</Tag><Tag tone="warm">בעלים</Tag><Tag tone="outline">שלך</Tag>
            <span style={{ background: 'var(--selected)', padding: 4, borderRadius: 4 }}><Tag tone="onhero">אישרת הגעה</Tag></span>
          </Inline>
          <Inline gap={8}>
            <Avatar name="נועה שמש" size={28} /><Avatar name="דנה אברהם" size={32} /><Avatar name="יואב פרץ" size={36} /><Avatar name="יואב פרץ" size={44} tone="outline" />
            <Avatar name="בני גוטמן" size={48} tone="me" /><Avatar name="נועה שמש" size={56} tone="me" /><Avatar name="בני גוטמן" size={64} tone="me" />
          </Inline>
          <Inline gap={10}>
            <AvatarStack label="3 משתתפים"><Avatar initials="בג" size={28} /><Avatar initials="נש" size={28} /><Avatar initials="אכ" size={28} /></AvatarStack>
            <Dot /><Dot tone="green" /><Dot tone="amber" /><Dot size="sm" /><CountBadge count={1} /><CountBadge count={3} size="sm" />
            <LiveStatus>חי · 17:20</LiveStatus>
          </Inline>
        </Section>

        <Section title="FIELDS">
          <BigTextInput label="מה צריך לעשות" defaultValue="לתקן את הברז ליד החממה" />
          <Field label="שם האירוע" defaultValue="פסטיבל הסתיו" />
          <FieldRow><Field grow label="משעה" ltr defaultValue="16:00" /><Field grow label="עד שעה" ltr defaultValue="21:00" /></FieldRow>
          <FieldRow end>
            <Field grow label="מחיר לכרטיס, בשקלים" ltr defaultValue="50" />
            <div className="k-field"><span className="k-field__label">עד כמה בהזמנה</span><Stepper value={qty2} onChange={setQty2} size="lg" /></div>
          </FieldRow>
          <Field label="טלפון" ltr placeholder="05" error="מספר לא תקין" />
          <TextAreaField label="הערה" placeholder="מה חשוב לדעת" />
          <SearchField label="חיפוש בכל האפליקציה" defaultValue="כהן" active />
          <SearchField label="שם, טלפון או מספר" />
          <ListCard>
            <Row minHeight={58} title="מפורסם לאורחים" meta="מופיע באפליקציה ופתוח להרשמה" actions={<Toggle checked={on} onChange={setOn} label="מפורסם לאורחים" />} />
            <Row minHeight={58} title="כניסה בסריקה" actions={<Toggle checked={off} onChange={setOff} label="כניסה בסריקה" />} />
          </ListCard>
        </Section>

        <Section title="PROGRESS · STATS · BARS">
          <StatRow><StatTile value="34" label="שילמו בשער" /><StatTile value="18" label="חשבונות דוכן" /><StatTile small value="1,240 ₪" label="נמכר בדוכן" /></StatRow>
          <StatRow grid><StatTile value="96" label="נרשמו" /><StatTile value="81" label="הגיעו" /></StatRow>
          <Card style={{ paddingBottom: 8 }}>
            <SectionHeader title="מה נמכר בדוכן" />
            <BarList items={[{ label: 'לימונדה', value: 38 }, { label: 'עוגת תפוחים', value: 24 }, { label: 'גבינת עיזים', value: 17 }, { label: 'דבש', value: 9 }]} />
          </Card>
        </Section>

        <Section title="EMPTY STATES">
          <EmptyState variant="card" icon="calendar" title="אין כרגע אירוע קרוב" text="כשנזמין אותך לאירוע הוא יופיע כאן, ותקבל גם הודעה בוואטסאפ." />
          <EmptyState icon="cart" title="אין מה להזמין באינטרנט" text="פריט עם קישור נכנס לכאן." style={{ paddingBottom: 0 }} />
          <EmptyState variant="done" title="סיימת את כל מה שעליך" text="5 משימות היום" action={<Button size="lg">לקחת אחת מהפנויות · 5</Button>} />
          <EmptyState variant="blocked" title="החשבון הושעה" text="מנהל השעה את הגישה שלך." />
        </Section>

        <Section title="STRIPS · TOASTS">
          <div className="k-gallery__frame">
            <DemoStrip roleName="מתנדב" day="יום רגיל" onSwitch={noop} onExit={noop} />
            <div style={{ height: 8 }} />
            <Strip icon="offline">אין קליטה. 3 פעולות שמורות בטלפון</Strip>
            <div style={{ height: 8 }} />
            <Strip tone="warm" icon="megaphone" action={{ label: 'לקרוא', onClick: noop }}>הודעה חדשה מבני</Strip>
            <div style={{ height: 8 }} />
            <Toast actions={[{ label: 'צילום', onClick: noop }, { label: 'ביטול', onClick: noop }]}>בוצע: לסדר את ארגז הכלים</Toast>
            <div style={{ height: 8 }} />
            <Toast tone="alert" actions={[{ label: 'הבנתי', onClick: noop }]}><b>לא נשמר.</b> נועה לקחה את המשימה לפני רגע</Toast>
            <div style={{ height: 8 }} />
          </div>
        </Section>

        <Section title="CAPTURE · NAV (2/3/4/5) · BOTTOM BAR">
          <div className="k-gallery__frame">
            <CaptureBar value={cap} onChange={setCap} onSubmit={() => setCap('')} />
            <BottomNav items={NAV_VENDOR} />
            <div style={{ height: 8 }} />
            <BottomNav items={NAV_STAFF} />
            <div style={{ height: 8 }} />
            <BottomNav items={NAV_MANAGER} />
            <div style={{ height: 8 }} />
            <BottomNav items={NAV_EVENT} />
            <div style={{ height: 8 }} />
            <BottomBar><Button size="bar" grow icon="check">בוצע</Button><Button variant="secondary" size="bar" icon="camera">עם צילום</Button></BottomBar>
            <div style={{ height: 8 }} />
            <BottomBar column><Button size="bar" block>הוספת משימה</Button><Button variant="link">הוספה, ועוד אחת</Button></BottomBar>
          </div>
        </Section>

        <Section title="SHEET">
          <div className="k-gallery__frame" style={{ height: 470 }}>
            <Button style={{ margin: 16 }} onClick={() => setSheet(true)}>פתיחת הגיליון</Button>
            <Sheet contained open={sheet} onClose={() => setSheet(false)} title="הדגמה" aside="נתונים לא אמיתיים">
              <RadioList label="להיכנס בתור">
                <RadioRow compact checked={radio === 'o'} onSelect={() => setRadio('o')} leading={<Avatar initials="בג" size={36} />} title="בעלים · בני" />
                <RadioRow compact checked={radio === 'v'} onSelect={() => setRadio('v')} leading={<Avatar initials="יפ" size={36} />} title="מתנדב · יואב" />
              </RadioList>
              <Segmented label="איזה יום" mode="radio" value="d" onChange={noop} options={[{ value: 'd', label: 'יום רגיל' }, { value: 'e', label: 'יום אירוע' }, { value: 'a', label: 'אחרי אירוע' }]} />
              <Inline gap={8}>
                <Button variant="secondary" size="lg" grow icon="exit" style={{ fontWeight: 600 }}>יציאה מההדגמה</Button>
                <Button variant="outline" size="lg">איפוס הנתונים</Button>
              </Inline>
            </Sheet>
          </div>
        </Section>

        <Section title="GATE (SCALED)">
          <div style={{ display: 'flex', gap: 8 }}>
            {(['ok', 'pay', 'bad'] as const).map((t) => (
              <div key={t} style={{ flex: 1, height: 300, overflow: 'hidden', borderRadius: 8 }}>
                <div style={{ width: 390, transform: 'scale(.29)', transformOrigin: 'top right' }}>
                  <GateComposition tone={t} />
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title={`ICONS (${ICON_NAMES.length})`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {ICON_NAMES.map((n) => (
              <div key={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--soft)', direction: 'ltr' }}>
                <span style={{ color: 'var(--ink)' }}><Icon name={n} size={24} /></span>
                {n}
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ───────── Screen compositions (kit parts only), compared 1:1 with design/png ───────── */

/** T1-Root / T4-Done. */
export function T1Composition({ done = false }: { done?: boolean }) {
  return (
    <Screen
      variant="root"
      bottom={
        <>
          {done && <Toast actions={[{ label: 'צילום', onClick: noop }, { label: 'ביטול', onClick: noop }]}>בוצע: לסדר את ארגז הכלים</Toast>}
          <CaptureBar />
          <BottomNav items={NAV_STAFF} />
        </>
      }
    >
      <RootHeader overline="חמישי · 19.11" title="משימות" unread={3} avatar="יפ" searchHref="#" bellHref="#" avatarHref="#" />
      <ProgressSegments total={5} done={done ? 4 : 3} caption={done ? '4 מתוך 5 שלך בוצעו. נשארה אחת' : '3 מתוך 5 שלך בוצעו'} />
      <NextUpCard
        title={done ? 'להעביר שקי קומפוסט לחממה' : 'לסדר את ארגז הכלים במכולה'}
        meta={done ? 'חממה · אליה ביקש' : 'מאחורי המכולה · בני ביקש'}
        actions={<><Button size="big" grow icon="check">בוצע</Button><Button variant="secondary" size="lg" icon="camera">צילום</Button></>}
      />
      <Segmented label="תצוגה" value="place" onChange={noop} options={[{ value: 'place', label: 'לפי מקום' }, { value: 'time', label: 'לפי זמן' }, { value: 'mine', label: 'רק שלי' }]} />
      <ListCard title="ליד הכניסה" icon="pin" count={2}>
        <Row check={<CheckButton checked={false} onChange={noop} label="סימון בוצע: להחליף את הדגל" />} title="להחליף את הדגל" tags={<Tag tone="urgent">דחוף</Tag>} meta="פנויה · עם תמונה" actions={<Button variant="outline">לקחת</Button>} />
        <Row check={<CheckButton checked={false} onChange={noop} label="סימון בוצע: לגזום ענפים נמוכים" />} title="לגזום ענפים נמוכים" meta="פנויה" actions={<Button variant="outline">לקחת</Button>} />
      </ListCard>
      {done ? (
        <ListCard title="מכולה ומחסן" icon="pin" count={2}>
          <Row check={<CheckButton checked onChange={noop} label="סימון בוצע: לסדר את ארגז הכלים" />} done title="לסדר את ארגז הכלים" meta="בוצע עכשיו · יואב" />
        </ListCard>
      ) : (
        <ListCard title="חממה" icon="pin" count={1}>
          <Row check={<CheckButton checked={false} onChange={noop} label="סימון בוצע: להעביר שקי קומפוסט" />} title="להעביר שקי קומפוסט" tags={<Tag tone="outline">שלך</Tag>} meta="אליה ביקש" />
        </ListCard>
      )}
    </Screen>
  );
}

/** T5-Add. */
export function T5Composition() {
  const [kind, setKind] = useState<'task' | 'buy'>('task');
  return (
    <Screen
      variant="form"
      bottom={<BottomBar column><Button size="bar" block>הוספת משימה</Button><Button variant="link">הוספה, ועוד אחת</Button></BottomBar>}
    >
      <FormHeader title="הוספה" onCancel={noop} />
      <BigTextInput label="מה צריך לעשות" defaultValue="לתקן את הברז ליד החממה" />
      <Segmented label="סוג" size="lg" value={kind} onChange={setKind} options={[{ value: 'task', label: 'משימה' }, { value: 'buy', label: 'קנייה' }]} />
      <ChoiceGroup label="איפה" value="g" onChange={noop} options={[{ value: 'g', label: 'חממה' }, { value: 'h', label: 'כאן, לפי המיקום שלי' }, { value: 'o', label: 'אחר' }]} />
      <ChoiceGroup label="על מי" value="free" onChange={noop} options={[{ value: 'free', label: 'פנויה' }, { value: 'me', label: 'עליי' }, { value: 'x', label: 'מישהו אחר' }]} />
      <ChoiceGroup label="מתי" value="none" onChange={noop} options={[{ value: 't', label: 'היום' }, { value: 'tm', label: 'מחר' }, { value: 'w', label: 'השבוע' }, { value: 'none', label: 'בלי תאריך' }]} />
      <Inline gap={8}>
        <Button variant="neutral" size="tall" grow icon="camera" iconSize={20}>תמונה</Button>
        <Button variant="neutral" size="tall" grow>הערה</Button>
        <Button variant="neutral" size="tall" grow>דחוף</Button>
      </Inline>
    </Screen>
  );
}

/** X1-Refused (alert toast over T1). */
export function X1Composition() {
  return (
    <Screen
      variant="root"
      bottom={
        <>
          <Toast tone="alert" actions={[{ label: 'הבנתי', onClick: noop }]}><b>לא נשמר.</b> נועה לקחה את המשימה לפני רגע</Toast>
          <CaptureBar />
          <BottomNav items={NAV_STAFF} />
        </>
      }
    >
      <RootHeader overline="חמישי · 19.11" title="משימות" unread={3} avatar="יפ" searchHref="#" bellHref="#" avatarHref="#" />
      <ProgressSegments total={5} done={3} caption="3 מתוך 5 שלך בוצעו" />
      <NextUpCard title="לסדר את ארגז הכלים במכולה" meta="מאחורי המכולה · בני ביקש" actions={<><Button size="big" grow icon="check">בוצע</Button><Button variant="secondary" size="lg" icon="camera">צילום</Button></>} />
      <Segmented label="תצוגה" value="place" onChange={noop} options={[{ value: 'place', label: 'לפי מקום' }, { value: 'time', label: 'לפי זמן' }, { value: 'mine', label: 'רק שלי' }]} />
      <ListCard title="ליד הכניסה" icon="pin" count={2}>
        <Row check={<CheckButton checked={false} onChange={noop} label="סימון בוצע: להחליף את הדגל" />} title="להחליף את הדגל" tags={<Tag tone="urgent">דחוף</Tag>} meta="נועה · לפני רגע" />
        <Row check={<CheckButton checked={false} onChange={noop} label="סימון בוצע: לגזום ענפים נמוכים" />} title="לגזום ענפים נמוכים" meta="פנויה" actions={<Button variant="outline">לקחת</Button>} />
      </ListCard>
    </Screen>
  );
}

/** Z2-DemoBanner + Z3-DemoSwitch. */
export function Z3Composition({ open = true }: { open?: boolean }) {
  return (
    <div style={{ position: 'relative' }}>
      <Screen variant="root" top={<DemoStrip roleName="מתנדב" day="יום רגיל" expanded={open} onSwitch={noop} onExit={noop} />} bottom={<><CaptureBar /><BottomNav items={NAV_STAFF} /></>}>
        <RootHeader overline="חמישי · 19.11" title="משימות" unread={3} avatar="יפ" searchHref="#" bellHref="#" avatarHref="#" />
        <ProgressSegments total={5} done={3} caption="3 מתוך 5 שלך בוצעו" />
        <NextUpCard title="לסדר את ארגז הכלים במכולה" meta="מאחורי המכולה · בני ביקש" actions={<><Button size="big" grow icon="check">בוצע</Button><Button variant="secondary" size="lg" icon="camera">צילום</Button></>} />
      </Screen>
      <Sheet contained open={open} onClose={noop} title="הדגמה" aside="נתונים לא אמיתיים">
        <RadioList label="להיכנס בתור">
          {[['בג', 'בעלים · בני'], ['נש', 'מנהלת · נועה'], ['יפ', 'מתנדב · יואב'], ['רכ', 'בעל דוכן · רז'], ['מב', 'אורחת · מיכל']].map(([i, t]) => (
            <RadioRow key={i} compact checked={i === 'יפ'} onSelect={noop} leading={<Avatar initials={i} size={36} />} title={t} />
          ))}
        </RadioList>
        <Segmented label="איזה יום" mode="radio" value="d" onChange={noop} options={[{ value: 'd', label: 'יום רגיל' }, { value: 'e', label: 'יום אירוע' }, { value: 'a', label: 'אחרי אירוע' }]} />
        <Inline gap={8}>
          <Button variant="secondary" size="lg" grow icon="exit" style={{ fontWeight: 600 }}>יציאה מההדגמה</Button>
          <Button variant="outline" size="lg">איפוס הנתונים</Button>
        </Inline>
      </Sheet>
    </div>
  );
}

/** E3-Ok / E4-Pay / E5-Bad. */
export function GateComposition({ tone }: { tone: 'ok' | 'pay' | 'bad' }) {
  if (tone === 'ok') {
    return (
      <GateResult tone="ok" place="שער · פסטיבל הסתיו" headline="מאושר" name="מיכל ברק" detail="כרטיס 2 מתוך 3 · כניסה ראשונה"
        actions={<GateButton>הבא</GateButton>} note="חוזר לסריקה בעוד 3 שניות" />
    );
  }
  if (tone === 'pay') {
    return (
      <GateResult tone="pay" place="שער · פסטיבל הסתיו" prelude="נשאר לשלם" amount="50 ₪" name="מיכל ברק" detail="כרטיס אחד · הוזמן היום 11:07"
        extra={<>ביט <span className="k-ltr">050-000-0000</span> · PayBox · מזומן</>}
        actions={<><GateButton variant="dark" icon="check">שולם, להכניס</GateButton><GateButton variant="outline">להכניס, ישלמו אחר כך</GateButton><GateButton variant="link">לא להכניס</GateButton></>} />
    );
  }
  return (
    <GateResult tone="bad" place="שער · פסטיבל הסתיו" headline="כרטיס בוטל" headlineSize="md" name="יוסי מזרחי" detail="ההזמנה בוטלה ב־17.11 על ידי מנהל"
      actions={<><GateButton icon="search" iconSize={26}>חיפוש בשם</GateButton><GateButton variant="outline">לסרוק שוב</GateButton></>} />
  );
}

/** E2-Scan. */
export function E2Composition() {
  return <GateCamera place="שער · פסטיבל הסתיו" onExit={noop} lastScan={{ text: 'הקודם: דוד כהן · מאושר', time: '17:19' }} onSearch={noop} />;
}

/** T3-Task (detail screen). */
export function T3Composition() {
  return (
    <Screen variant="detail" bottom={<BottomBar><Button size="bar" grow icon="check">בוצע</Button><Button variant="secondary" size="bar" icon="camera">עם צילום</Button></BottomBar>}>
      <TopBar back={{ label: 'משימות', href: '#' }} end={<Button variant="outline" icon="edit" iconSize={16}>עריכה</Button>} />
      <PageTitle size="detail">לסדר את ארגז הכלים במכולה</PageTitle>
      <DetailList>
        <DetailRow term="על מי" action={<Button variant="outline" style={{ padding: '0 12px' }}>לשחרר</Button>}>עליך</DetailRow>
        <DetailRow term="איפה" action={<Button variant="outline" icon="nav" iconSize={16} style={{ padding: '0 12px' }}>ניווט</Button>}>מאחורי המכולה</DetailRow>
        <DetailRow term="עד מתי">היום</DetailRow>
        <DetailRow term="ביקש">בני גוטמן · אתמול 08:15</DetailRow>
        <DetailRow term="הערה" plain>המקדח והמברגות חוזרים לארגז האדום. מה ששבור, לשים בצד.</DetailRow>
      </DetailList>
      <Button variant="dashed" size="tall" icon="camera" iconSize={20}>הוספת תמונה למשימה</Button>
      <Stack gap={4} as="section">
        <SectionTitle>מה קרה עד עכשיו</SectionTitle>
        <History items={['אתמול 08:15 · בני יצר את המשימה', 'אתמול 08:40 · יואב לקח אותה']} />
      </Stack>
    </Screen>
  );
}

/** Pick a composition by name (used by the preview script: #T1, #T4, #T5, #T3, #X1, #Z3, #E2, #E3, #E4, #E5). */
export function GalleryView({ view }: { view: string }) {
  switch (view) {
    case 'T1': return <T1Composition />;
    case 'T4': return <T1Composition done />;
    case 'T5': return <T5Composition />;
    case 'T3': return <T3Composition />;
    case 'X1': return <X1Composition />;
    case 'Z3': return <Z3Composition />;
    case 'E2': return <E2Composition />;
    case 'E3': return <GateComposition tone="ok" />;
    case 'E4': return <GateComposition tone="pay" />;
    case 'E5': return <GateComposition tone="bad" />;
    default: return <Gallery />;
  }
}

export default Gallery;
