# Havat Raveh v2 kit

`import { Screen, Row, Button, Icon, ... } from '../kit';` (from `src/app/v2/kit/index.tsx`). Importing the kit also brings in its stylesheet (fonts, tokens and `k-` classes).
The design HTML (`design/html/<id>.html`) is the source of truth. Build every screen from these parts, and add inline styles only for one-off spacing.
Visual QA: `node scripts/kit-gallery.mjs <outDir> --design <havat-raveh-redesign/design>` writes the gallery, the screen compositions and side-by-side comparison sheets at 390x844 @2x.
`Gallery.tsx` has working examples of every part, including full T1, T4, T5, T3, X1, Z3 and E2-E5 compositions.

## Rules
- **Root.** Tokens live on `.v2`, not on `:root`, because the legacy CSS also uses `--ink`, `--line` and `--green`. `Screen`, `Sheet`, `GateResult` and `GateCamera` add `className="v2" dir="rtl"` themselves. Anything else rendered outside them must sit inside `<div className="v2" dir="rtl">`.
- **Tokens** (CSS vars on `.v2`): `--bg #F3F4F2`, `--surface #FFF`, `--ink #14171B`, `--soft #545B64`, `--line #DDE0E3`, `--line-strong #8A9099`, `--selected #4E433D` (warm: selected, hero, "mine"), `--action #1F5A4A` (pine: primary, links), `--red #B3261E`, `--green #0B6B3C`, `--amber #F2B233`, `--toggle-off`, `--backdrop`, `--gate-dark`. Selected state is always warm, never pine.
- **Type.** IBM Plex Sans Hebrew 400/500/600/700, loaded as self-hosted woff2 from `/assets/fonts`. Numbers are tabular everywhere. Use `className="k-num"` for tabular figures and `className="k-ltr"` for phone numbers and times inside Hebrew text.
- **RTL.** All spacing uses logical properties: start is the right side. `back` icon points right (the back link) and `chevron` points left (go forward in a row).
- **Tap targets.** Every control is at least 44px, and focus rings are 2px pine (white on dark surfaces).
- **Box model.** Rows, toasts, nav, search and detail rows are content-box like the artboards, so their rendered heights match: row 63, toast 60, alert 68, nav 67, search 55, detail row 61. Do not wrap them in something that forces border-box.
- **Labels.** Icon-only controls require `label`. All visible copy is Hebrew and comes from the design HTML.

## Layout
| Component | Key props | Notes / design |
|---|---|---|
| `Screen` | `variant` root/detail/form/plain, `gap`, `top`, `bottom`, `auto` | 100dvh frame with a scrolling body (padding 16). `top` holds DemoStrip or Strip. **`bottom` order: Toast, then CaptureBar, then BottomNav or BottomBar**; spacing is automatic. root: top 18, gap 12 (T1). detail: top 6, gap 12 (T3). form: top 10, gap 14 (T5). |
| `Stack` / `Inline` | `gap`, `align`, `justify`, `wrap`, `as` | Flex helpers. |
| `VisuallyHidden` | `as` | Screen-reader-only text. |

## Headers
| Component | Key props | Notes |
|---|---|---|
| `RootHeader` | `overline`, `title`, `unread`, `avatar` (initials), `avatarSrc`, `searchHref/onSearch`, `bellHref/onBell`, `avatarHref/onAvatar`, `hideSearch`, `hideBell` | Header for root screens: title 30/700; search, a bell with a red badge, and a 44 avatar. T1, S1, F1, M1, D3. |
| `TopBar` | `back: {label, href/onClick}`, `end` | Top bar for detail screens: a named back link and one action. T3, B2, M4. |
| `BackLink` | `label`, `href/onClick` | Used alone when there is no end action. |
| `PageTitle` | `size` root 30 / detail 26 / form 22 | The h1 under a TopBar. |
| `FormHeader` | `title`, `cancelLabel='ביטול'`, `cancelHref/onCancel`, `end` (null hides) | Form header: 22/700 title and a quiet pine cancel. T5, N11. |
| `SectionTitle` | `spaced`, `as` | Soft 14/600 caption between cards. |
| `Overline` | | Small pine 13/600 line ("הבא בתור"). |

## Bottom areas
| Component | Key props | Notes |
|---|---|---|
| `CaptureBar` | `value`, `onChange(v)`, `onSubmit(v)`, `onCamera`, `onMic`, `placeholder` | Capture bar shown on every root screen: plus, input, camera and mic in a form. T1, S1. |
| `BottomNav` | `items: {key,label,icon,href/onClick,active,badge}[]` | 2-5 items: vendor 2, staff 3, manager 4, plus "אירוע" on event days. Active item has a 3px ink top bar and `aria-current`. |
| `BottomBar` | `column` | White bar with safe-area padding. Children: `<Button size="bar" grow>` plus an optional `<Button variant="secondary" size="bar">`. With `column`, a link sits under the primary button (T5). |

## Cards and lists
| Component | Key props | Notes |
|---|---|---|
| `Card` | `pad` none/sm/md/lg/xl, `layout` col/row, `href/onClick`, `as` | White card, radius 8. With `href` the whole card is a link. |
| `ListCard` | `title`, `count`, `icon`, `tone` strong/quiet, `end`, `header`, `footer` | Card holding `<Row>`s separated by 1px lines. Example: `icon="pin"` for place groups (T1), `tone="quiet"` (S1). |
| `SectionHeader` | same as the ListCard header | Use alone inside a custom Card. |
| `Row` | `title`, `tags`, `meta`, `check`, `leading`, `trailing`, `value`, `unread`, `chevron`, `actions`, `done`, `muted`, `minHeight`, `href/onClick`, `children` | `<li>`. Order: check, then a link (leading, body, trailing, value, unread dot, chevron), then actions. Setting `check` switches to the task-row layout. Default min height is 54. |
| `NextUpCard` | `overline='הבא בתור'`, `title`, `meta`, `metaIcon='pin'`, `actions` | The next-up card on root screens. T1, T4, P1. |
| `DetailList` / `DetailRow` | `term`, `action`, `plain` | Term and value rows (T3, D4). |
| `IconTile` | `icon`, `tone` pine/red/ink | Square icon used as a row `leading`. |
| `DateBox` | `day`, `month`, `tone` bg/warm | Date block for event rows (M3). |
| `Tile` / `TileGrid` | `icon`, `title`, `meta`, `badge` | Two-column management grid. M1, Z4. |
| `Quote`, `History` (`items`), `CountBadge` (`count`, `size`) | | Note quote, change history, red count. |
| `Hero` / `HeroNumber` | `tight`, `chevron`, `href`; HeroNumber `size` md/xl | Warm block with white text, at most one per screen. M1, D3, Y1, M6. Helper classes: `k-hero__title`, `k-hero__meta`. |

## Buttons
| Component | Key props | Notes |
|---|---|---|
| `Button` | `variant`, `size`, `icon`, `iconSize`, `block`, `grow`, `href`, plus native attributes | Sizes: md 44, tall 48, lg 52, big 52 at 18/600, bar 56 at 18/600.<br>Variants:<br>• `primary`: pine fill<br>• `outline`: pine border ("לקחת")<br>• `secondary`: ink border ("צילום")<br>• `neutral`: line border (T5)<br>• `dashed`: T3<br>• `quiet`: soft text<br>• `link`: pine text<br>• `danger`: red text<br>• `onhero`, `onhero-solid`: on a hero block |
| `IconButton` | `icon`, `label` (required), `variant` ghost/outline/bordered/solid/dashed/quiet/secondary, `size` md 44 / lg 56, `round`, `pressed` | Icon-only control. |
| `TextLink` | `href/onClick` | Inline pine link ("היסטוריה"). |

## Choices and switches
| Component | Key props | Notes |
|---|---|---|
| `Chip` / `ChipRow` | `selected`; `wrap`, `label` | Filter pills (radius 22); selected uses a warm fill. ChipRow scrolls horizontally unless `wrap` is set. C2, M2. |
| `ChoiceChip` | `selected`, `fill`, `tall`, `radio` | Form choice (radius 8). |
| `ChoiceGroup<T>` | `label`, `options`, `value` (one value or an array), `onChange(v)`, `fill`, `tall` | Label plus wrapping choices. T5 "איפה / על מי / מתי". |
| `AddChip` | `icon='plus'` | Dashed suggestion chip (S1). |
| `Segmented<T>` | `options`, `value`, `onChange`, `label`, `mode` pressed/radio/tabs, `size` md 40 / lg 48 | White track; the selected segment is warm. T1, T5 (lg), Z3 (radio). |
| `Tabs<T>` | `options` (with `count`), `value`, `onChange`, `label` | Underlined tabs (S1). |
| `Toggle` | `checked`, `onChange`, `label` | 52x32 switch: on is pine with the knob at the end, as in the HTML. N11, C11. |

## Checks and radios
| Component | Key props | Notes |
|---|---|---|
| `CheckButton` | `checked`, `onChange`, `label`, `size` md/lg | Row checkbox: a 44 hit area (52 at lg) with a 24 box (28 at lg). Checked is warm and animates. Pass it as `Row check`. |
| `Checkbox` | `label`, `checked`, `onChange` | Native checkbox with a label, for forms. |
| `CheckboxBox`, `RadioMark` | `checked` | Bare visuals. |
| `RadioList` / `RadioRow` | `label`; `checked`, `onSelect`, `title`, `meta`, `leading`, `compact` | Full-width radio rows inside a card. A1, C4, Z3 (compact). |

## Tags, avatars, status
| Component | Key props | Notes |
|---|---|---|
| `Tag` | `tone` urgent/paid/waiting/neutral/warm/outline/onhero | Small label ("דחוף", "שולם", "שלך"). |
| `Avatar` | `name` or `initials`, `size` 28-64, `tone` default/me/ondark/onhero-me/outline, `src`, `href`, `label` | `initials(name)` gives two letters and handles final letters. |
| `AvatarStack` | `onHero`, `label` | Overlapping avatars. |
| `Dot` | `tone` red/green/amber/pine, `size`, `label` | |
| `LiveStatus` | `tone` | Green dot plus text ("חי · 17:20"). |

## Fields
| Component | Key props | Notes |
|---|---|---|
| `Field` | `label`, `labelHidden`, `hint`, `error`, `ltr`, `size` md/sm, `numeric`, `center`, `grow`, plus input attributes | Label above a 48 input (sm 44). `ltr` is for phones, hours and amounts. |
| `TextAreaField` | `height` (default 84) | |
| `FieldRow` | `end` | Fields side by side (hours from / to). |
| `BigTextInput` | `label` (screen-reader only), `size` md 84 / lg 104 | Big pine-bordered text area at the top of add forms. T5, S5, B1. |
| `SearchField` | `label`, `active`, `size` | Search box with a magnifier. C2, C4, M5, E6. |
| `Stepper` | `value`, `onChange`, `min`, `max`, `step`, `size` md/lg, `showValue` | Minus / plus pair (S4, N11). |

## Feedback
| Component | Key props | Notes |
|---|---|---|
| `Toast` | `tone` info/alert, `icon`, `actions: {label,onClick}[]` | First item in `Screen bottom`. `info` is warm with `role=status` (T4). `alert` is red with `role=alert` (X1); start its text with `<b>לא נשמר.</b>`. |
| `Strip` | `tone` ink/warm/red/amber/green, `icon`, `action`, `role` | Full-width strip in `Screen top` (C8 offline: `tone="ink" icon="offline"`). |
| `DemoStrip` | `roleName`, `day`, `onSwitch`, `onExit`, `expanded` | 28px demo strip. Z2-Z5. |
| `Sheet` | `open`, `onClose`, `title`, `aside`, `contained` | Bottom sheet; Escape or a tap on the backdrop closes it. Z3. |
| `ConfirmSheet` | `open`, `onClose`, `title`, `text`, `confirmLabel`, `cancelLabel`, `onConfirm` | The confirmation before every delete: question, one line on what happens, red outlined button, "ביטול". Both wait while `onConfirm` runs. |
| `EmptyState` | `variant` fill/card/done/blocked, `icon`, `title`, `text`, `action` | S3, D10, L5, X2. |
| `ProgressSegments` | `total`, `done`, `tone` ink/warm, `caption` | T1 ("3 מתוך 5 שלך בוצעו"), P1. |
| `Bar` | `value` 0-1, `tone` default/hero/chart | |
| `BarList` | `items: {label,value}[]`, `max` | Ranked bars inside a Card (M7). |
| `StatTile` / `StatRow` | `value`, `label`, `small`; `grid` | Number tiles. M5, M6, M7. |

## Gate (full-bleed pages, no Screen)
| Component | Key props | Notes |
|---|---|---|
| `GateResult` | `tone` ok/pay/bad, `place`, `mark`, `prelude`, `headline`, `headlineSize` lg/md, `amount`, `name`, `detail`, `extra`, `actions`, `note` | E3 (ok), E4 (pay, with an amount), E5 (bad, headline md). |
| `GateButton` | `variant` solid/dark/outline/link/light, `icon`, `iconSize` | Buttons 48-76 high. |
| `GateCamera` | `place`, `onExit`, `hint`, `children` (video), `lastScan: {text,time,tone}`, `onSearch` | E2 scanner shell. |

## Icons
`<Icon name="cart" size={22} strokeWidth={1.8} label?="..." />` draws a 24-unit grid in `currentColor`. It is decorative (aria-hidden) unless you pass `label`. `ICON_NAMES` lists all names:
user camera check farm megaphone back plus tasks cart grid message search bell pin mic chevron qr edit bell-settings people download ticket phone offline calendar stall file nav bolt box help close drag heart chart sliders link blocked chevron-down exit

## Examples
```tsx
// T1 root screen
<Screen variant="root" bottom={<><CaptureBar onSubmit={add} /><BottomNav items={nav} /></>}>
  <RootHeader overline="חמישי · 19.11" title="משימות" unread={3} avatar="יפ" searchHref="#/search" bellHref="#/inbox" avatarHref="#/me" />
  <ProgressSegments total={5} done={3} caption="3 מתוך 5 שלך בוצעו" />
  <NextUpCard title="לסדר את ארגז הכלים במכולה" meta="מאחורי המכולה · בני ביקש"
    actions={<><Button size="big" grow icon="check">בוצע</Button><Button variant="secondary" size="lg" icon="camera">צילום</Button></>} />
  <Segmented label="תצוגה" value={view} onChange={setView} options={[{ value: 'place', label: 'לפי מקום' }, { value: 'time', label: 'לפי זמן' }]} />
  <ListCard title="ליד הכניסה" icon="pin" count={2}>
    <Row check={<CheckButton checked={false} onChange={toggle} label="סימון בוצע: להחליף את הדגל" />}
      title="להחליף את הדגל" tags={<Tag tone="urgent">דחוף</Tag>} meta="פנויה" actions={<Button variant="outline">לקחת</Button>} />
  </ListCard>
</Screen>

// T3 detail screen
<Screen variant="detail" bottom={<BottomBar><Button size="bar" grow icon="check">בוצע</Button><Button variant="secondary" size="bar" icon="camera">עם צילום</Button></BottomBar>}>
  <TopBar back={{ label: 'משימות', href: '#/tasks' }} end={<Button variant="outline" icon="edit" iconSize={16}>עריכה</Button>} />
  <PageTitle size="detail">לסדר את ארגז הכלים במכולה</PageTitle>
  <DetailList><DetailRow term="איפה">מאחורי המכולה</DetailRow></DetailList>
</Screen>

// T5 form
<Screen variant="form" bottom={<BottomBar column><Button size="bar" block>הוספת משימה</Button><Button variant="link">הוספה, ועוד אחת</Button></BottomBar>}>
  <FormHeader title="הוספה" onCancel={close} />
  <BigTextInput label="מה צריך לעשות" value={text} onChange={(e) => setText(e.target.value)} />
  <ChoiceGroup label="איפה" value={place} onChange={setPlace} options={places} />
</Screen>

// Feedback: toast first in bottom, strip in top
<Screen top={<Strip icon="offline">אין קליטה. 3 פעולות שמורות בטלפון</Strip>}
  bottom={<><Toast actions={[{ label: 'ביטול', onClick: undo }]}>בוצע: לסדר את ארגז הכלים</Toast><CaptureBar /><BottomNav items={nav} /></>}>…</Screen>

// Sheet
<Sheet open={open} onClose={() => setOpen(false)} title="הדגמה" aside="נתונים לא אמיתיים">
  <RadioList label="תפקיד"><RadioRow compact checked leading={<Avatar initials="יפ" size={36} />} title="מתנדב · יואב" onSelect={pick} /></RadioList>
</Sheet>

// Gate result
<GateResult tone="ok" place="שער · פסטיבל הסתיו" headline="מאושר" name="מיכל ברק" detail="כרטיס 2 מתוך 3 · כניסה ראשונה"
  actions={<GateButton onClick={next}>הבא</GateButton>} note="חוזר לסריקה בעוד 3 שניות" />
```

## Tidy patterns (`patterns.tsx`, design: `havat-raveh-tidy/design`, rules: `havat-raveh-tidy/RULES.md`)
Build every secondary action, choice and delete from these. A screen never grows its own variant.

| Component | Key props | Notes / design |
|---|---|---|
| `MoreMenu` | `title`, `items: ActionItem[]` | ⋯ in the TopBar `end` plus its sheet "{title} · עוד פעולות" (Q5). Rule 5: table view, export, print, history, copy-from-previous, block and delete live here. Renders nothing when every item is hidden. |
| `ActionItem` | `label`, `icon`, `meta`, `tone: 'danger'`, `hidden`, `onSelect`, `confirm: {title, text, confirmLabel, onConfirm}` | Red items sit in their own card at the bottom. `confirm` opens the Q8 sheet after the menu closes (rule 6: the only way to delete). |
| `ActionSheet` | `open`, `onClose`, `title`, `sub`, `items` | The row sheet (Q11): tap a row, its actions open here. Also what MoreMenu uses. |
| `MoreButton` | `onClick`, `label='עוד פעולות'` | The bare 44px outlined ⋯. |
| `ConfirmSheet` | `title` (question), `text` (what is deleted · logged · cannot be undone), `confirmLabel='מחיקה'`, `onConfirm` | Q8: red filled button with a bin beside an outlined "ביטול". |
| `SelectRow` | `label`, `value`, `leading`, `linkLabel`, `onClick` | One choice of many in its own card (rule 9): chevron (U3, U8) or a "החלפה" link (Q17). Opens a `PickerSheet`. |
| `PickerSheet` | `title`, `options: PickOption[]`, `value`, `onChange`, `head`, `multiple`, `values` | Sheet with one radio list; `head` holds a search field for long lists. `multiple`: check boxes, `values` are the chosen ones, each tap toggles through `onChange`, the sheet stays open until "סיום" (Q31 "מי משתתף" when there are more than five people). |
| `Dropdown` | `label`, `options`, `value`, `onChange` | Q16: field-like 44px button with a down chevron; two side by side replace two chip rows. |
| `MoreDetails` | `title='עוד פרטים'`, `defaultOpen` | Q3: collapsible card for fields beyond the designed set (rule 8). Open when any field inside has a value. Children are rows. |
| `useReorder` / `DragHandle` | `handle(i, name)`, `rowStyle(i)` | Q21: the handle is the first thing in the row; arrows move with the keyboard. No up/down arrow pairs. |
| `UnderlineLink` | `icon`, `href/onClick` | Q18: "עריכת פרטים" on the team profile and the guest account only. Other detail screens keep the outlined "עריכה". |
| `DataTable` | `headers`, `rows` | Q9 card: horizontal scroll inside the card, heading tap sorts (money and dd.mm.yyyy dates by value). Screen wiring: `useTableView` in `v2/patterns.tsx` (`<route>/table`); cells use `tableCell.date / time / money` there, the same in the table and the CSV. |
| `PayConfirmSheet` | `name`, `channels`, `initial`, `preview`, `onSend` | Q7 after approving a payment. Screen wiring: `usePayConfirm` in `v2/patterns.tsx`. |

### Row shape (rule 4, enforced in `Row`)
Leading avatar or icon, a title with at most one status tag (`tags` keeps the first element), one meta line, an optional
amount (`value` or `trailing`), then either the chevron or ONE control in `actions` (a single element; a fragment of several is
cut to the first and logged). A row with `actions` has no chevron. Swipe (`swipe`) actions are hidden and do not count.
A title must never wrap one word per line: if a row needs more, move it into the detail screen or a row sheet.
