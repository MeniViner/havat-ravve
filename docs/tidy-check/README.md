# Stage 7 walk: every screen in demo, checked against the placement rules

Independent verifier (wrote no screen), 2026-11-23, branch `tidy/s7-walk` cut from `origin/tidy/placement` at `6b94a19`.
Demo mode only (localStorage `farm-demo`), local dev server, nothing against production, nothing deployed.

## How it was walked

- Every route of `src/app/v2/routes.tsx` and `src/app/v2/screens/guest/index.tsx` that the role can open, with real seed ids,
  as owner, manager, volunteer, vendor, guest and signed-out visitor. Regular day for everything; event day where the screens
  differ (tasks, farm, the event tab, gate, stall, live, vendor home and stall, guest home and tickets); after the event for
  close, debts, summary and the vendor summary.
- Each screen loads fresh at 390×844, demo strip hidden, then a full-length shot (`.k-screen` grown to its content), JPEG.
- On every screen with ⋯ the sheet is opened and shot (`-more`); when it has "מחיקה" or "הסרה" that item is pressed and the
  confirmation sheet is checked for "מחיקה" and "ביטול" (nothing is confirmed). On every screen whose first row is a button
  (not a link), the row is pressed: a row sheet is shot (`-row`), a navigation is recorded.
- Links found on each page were compared with the routes walked; the few left over (`/me/items`, a recurring task's day
  instance, the volunteer's `/event/stall/tabs`, `/terms` for a manager) were walked after (`_walk-extra.json`).
- Checks run in the page: rows with more than one control, text links or loose text beside the back link and more than one
  top-bar control, red count badges outside the bell and ניהול, Latin text and code words (`undefined`, `NaN`), placeholders,
  X buttons on rows and cards, delete buttons outside a sheet, root body height against the design's content height
  (design HTML rendered with its 844 frame), console errors. "One word per line" was checked twice: on titles, tags,
  buttons and meta lines (`_titles.json`), then on every leaf element (`_leaf.json`), using text rects only.
- Every flagged item was looked at in the shot and judged against `RULES.md`, the Q screens and `docs/tidy-progress.md`.
  The result column says "rows as designed", "tile counts as in Q1" and "two icons as in U2" where the design itself has the
  pattern (task rows with check and "לקחת" (T1, Q2), the trip rows (S6), reorder handles (Q21), the recurring switch, the
  guests' select box (M5), the debts' send button (V5), project step rows (P3, P5)).
- Raw data: `<role>/_walk.json` (every finding, ⋯ items, delete confirmation text, row sheet items).

Totals: 365 screens walked (owner 123, manager 122, volunteer 57, vendor 20, guest 27, signed-out 16), 453 shots.
No console errors, no X button on a row or card, no one-word-per-line title (one case in detail-list labels, F3), every ⋯ → מחיקה opened the Q8 confirmation
(23 checks: as owner the task, project, recurring task, shopping item, place, event, product, stall account, message, two
people, visit and donation; as manager the same minus project, message and people, which a manager's ⋯ does not offer; as
volunteer the shopping item), and three row-sheet removals (vendor from an event, helper from a stall, a file) open it too.

Helper (עוזרת בדוכן) was not walked as a role; its one screen (D11) is in Task A.

## Walk, per role

### Owner (בעלים · בני): 123 screens

| # | screen | route (day) | shots | result |
|---|---|---|---|---|
| 01 | משימות | `/tasks` | [page](owner/01-tasks.jpg) | rows as designed |
| 02 | משימות | `/tasks?view=time` | [page](owner/02-tasks-view-time.jpg) | rows as designed |
| 03 | משימות | `/tasks?view=mine` | [page](owner/03-tasks-view-mine.jpg) | ok |
| 04 | משימות | `/tasks?view=free` | [page](owner/04-tasks-view-free.jpg) | rows as designed |
| 05 | היסטוריה | `/tasks/history` | [page](owner/05-tasks-history.jpg) [⋯](owner/05-tasks-history-more.jpg) | ok |
| 06 | לסדר את ארגז הכלים במכולה | `/tasks/demo-t-toolbox` | [page](owner/06-tasks-t-toolbox.jpg) | ok |
| 07 | להכין את שולחנות הדוכן | `/tasks/demo-t-tables` | [page](owner/07-tasks-t-tables.jpg) | ok |
| 08 | לתקן את הברז ליד החממה | `/tasks/demo-t-tap` | [page](owner/08-tasks-t-tap.jpg) | ok |
| 09 | על מי המשימה | `/tasks/demo-t-tap/assign` | [page](owner/09-tasks-t-tap-assign.jpg) | ok |
| 10 | בוצע, עם צילום | `/tasks/demo-t-toolbox/done` | [page](owner/10-tasks-t-toolbox-done.jpg) | ok |
| 11 | עריכה | `/tasks/demo-t-toolbox/edit` | [page](owner/11-tasks-t-toolbox-edit.jpg) [⋯](owner/11-tasks-t-toolbox-edit-more.jpg) [row](owner/11-tasks-t-toolbox-edit-row.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 12 | הוספה | `/new` | [page](owner/12-new.jpg) | ok |
| 13 | הוספה | `/new?kind=shopping` | [page](owner/13-new-kind-shopping.jpg) | ok |
| 14 | סגירה חמישי, 19 בנובמבר 1 משימה סגרת היו | `/day` | [page](owner/14-day.jpg) | ok |
| 15 | פרויקטים | `/projects` | [page](owner/15-projects.jpg) | ok |
| 16 | פרויקט חדש | `/projects/new` | [page](owner/16-projects-new.jpg) | rows as designed |
| 17 | הכנות לפסטיבל הסתיו | `/projects/demo-p-festival` | [page](owner/17-projects-p-festival.jpg) | rows as designed |
| 18 | עריכת פרויקט | `/projects/demo-p-festival/edit` | [page](owner/18-projects-p-festival-edit.jpg) [⋯](owner/18-projects-p-festival-edit-more.jpg) | rows as designed · ⋯ → מחיקה → Q8 ok |
| 19 | לסגור אישור משטרה | `/projects/demo-p-festival/steps/demo-ps-police` | [page](owner/19-projects-p-festival-steps-ps-police.jpg) | ok |
| 20 | משימות חוזרות | `/manage/recurring` | [page](owner/20-manage-recurring.jpg) | rows as designed |
| 21 | הוספה | `/manage/recurring/new` | [page](owner/21-manage-recurring-new.jpg) | ok |
| 22 | עריכה | `/manage/recurring/demo-tpl-pots` | [page](owner/22-manage-recurring-tpl-pots.jpg) [⋯](owner/22-manage-recurring-tpl-pots-more.jpg) [row](owner/22-manage-recurring-tpl-pots-row.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 23 | קניות | `/shopping` | [page](owner/23-shopping.jpg) | ok |
| 24 | קניות | `/shopping?list=wish` | [page](owner/24-shopping-list-wish.jpg) | ok |
| 25 | קניות | `/shopping?list=online` | [page](owner/25-shopping-list-online.jpg) | ok |
| 26 | קניות | `/shopping?list=building` | [page](owner/26-shopping-list-building.jpg) | ok |
| 27 | חלב 3% דחוף | `/shopping/demo-s-milk` | [page](owner/27-shopping-s-milk.jpg) | ok |
| 28 | עריכה | `/shopping/demo-s-milk/edit` | [page](owner/28-shopping-s-milk-edit.jpg) [⋯](owner/28-shopping-s-milk-edit-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 29 | קניות | `/shopping/trip` (eventDay) → /shopping | [page](owner/29-shopping-trip.eventDay.jpg) | ok |
| 30 | קניות | `/shopping/trip/done` (afterEvent) → /shopping | [page](owner/30-shopping-trip-done.afterEvent.jpg) | ok |
| 31 | מה נקנה | `/shopping/history` | [page](owner/31-shopping-history.jpg) | ok |
| 32 | החווה | `/farm` | [page](owner/32-farm.jpg) | FINDING F4; root length: content 760px vs design 703px (F1-Root) |
| 33 | נובמבר 2026 | `/farm/calendar` | [page](owner/33-farm-calendar.jpg) | ok |
| 34 | נובמבר 2026 | `/farm/calendar?view=month` | [page](owner/34-farm-calendar-view-month.jpg) | ok |
| 35 | חמישי, 19 בנובמבר | `/farm/calendar?view=day` | [page](owner/35-farm-calendar-view-day.jpg) | ok |
| 36 | פריט ביומן | `/farm/calendar/new` | [page](owner/36-farm-calendar-new.jpg) | ok |
| 37 | פריט ביומן | `/farm/calendar/demo-c-1/edit` | [page](owner/37-farm-calendar-c-1-edit.jpg) | ok |
| 38 | נוכחות בחווה | `/farm/presence` | [page](owner/38-farm-presence.jpg) | ok |
| 39 | היום בחווה | `/farm/today` | [page](owner/39-farm-today.jpg) | ok |
| 40 | פסטיבל הסתיו | `/farm/events/demo-e-festival` | [page](owner/40-farm-events-e-festival.jpg) | ok |
| 41 | חזרה נש נועה שחר מנהלת · בחווה עכשיו, עד | `/people/demo-u-noa` | [page](owner/41-people-u-noa.jpg) | ok |
| 42 | מקומות בחווה | `/places` | [page](owner/42-places.jpg) [⋯](owner/42-places-more.jpg) | ok |
| 43 | מקומות בחווה | `/places/table` | [page](owner/43-places-table.jpg) | ok |
| 44 | מקומות שם המקום נקודה על המפה לעדכן למקו | `/places/demo-p-greenhouse` | [page](owner/44-places-p-greenhouse.jpg) [⋯](owner/44-places-p-greenhouse-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 45 | התראות | `/notifications` | [page](owner/45-notifications.jpg) | open: text link beside back (M2/C1) |
| 46 | חזרה חיפוש בכל האפליקציה הכל אנשים משימו | `/search` | [page](owner/46-search.jpg) | ok |
| 47 | חזרה עריכת פרטים בג בני גוטמן בעלים · מס | `/me` | [page](owner/47-me.jpg) [row](owner/47-me-row.jpg) | ok |
| 48 | הפרטים שלי | `/me/edit` | [page](owner/48-me-edit.jpg) | FINDING F1; English: Google; logged: account deletion at bottom of edit |
| 49 | תמונת פרופיל | `/me/photo` | [page](owner/49-me-photo.jpg) | English: Google |
| 50 | למקם את התמונה | `/me/photo/crop` | [page](owner/50-me-photo-crop.jpg) | ok |
| 51 | הכרטיסים שלי | `/me/tickets` | [page](owner/51-me-tickets.jpg) | ok |
| 52 | להוסיף למסך הבית | `/install` | [page](owner/52-install.jpg) | English: iPhone, Android, Safari |
| 53 | חזרה הכול נשלח אין פעולות שמחכות לקליטה  | `/offline` | [page](owner/53-offline.jpg) | ok |
| 54 | משימות | `/tasks` (eventDay) | [page](owner/54-tasks.eventDay.jpg) | rows as designed |
| 55 | החווה | `/farm` (eventDay) | [page](owner/55-farm.eventDay.jpg) | FINDING F4 |
| 56 | אירוע | `/event` (eventDay) | [page](owner/56-event.eventDay.jpg) | ok |
| 57 | שער · פסטיבל הסתיו יציאה מהשער QR תקין Q | `/event/gate` (eventDay) | [page](owner/57-event-gate.eventDay.jpg) | ok |
| 58 | מי בכניסה? | `/event/gate/search` (eventDay) | [page](owner/58-event-gate-search.eventDay.jpg) | ok |
| 59 | מי קונה? | `/event/stall` (eventDay) | [page](owner/59-event-stall.eventDay.jpg) | ok |
| 60 | החלפת קונה רל רוני לוי כבר בחשבון: 2 פרי | `/event/stall/demo-tab-roni-fest` (eventDay) | [page](owner/60-event-stall-tab-roni-fest.eventDay.jpg) | ok |
| 61 | חשבונות הדוכן | `/event/stall/tabs` (eventDay) | [page](owner/61-event-stall-tabs.eventDay.jpg) | ok |
| 62 | ניהול | `/manage` | [page](owner/62-manage.jpg) | tile counts as in Q1 |
| 63 | לטיפול · 4 | `/manage/inbox` | [page](owner/63-manage-inbox.jpg) | open: text link beside back (M2/C1) |
| 64 | אירועים | `/manage/events` | [page](owner/64-manage-events.jpg) | ok |
| 65 | אירוע חדש | `/manage/events/new` | [page](owner/65-manage-events-new.jpg) | ok |
| 66 | פסטיבל הסתיו | `/manage/events/demo-e-festival?tab=prep` | [page](owner/66-manage-events-e-festival-tab-prep.jpg) | ok |
| 67 | פסטיבל הסתיו | `/manage/events/demo-e-festival?tab=guests` | [page](owner/67-manage-events-e-festival-tab-guests.jpg) [⋯](owner/67-manage-events-e-festival-tab-guests-more.jpg) | rows as designed |
| 68 | עריכת אירוע | `/manage/events/demo-e-festival/edit` | [page](owner/68-manage-events-e-festival-edit.jpg) [⋯](owner/68-manage-events-e-festival-edit-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 69 | בעלי דוכנים | `/manage/events/demo-e-festival/vendors` | [page](owner/69-manage-events-e-festival-vendors.jpg) [⋯](owner/69-manage-events-e-festival-vendors-more.jpg) [row](owner/69-manage-events-e-festival-vendors-row.jpg) | ok |
| 70 | מוצרי הדוכן | `/manage/events/demo-e-festival/products` | [page](owner/70-manage-events-e-festival-products.jpg) [⋯](owner/70-manage-events-e-festival-products-more.jpg) | rows as designed |
| 71 | מוצר בדוכן | `/manage/events/demo-e-festival/products/new` | [page](owner/71-manage-events-e-festival-products-new.jpg) | ok |
| 72 | מוצר בדוכן | `/manage/events/demo-e-festival/products/demo-pr-lemonade` | [page](owner/72-manage-events-e-festival-products-pr-lemonade.jpg) [⋯](owner/72-manage-events-e-festival-products-pr-lemonade-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 73 | קבצים | `/manage/events/demo-e-festival/files` | [page](owner/73-manage-events-e-festival-files.jpg) [⋯](owner/73-manage-events-e-festival-files-more.jpg) [row](owner/73-manage-events-e-festival-files-row.jpg) | ok |
| 74 | מי עובד באירוע | `/manage/events/demo-e-festival/staffing` | [page](owner/74-manage-events-e-festival-staffing.jpg) | ok |
| 75 | יריד אוקטובר | `/manage/events/demo-e-october?tab=summary` | [page](owner/75-manage-events-e-october-tab-summary.jpg) [⋯](owner/75-manage-events-e-october-tab-summary-more.jpg) | ok |
| 76 | מה נמכר בדוכן | `/manage/events/demo-e-october?tab=summary&part=sold` | [page](owner/76-manage-events-e-october-tab-summary-part-sold.jpg) | ok |
| 77 | כסף | `/manage/events/demo-e-october?tab=summary&part=money` | [page](owner/77-manage-events-e-october-tab-summary-part-money.jpg) | ok |
| 78 | לעומת אירועים קודמים | `/manage/events/demo-e-october?tab=summary&part=compare` | [page](owner/78-manage-events-e-october-tab-summary-part-compare.jpg) | ok |
| 79 | חשבונות הדוכן | `/manage/events/demo-e-october/tabs` | [page](owner/79-manage-events-e-october-tabs.jpg) [⋯](owner/79-manage-events-e-october-tabs-more.jpg) | ok |
| 80 | רוני לוי | `/manage/events/demo-e-october/tabs/demo-tab-roni-oct` | [page](owner/80-manage-events-e-october-tabs-tab-roni-oct.jpg) [⋯](owner/80-manage-events-e-october-tabs-tab-roni-oct-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 81 | בעלי דוכנים · 9 | `/manage/vendors` | [page](owner/81-manage-vendors.jpg) | ok |
| 82 | גבינות משק רז | `/manage/vendors/demo-v-raz` | [page](owner/82-manage-vendors-v-raz.jpg) | ok |
| 83 | גישה לאפליקציה | `/manage/vendors/demo-v-raz/access` | [page](owner/83-manage-vendors-v-raz-access.jpg) [⋯](owner/83-manage-vendors-v-raz-access-more.jpg) | ok |
| 84 | אנשים והודעות | `/manage/people` | [page](owner/84-manage-people.jpg) [⋯](owner/84-manage-people-more.jpg) | ok |
| 85 | אנשים והודעות | `/manage/people?filter=team` | [page](owner/85-manage-people-filter-team.jpg) [⋯](owner/85-manage-people-filter-team-more.jpg) | ok |
| 86 | אנשים והודעות | `/manage/people?tab=messages` | [page](owner/86-manage-people-tab-messages.jpg) | ok |
| 87 | להוסיף מישהו מראש | `/manage/people/invite` | [page](owner/87-manage-people-invite.jpg) | English: Google |
| 88 | הודעות בני · היום 14:10 · כל הצוות מחר מ | `/manage/people/messages/demo-b-1` | [page](owner/88-manage-people-messages-b-1.jpg) [⋯](owner/88-manage-people-messages-b-1-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 89 | אנשים מב מיכל ברק לקוחה 155 · נרשמה באוק | `/manage/people/demo-u-michal` | [page](owner/89-manage-people-u-michal.jpg) [⋯](owner/89-manage-people-u-michal-more.jpg) [row](owner/89-manage-people-u-michal-row.jpg) | FINDING F3 · ⋯ → מחיקה → Q8 ok |
| 90 | אנשים יפ יואב פרץ מתנדב 9 · נרשם באוקטוב | `/manage/people/demo-u-yoav` | [page](owner/90-manage-people-u-yoav.jpg) [⋯](owner/90-manage-people-u-yoav-more.jpg) [row](owner/90-manage-people-u-yoav-row.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 91 | הודעה חדשה | `/manage/broadcasts/new` | [page](owner/91-manage-broadcasts-new.jpg) | ok |
| 92 | דוחות | `/manage/reports` | [page](owner/92-manage-reports.jpg) [⋯](owner/92-manage-reports-more.jpg) | ok |
| 93 | אנשים ונרשמים | `/manage/reports/people` | [page](owner/93-manage-reports-people.jpg) | ok |
| 94 | אירועים | `/manage/reports/events` | [page](owner/94-manage-reports-events.jpg) | ok |
| 95 | דוחות | `/manage/reports/tasks` | [page](owner/95-manage-reports-tasks.jpg) [⋯](owner/95-manage-reports-tasks-more.jpg) | ok |
| 96 | ביקורים | `/manage/visits` | [page](owner/96-manage-visits.jpg) [⋯](owner/96-manage-visits-more.jpg) | ok |
| 97 | משפחת כהן | `/manage/visits/demo-vi-cohen` | [page](owner/97-manage-visits-vi-cohen.jpg) [⋯](owner/97-manage-visits-vi-cohen-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 98 | תרומות | `/manage/donations` | [page](owner/98-manage-donations.jpg) [⋯](owner/98-manage-donations-more.jpg) | ok |
| 99 | תרומות · החודש | `/manage/donations/table` | [page](owner/99-manage-donations-table.jpg) | ok |
| 100 | 180 ₪ · מיכל ברק | `/manage/donations/demo-d-michal` | [page](owner/100-manage-donations-d-michal.jpg) [⋯](owner/100-manage-donations-d-michal-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 101 | הגדרות | `/manage/settings` | [page](owner/101-manage-settings.jpg) [row](owner/101-manage-settings-row.jpg) | English: PayBox |
| 102 | הודעות מוכנות | `/manage/settings/messages` | [page](owner/102-manage-settings-messages.jpg) | English: https://havat-ravve.web.app/app/me |
| 103 | שאלות הרשמה | `/manage/settings/questions` | [page](owner/103-manage-settings-questions.jpg) | rows as designed; English: Google |
| 104 | איך משלמים | `/manage/settings/payments` | [page](owner/104-manage-settings-payments.jpg) | English: PayBox |
| 105 | סכומי תרומה | `/manage/settings/donation-amounts` | [page](owner/105-manage-settings-donation-amounts.jpg) | rows as designed |
| 106 | סוגי ביקור | `/manage/settings/visit-types` | [page](owner/106-manage-settings-visit-types.jpg) | rows as designed |
| 107 | פרטי קשר לחווה | `/manage/settings/contact` | [page](owner/107-manage-settings-contact.jpg) | ok |
| 108 | סוגי ביקור ושאלות הרשמה | `/manage/settings/guests` | [page](owner/108-manage-settings-guests.jpg) | ok |
| 109 | מנהלים ובעלים | `/manage/settings/managers` | [page](owner/109-manage-settings-managers.jpg) | ok |
| 110 | יומן אינסטינקט | `/manage/instinct` | [page](owner/110-manage-instinct.jpg) [⋯](owner/110-manage-instinct-more.jpg) | ok |
| 111 | כל הפעילות | `/manage/activity` | [page](owner/111-manage-activity.jpg) [⋯](owner/111-manage-activity-more.jpg) | ok |
| 112 | ניהול | `/manage` (eventDay) | [page](owner/112-manage.eventDay.jpg) | tile counts as in Q1 |
| 113 | פסטיבל הסתיו | `/manage/events/demo-e-festival?tab=day` (eventDay) | [page](owner/113-manage-events-e-festival-tab-day.eventDay.jpg) | ok |
| 114 | פסטיבל הסתיו חי · 17:20 212 נכנסו מתוך 6 | `/manage/events/demo-e-festival/live` (eventDay) | [page](owner/114-manage-events-e-festival-live.eventDay.jpg) | ok |
| 115 | סריקות · 217 | `/manage/events/demo-e-festival/live/scans` (eventDay) | [page](owner/115-manage-events-e-festival-live-scans.eventDay.jpg) [⋯](owner/115-manage-events-e-festival-live-scans.eventDay-more.jpg) | ok |
| 116 | יוסי מזרחי | `/manage/events/demo-e-festival/live/scans/demo-sc-yossi` (eventDay) | [page](owner/116-manage-events-e-festival-live-scans-sc-yossi.eventDay.jpg) | ok |
| 117 | עוד לא הגיעו | `/manage/events/demo-e-festival/live/waiting` (eventDay) | [page](owner/117-manage-events-e-festival-live-waiting.eventDay.jpg) | ok |
| 118 | הדוכנים היום | `/manage/events/demo-e-festival/vendors/today` (eventDay) | [page](owner/118-manage-events-e-festival-vendors-today.eventDay.jpg) | ok |
| 119 | סגירת האירוע | `/manage/events/demo-e-festival/close` (afterEvent) | [page](owner/119-manage-events-e-festival-close.afterEvent.jpg) | ok |
| 120 | תזכורות חוב · 4 | `/manage/events/demo-e-october/debts` (afterEvent) | [page](owner/120-manage-events-e-october-debts.afterEvent.jpg) | rows as designed |
| 121 | פסטיבל הסתיו | `/manage/events/demo-e-festival?tab=summary` (afterEvent) | [page](owner/121-manage-events-e-festival-tab-summary.afterEvent.jpg) [⋯](owner/121-manage-events-e-festival-tab-summary.afterEvent-more.jpg) | ok |
| 122 | מה יש לי בחווה | `/me/items` | [page](owner/122-me-items.jpg) | ok |
| 123 | להשקות את שורת העציצים | `/tasks/demo-tpl-pots_2026-11-19` | [page](owner/123-tasks-tpl-pots_2026-11-19.jpg) | ok |

### Manager (מנהלת · נועה): 122 screens

| # | screen | route (day) | shots | result |
|---|---|---|---|---|
| 01 | משימות | `/tasks` | [page](manager/01-tasks.jpg) | root length: content 1400px vs design 703px (T1-Root) |
| 02 | משימות | `/tasks?view=time` | [page](manager/02-tasks-view-time.jpg) | ok |
| 03 | משימות | `/tasks?view=mine` | [page](manager/03-tasks-view-mine.jpg) | ok |
| 04 | משימות | `/tasks?view=free` | [page](manager/04-tasks-view-free.jpg) | ok |
| 05 | היסטוריה | `/tasks/history` | [page](manager/05-tasks-history.jpg) [⋯](manager/05-tasks-history-more.jpg) | ok |
| 06 | לסדר את ארגז הכלים במכולה | `/tasks/demo-t-toolbox` | [page](manager/06-tasks-t-toolbox.jpg) | ok |
| 07 | להכין את שולחנות הדוכן | `/tasks/demo-t-tables` | [page](manager/07-tasks-t-tables.jpg) | ok |
| 08 | לתקן את הברז ליד החממה | `/tasks/demo-t-tap` | [page](manager/08-tasks-t-tap.jpg) | ok |
| 09 | על מי המשימה | `/tasks/demo-t-tap/assign` | [page](manager/09-tasks-t-tap-assign.jpg) | ok |
| 10 | בוצע, עם צילום | `/tasks/demo-t-toolbox/done` | [page](manager/10-tasks-t-toolbox-done.jpg) | ok |
| 11 | עריכה | `/tasks/demo-t-toolbox/edit` | [page](manager/11-tasks-t-toolbox-edit.jpg) [⋯](manager/11-tasks-t-toolbox-edit-more.jpg) [row](manager/11-tasks-t-toolbox-edit-row.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 12 | הוספה | `/new` | [page](manager/12-new.jpg) | ok |
| 13 | הוספה | `/new?kind=shopping` | [page](manager/13-new-kind-shopping.jpg) | ok |
| 14 | סגירה חמישי, 19 בנובמבר 4 משימות סגרת הי | `/day` | [page](manager/14-day.jpg) | ok |
| 15 | פרויקטים | `/projects` | [page](manager/15-projects.jpg) | ok |
| 16 | פרויקט חדש | `/projects/new` | [page](manager/16-projects-new.jpg) | rows as designed |
| 17 | הכנות לפסטיבל הסתיו | `/projects/demo-p-festival` | [page](manager/17-projects-p-festival.jpg) | rows as designed |
| 18 | עריכת פרויקט | `/projects/demo-p-festival/edit` | [page](manager/18-projects-p-festival-edit.jpg) | rows as designed |
| 19 | לסגור אישור משטרה | `/projects/demo-p-festival/steps/demo-ps-police` | [page](manager/19-projects-p-festival-steps-ps-police.jpg) | ok |
| 20 | משימות חוזרות | `/manage/recurring` | [page](manager/20-manage-recurring.jpg) | rows as designed |
| 21 | הוספה | `/manage/recurring/new` | [page](manager/21-manage-recurring-new.jpg) | ok |
| 22 | עריכה | `/manage/recurring/demo-tpl-pots` | [page](manager/22-manage-recurring-tpl-pots.jpg) [⋯](manager/22-manage-recurring-tpl-pots-more.jpg) [row](manager/22-manage-recurring-tpl-pots-row.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 23 | קניות | `/shopping` | [page](manager/23-shopping.jpg) | ok |
| 24 | קניות | `/shopping?list=wish` | [page](manager/24-shopping-list-wish.jpg) | ok |
| 25 | קניות | `/shopping?list=online` | [page](manager/25-shopping-list-online.jpg) | ok |
| 26 | קניות | `/shopping?list=building` | [page](manager/26-shopping-list-building.jpg) | ok |
| 27 | חלב 3% דחוף | `/shopping/demo-s-milk` | [page](manager/27-shopping-s-milk.jpg) | ok |
| 28 | עריכה | `/shopping/demo-s-milk/edit` | [page](manager/28-shopping-s-milk-edit.jpg) [⋯](manager/28-shopping-s-milk-edit-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 29 | קניות | `/shopping/trip` (eventDay) → /shopping | [page](manager/29-shopping-trip.eventDay.jpg) | ok |
| 30 | קניות | `/shopping/trip/done` (afterEvent) → /shopping | [page](manager/30-shopping-trip-done.afterEvent.jpg) | ok |
| 31 | מה נקנה | `/shopping/history` | [page](manager/31-shopping-history.jpg) | ok |
| 32 | החווה | `/farm` | [page](manager/32-farm.jpg) | FINDING F4; root length: content 760px vs design 703px (F1-Root) |
| 33 | נובמבר 2026 | `/farm/calendar` | [page](manager/33-farm-calendar.jpg) | ok |
| 34 | נובמבר 2026 | `/farm/calendar?view=month` | [page](manager/34-farm-calendar-view-month.jpg) | ok |
| 35 | חמישי, 19 בנובמבר | `/farm/calendar?view=day` | [page](manager/35-farm-calendar-view-day.jpg) | ok |
| 36 | פריט ביומן | `/farm/calendar/new` | [page](manager/36-farm-calendar-new.jpg) | ok |
| 37 | פריט ביומן | `/farm/calendar/demo-c-1/edit` | [page](manager/37-farm-calendar-c-1-edit.jpg) | ok |
| 38 | נוכחות בחווה | `/farm/presence` | [page](manager/38-farm-presence.jpg) | ok |
| 39 | היום בחווה | `/farm/today` | [page](manager/39-farm-today.jpg) | ok |
| 40 | פסטיבל הסתיו | `/farm/events/demo-e-festival` | [page](manager/40-farm-events-e-festival.jpg) | ok |
| 41 | חזרה נש נועה שחר מנהלת · בחווה עכשיו, עד | `/people/demo-u-noa` | [page](manager/41-people-u-noa.jpg) | ok |
| 42 | מקומות בחווה | `/places` | [page](manager/42-places.jpg) [⋯](manager/42-places-more.jpg) | ok |
| 43 | מקומות בחווה | `/places/table` | [page](manager/43-places-table.jpg) | ok |
| 44 | מקומות שם המקום נקודה על המפה לעדכן למקו | `/places/demo-p-greenhouse` | [page](manager/44-places-p-greenhouse.jpg) [⋯](manager/44-places-p-greenhouse-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 45 | התראות | `/notifications` | [page](manager/45-notifications.jpg) | open: text link beside back (M2/C1) |
| 46 | חזרה חיפוש בכל האפליקציה הכל אנשים משימו | `/search` | [page](manager/46-search.jpg) | ok |
| 47 | חזרה עריכת פרטים נש נועה שחר מנהל · מספר | `/me` | [page](manager/47-me.jpg) [row](manager/47-me-row.jpg) | ok |
| 48 | הפרטים שלי | `/me/edit` | [page](manager/48-me-edit.jpg) | FINDING F1; English: Google; logged: account deletion at bottom of edit |
| 49 | תמונת פרופיל | `/me/photo` | [page](manager/49-me-photo.jpg) | English: Google |
| 50 | למקם את התמונה | `/me/photo/crop` | [page](manager/50-me-photo-crop.jpg) | ok |
| 51 | הכרטיסים שלי | `/me/tickets` | [page](manager/51-me-tickets.jpg) | ok |
| 52 | להוסיף למסך הבית | `/install` | [page](manager/52-install.jpg) | English: iPhone, Android, Safari |
| 53 | חזרה הכול נשלח אין פעולות שמחכות לקליטה  | `/offline` | [page](manager/53-offline.jpg) | ok |
| 54 | משימות | `/tasks` (eventDay) | [page](manager/54-tasks.eventDay.jpg) | ok |
| 55 | החווה | `/farm` (eventDay) | [page](manager/55-farm.eventDay.jpg) | FINDING F4 |
| 56 | אירוע | `/event` (eventDay) | [page](manager/56-event.eventDay.jpg) | ok |
| 57 | שער · פסטיבל הסתיו יציאה מהשער QR תקין Q | `/event/gate` (eventDay) | [page](manager/57-event-gate.eventDay.jpg) | ok |
| 58 | מי בכניסה? | `/event/gate/search` (eventDay) | [page](manager/58-event-gate-search.eventDay.jpg) | ok |
| 59 | מי קונה? | `/event/stall` (eventDay) | [page](manager/59-event-stall.eventDay.jpg) | ok |
| 60 | החלפת קונה רל רוני לוי כבר בחשבון: 2 פרי | `/event/stall/demo-tab-roni-fest` (eventDay) | [page](manager/60-event-stall-tab-roni-fest.eventDay.jpg) | ok |
| 61 | חשבונות הדוכן | `/event/stall/tabs` (eventDay) | [page](manager/61-event-stall-tabs.eventDay.jpg) | ok |
| 62 | ניהול | `/manage` | [page](manager/62-manage.jpg) | tile counts as in Q1 |
| 63 | לטיפול · 4 | `/manage/inbox` | [page](manager/63-manage-inbox.jpg) | open: text link beside back (M2/C1) |
| 64 | אירועים | `/manage/events` | [page](manager/64-manage-events.jpg) | ok |
| 65 | אירוע חדש | `/manage/events/new` | [page](manager/65-manage-events-new.jpg) | ok |
| 66 | פסטיבל הסתיו | `/manage/events/demo-e-festival?tab=prep` | [page](manager/66-manage-events-e-festival-tab-prep.jpg) | ok |
| 67 | פסטיבל הסתיו | `/manage/events/demo-e-festival?tab=guests` | [page](manager/67-manage-events-e-festival-tab-guests.jpg) [⋯](manager/67-manage-events-e-festival-tab-guests-more.jpg) | rows as designed |
| 68 | עריכת אירוע | `/manage/events/demo-e-festival/edit` | [page](manager/68-manage-events-e-festival-edit.jpg) [⋯](manager/68-manage-events-e-festival-edit-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 69 | בעלי דוכנים | `/manage/events/demo-e-festival/vendors` | [page](manager/69-manage-events-e-festival-vendors.jpg) [⋯](manager/69-manage-events-e-festival-vendors-more.jpg) [row](manager/69-manage-events-e-festival-vendors-row.jpg) | ok |
| 70 | מוצרי הדוכן | `/manage/events/demo-e-festival/products` | [page](manager/70-manage-events-e-festival-products.jpg) [⋯](manager/70-manage-events-e-festival-products-more.jpg) | rows as designed |
| 71 | מוצר בדוכן | `/manage/events/demo-e-festival/products/new` | [page](manager/71-manage-events-e-festival-products-new.jpg) | ok |
| 72 | מוצר בדוכן | `/manage/events/demo-e-festival/products/demo-pr-lemonade` | [page](manager/72-manage-events-e-festival-products-pr-lemonade.jpg) [⋯](manager/72-manage-events-e-festival-products-pr-lemonade-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 73 | קבצים | `/manage/events/demo-e-festival/files` | [page](manager/73-manage-events-e-festival-files.jpg) [⋯](manager/73-manage-events-e-festival-files-more.jpg) [row](manager/73-manage-events-e-festival-files-row.jpg) | ok |
| 74 | מי עובד באירוע | `/manage/events/demo-e-festival/staffing` | [page](manager/74-manage-events-e-festival-staffing.jpg) | ok |
| 75 | יריד אוקטובר | `/manage/events/demo-e-october?tab=summary` | [page](manager/75-manage-events-e-october-tab-summary.jpg) [⋯](manager/75-manage-events-e-october-tab-summary-more.jpg) | ok |
| 76 | מה נמכר בדוכן | `/manage/events/demo-e-october?tab=summary&part=sold` | [page](manager/76-manage-events-e-october-tab-summary-part-sold.jpg) | ok |
| 77 | כסף | `/manage/events/demo-e-october?tab=summary&part=money` | [page](manager/77-manage-events-e-october-tab-summary-part-money.jpg) | ok |
| 78 | לעומת אירועים קודמים | `/manage/events/demo-e-october?tab=summary&part=compare` | [page](manager/78-manage-events-e-october-tab-summary-part-compare.jpg) | ok |
| 79 | חשבונות הדוכן | `/manage/events/demo-e-october/tabs` | [page](manager/79-manage-events-e-october-tabs.jpg) [⋯](manager/79-manage-events-e-october-tabs-more.jpg) | ok |
| 80 | רוני לוי | `/manage/events/demo-e-october/tabs/demo-tab-roni-oct` | [page](manager/80-manage-events-e-october-tabs-tab-roni-oct.jpg) [⋯](manager/80-manage-events-e-october-tabs-tab-roni-oct-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 81 | בעלי דוכנים · 9 | `/manage/vendors` | [page](manager/81-manage-vendors.jpg) | ok |
| 82 | גבינות משק רז | `/manage/vendors/demo-v-raz` | [page](manager/82-manage-vendors-v-raz.jpg) | ok |
| 83 | גישה לאפליקציה | `/manage/vendors/demo-v-raz/access` | [page](manager/83-manage-vendors-v-raz-access.jpg) [⋯](manager/83-manage-vendors-v-raz-access-more.jpg) | ok |
| 84 | אנשים והודעות | `/manage/people` | [page](manager/84-manage-people.jpg) [⋯](manager/84-manage-people-more.jpg) | ok |
| 85 | אנשים והודעות | `/manage/people?filter=team` | [page](manager/85-manage-people-filter-team.jpg) [⋯](manager/85-manage-people-filter-team-more.jpg) | ok |
| 86 | אנשים והודעות | `/manage/people?tab=messages` | [page](manager/86-manage-people-tab-messages.jpg) | ok |
| 87 | להוסיף מישהו מראש | `/manage/people/invite` | [page](manager/87-manage-people-invite.jpg) | English: Google |
| 88 | הודעות בני · היום 14:10 · כל הצוות מחר מ | `/manage/people/messages/demo-b-1` | [page](manager/88-manage-people-messages-b-1.jpg) | ok |
| 89 | אנשים מב מיכל ברק לקוחה 155 · נרשמה באוק | `/manage/people/demo-u-michal` | [page](manager/89-manage-people-u-michal.jpg) [⋯](manager/89-manage-people-u-michal-more.jpg) [row](manager/89-manage-people-u-michal-row.jpg) | FINDING F3 |
| 90 | אנשים יפ יואב פרץ מתנדב 9 · נרשם באוקטוב | `/manage/people/demo-u-yoav` | [page](manager/90-manage-people-u-yoav.jpg) [row](manager/90-manage-people-u-yoav-row.jpg) | ok |
| 91 | הודעה חדשה | `/manage/broadcasts/new` | [page](manager/91-manage-broadcasts-new.jpg) | ok |
| 92 | דוחות | `/manage/reports` | [page](manager/92-manage-reports.jpg) [⋯](manager/92-manage-reports-more.jpg) | ok |
| 93 | אנשים ונרשמים | `/manage/reports/people` | [page](manager/93-manage-reports-people.jpg) | ok |
| 94 | אירועים | `/manage/reports/events` | [page](manager/94-manage-reports-events.jpg) | ok |
| 95 | דוחות | `/manage/reports/tasks` | [page](manager/95-manage-reports-tasks.jpg) [⋯](manager/95-manage-reports-tasks-more.jpg) | ok |
| 96 | ביקורים | `/manage/visits` | [page](manager/96-manage-visits.jpg) [⋯](manager/96-manage-visits-more.jpg) | ok |
| 97 | משפחת כהן | `/manage/visits/demo-vi-cohen` | [page](manager/97-manage-visits-vi-cohen.jpg) [⋯](manager/97-manage-visits-vi-cohen-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 98 | תרומות | `/manage/donations` | [page](manager/98-manage-donations.jpg) [⋯](manager/98-manage-donations-more.jpg) | ok |
| 99 | תרומות · החודש | `/manage/donations/table` | [page](manager/99-manage-donations-table.jpg) | ok |
| 100 | 180 ₪ · מיכל ברק | `/manage/donations/demo-d-michal` | [page](manager/100-manage-donations-d-michal.jpg) [⋯](manager/100-manage-donations-d-michal-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 101 | הגדרות | `/manage/settings` | [page](manager/101-manage-settings.jpg) | English: PayBox |
| 102 | הודעות מוכנות | `/manage/settings/messages` | [page](manager/102-manage-settings-messages.jpg) | English: https://havat-ravve.web.app/app/me |
| 103 | שאלות הרשמה | `/manage/settings/questions` | [page](manager/103-manage-settings-questions.jpg) | rows as designed; English: Google |
| 104 | איך משלמים | `/manage/settings/payments` | [page](manager/104-manage-settings-payments.jpg) | English: PayBox |
| 105 | סכומי תרומה | `/manage/settings/donation-amounts` | [page](manager/105-manage-settings-donation-amounts.jpg) | rows as designed |
| 106 | סוגי ביקור | `/manage/settings/visit-types` | [page](manager/106-manage-settings-visit-types.jpg) | rows as designed |
| 107 | פרטי קשר לחווה | `/manage/settings/contact` | [page](manager/107-manage-settings-contact.jpg) | ok |
| 108 | סוגי ביקור ושאלות הרשמה | `/manage/settings/guests` | [page](manager/108-manage-settings-guests.jpg) | ok |
| 109 | כל הפעילות | `/manage/activity` | [page](manager/109-manage-activity.jpg) [⋯](manager/109-manage-activity-more.jpg) | ok |
| 110 | ניהול | `/manage` (eventDay) | [page](manager/110-manage.eventDay.jpg) | tile counts as in Q1 |
| 111 | פסטיבל הסתיו | `/manage/events/demo-e-festival?tab=day` (eventDay) | [page](manager/111-manage-events-e-festival-tab-day.eventDay.jpg) | ok |
| 112 | פסטיבל הסתיו חי · 17:20 212 נכנסו מתוך 6 | `/manage/events/demo-e-festival/live` (eventDay) | [page](manager/112-manage-events-e-festival-live.eventDay.jpg) | ok |
| 113 | סריקות · 217 | `/manage/events/demo-e-festival/live/scans` (eventDay) | [page](manager/113-manage-events-e-festival-live-scans.eventDay.jpg) [⋯](manager/113-manage-events-e-festival-live-scans.eventDay-more.jpg) | ok |
| 114 | יוסי מזרחי | `/manage/events/demo-e-festival/live/scans/demo-sc-yossi` (eventDay) | [page](manager/114-manage-events-e-festival-live-scans-sc-yossi.eventDay.jpg) | ok |
| 115 | עוד לא הגיעו | `/manage/events/demo-e-festival/live/waiting` (eventDay) | [page](manager/115-manage-events-e-festival-live-waiting.eventDay.jpg) | ok |
| 116 | הדוכנים היום | `/manage/events/demo-e-festival/vendors/today` (eventDay) | [page](manager/116-manage-events-e-festival-vendors-today.eventDay.jpg) | ok |
| 117 | סגירת האירוע | `/manage/events/demo-e-festival/close` (afterEvent) | [page](manager/117-manage-events-e-festival-close.afterEvent.jpg) | ok |
| 118 | תזכורות חוב · 4 | `/manage/events/demo-e-october/debts` (afterEvent) | [page](manager/118-manage-events-e-october-debts.afterEvent.jpg) | rows as designed |
| 119 | פסטיבל הסתיו | `/manage/events/demo-e-festival?tab=summary` (afterEvent) | [page](manager/119-manage-events-e-festival-tab-summary.afterEvent.jpg) [⋯](manager/119-manage-events-e-festival-tab-summary.afterEvent-more.jpg) | ok |
| 120 | מה יש לי בחווה | `/me/items` | [page](manager/120-me-items.jpg) | ok |
| 121 | להשקות את שורת העציצים | `/tasks/demo-tpl-pots_2026-11-19` | [page](manager/121-tasks-tpl-pots_2026-11-19.jpg) | ok |
| 122 | תנאי שימוש ופרטיות | `/terms` | [page](manager/122-terms.jpg) | English: havat-ravve.web.app., Google, Firebase:, Cloudflare:, Brevo:, HTTPS |

### Volunteer (מתנדב · יואב): 57 screens

| # | screen | route (day) | shots | result |
|---|---|---|---|---|
| 01 | משימות | `/tasks` | [page](staff/01-tasks.jpg) | root length: content 1113px vs design 703px (T1-Root) |
| 02 | משימות | `/tasks?view=time` | [page](staff/02-tasks-view-time.jpg) | ok |
| 03 | משימות | `/tasks?view=mine` | [page](staff/03-tasks-view-mine.jpg) | ok |
| 04 | משימות | `/tasks?view=free` | [page](staff/04-tasks-view-free.jpg) | ok |
| 05 | היסטוריה | `/tasks/history` | [page](staff/05-tasks-history.jpg) [⋯](staff/05-tasks-history-more.jpg) | ok |
| 06 | לסדר את ארגז הכלים במכולה | `/tasks/demo-t-toolbox` | [page](staff/06-tasks-t-toolbox.jpg) | ok |
| 07 | להכין את שולחנות הדוכן | `/tasks/demo-t-tables` | [page](staff/07-tasks-t-tables.jpg) | ok |
| 08 | לתקן את הברז ליד החממה | `/tasks/demo-t-tap` | [page](staff/08-tasks-t-tap.jpg) | ok |
| 09 | על מי המשימה | `/tasks/demo-t-tap/assign` | [page](staff/09-tasks-t-tap-assign.jpg) | ok |
| 10 | בוצע, עם צילום | `/tasks/demo-t-toolbox/done` | [page](staff/10-tasks-t-toolbox-done.jpg) | ok |
| 11 | לסדר את ארגז הכלים במכולה | `/tasks/demo-t-toolbox/edit` → /tasks/demo-t-toolbox | [page](staff/11-tasks-t-toolbox-edit.jpg) | ok |
| 12 | הוספה | `/new` | [page](staff/12-new.jpg) | ok |
| 13 | הוספה | `/new?kind=shopping` | [page](staff/13-new-kind-shopping.jpg) | ok |
| 14 | סגירה חמישי, 19 בנובמבר 4 משימות סגרת הי | `/day` | [page](staff/14-day.jpg) | ok |
| 15 | קניות | `/shopping` | [page](staff/15-shopping.jpg) | ok |
| 16 | קניות | `/shopping?list=wish` | [page](staff/16-shopping-list-wish.jpg) | ok |
| 17 | קניות | `/shopping?list=online` | [page](staff/17-shopping-list-online.jpg) | ok |
| 18 | קניות | `/shopping?list=building` | [page](staff/18-shopping-list-building.jpg) | ok |
| 19 | חלב 3% דחוף | `/shopping/demo-s-milk` | [page](staff/19-shopping-s-milk.jpg) | ok |
| 20 | עריכה | `/shopping/demo-s-milk/edit` | [page](staff/20-shopping-s-milk-edit.jpg) [⋯](staff/20-shopping-s-milk-edit-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 21 | נשארו 3 | `/shopping/trip` (eventDay) | [page](staff/21-shopping-trip.eventDay.jpg) | rows as designed |
| 22 | הקנייה בסופר נסגרה | `/shopping/trip/done` (afterEvent) | [page](staff/22-shopping-trip-done.afterEvent.jpg) | ok |
| 23 | מה נקנה | `/shopping/history` | [page](staff/23-shopping-history.jpg) | ok |
| 24 | החווה | `/farm` | [page](staff/24-farm.jpg) | FINDING F4; root length: content 760px vs design 703px (F1-Root) |
| 25 | נובמבר 2026 | `/farm/calendar` | [page](staff/25-farm-calendar.jpg) | ok |
| 26 | נובמבר 2026 | `/farm/calendar?view=month` | [page](staff/26-farm-calendar-view-month.jpg) | ok |
| 27 | חמישי, 19 בנובמבר | `/farm/calendar?view=day` | [page](staff/27-farm-calendar-view-day.jpg) | ok |
| 28 | מתי אני בחווה | `/farm/calendar/new` → /farm/presence | [page](staff/28-farm-calendar-new.jpg) | ok |
| 29 | מתי אני בחווה | `/farm/calendar/demo-c-1/edit` → /farm/presence | [page](staff/29-farm-calendar-c-1-edit.jpg) | ok |
| 30 | מתי אני בחווה | `/farm/presence` | [page](staff/30-farm-presence.jpg) | ok |
| 31 | היום בחווה | `/farm/today` | [page](staff/31-farm-today.jpg) | ok |
| 32 | פסטיבל הסתיו | `/farm/events/demo-e-festival` | [page](staff/32-farm-events-e-festival.jpg) | ok |
| 33 | חזרה נש נועה שחר מנהלת · בחווה עכשיו, עד | `/people/demo-u-noa` | [page](staff/33-people-u-noa.jpg) | ok |
| 34 | מקומות בחווה | `/places` | [page](staff/34-places.jpg) | ok |
| 35 | מקומות בחווה | `/places/table` | [page](staff/35-places-table.jpg) | ok |
| 36 | מקומות שם המקום נקודה על המפה לעדכן למקו | `/places/demo-p-greenhouse` | [page](staff/36-places-p-greenhouse.jpg) | ok |
| 37 | התראות | `/notifications` | [page](staff/37-notifications.jpg) | open: text link beside back (M2/C1) |
| 38 | חזרה חיפוש בכל האפליקציה הכל משימות אירו | `/search` | [page](staff/38-search.jpg) | ok |
| 39 | חזרה עריכת פרטים יפ יואב פרץ מתנדב · מאו | `/me` | [page](staff/39-me.jpg) [row](staff/39-me-row.jpg) | ok |
| 40 | הפרטים שלי | `/me/edit` | [page](staff/40-me-edit.jpg) | FINDING F1; English: Google; logged: account deletion at bottom of edit |
| 41 | תמונת פרופיל | `/me/photo` | [page](staff/41-me-photo.jpg) | English: Google |
| 42 | למקם את התמונה | `/me/photo/crop` | [page](staff/42-me-photo-crop.jpg) | ok |
| 43 | הכרטיסים שלי | `/me/tickets` | [page](staff/43-me-tickets.jpg) | ok |
| 44 | להוסיף למסך הבית | `/install` | [page](staff/44-install.jpg) | English: iPhone, Android, Safari |
| 45 | חזרה הכול נשלח אין פעולות שמחכות לקליטה  | `/offline` | [page](staff/45-offline.jpg) | ok |
| 46 | משימות | `/tasks` (eventDay) | [page](staff/46-tasks.eventDay.jpg) | ok |
| 47 | החווה | `/farm` (eventDay) | [page](staff/47-farm.eventDay.jpg) | FINDING F4 |
| 48 | אירוע | `/event` (eventDay) | [page](staff/48-event.eventDay.jpg) | ok |
| 49 | שער · פסטיבל הסתיו יציאה מהשער QR תקין Q | `/event/gate` (eventDay) | [page](staff/49-event-gate.eventDay.jpg) | ok |
| 50 | מי בכניסה? | `/event/gate/search` (eventDay) | [page](staff/50-event-gate-search.eventDay.jpg) | ok |
| 51 | מי קונה? | `/event/stall` (eventDay) | [page](staff/51-event-stall.eventDay.jpg) | ok |
| 52 | החלפת קונה רל רוני לוי כבר בחשבון: 2 פרי | `/event/stall/demo-tab-roni-fest` (eventDay) | [page](staff/52-event-stall-tab-roni-fest.eventDay.jpg) | ok |
| 53 | משימות | `/manage` → /tasks | [page](staff/53-manage.jpg) | ok |
| 54 | ברוך הבא לצוות | `/welcome` | [page](staff/54-welcome.jpg) | FINDING F2 |
| 55 | חשבונות הדוכן | `/event/stall/tabs` (eventDay) | [page](staff/55-event-stall-tabs.eventDay.jpg) | ok |
| 56 | מה יש לי בחווה | `/me/items` | [page](staff/56-me-items.jpg) | ok |
| 57 | להאכיל את העיזים | `/tasks/demo-tpl-goats_2026-11-19` | [page](staff/57-tasks-tpl-goats_2026-11-19.jpg) | ok |

### Vendor (בעל דוכן · רז): 20 screens

| # | screen | route (day) | shots | result |
|---|---|---|---|---|
| 01 | האירועים | `/vendor` | [page](vendor/01-vendor.jpg) | ok |
| 02 | רז, רוצים אותך בפסטיבל הסתיו | `/vendor/invite/demo-e-festival` | [page](vendor/02-vendor-invite-e-festival.jpg) | ok |
| 03 | מה צריך בדוכן | `/vendor/events/demo-e-festival/needs` | [page](vendor/03-vendor-events-e-festival-needs.jpg) | ok |
| 04 | פסטיבל הסתיו | `/vendor/events/demo-e-festival` | [page](vendor/04-vendor-events-e-festival.jpg) [row](vendor/04-vendor-events-e-festival-row.jpg) | ok |
| 05 | הדוכן שלי | `/vendor/stall` | [page](vendor/05-vendor-stall.jpg) [row](vendor/05-vendor-stall-row.jpg) | ok |
| 06 | לצרף עוזר לדוכן | `/vendor/stall/helpers/new` | [page](vendor/06-vendor-stall-helpers-new.jpg) | English: Google |
| 07 | התראות | `/notifications` | [page](vendor/07-notifications.jpg) | open: text link beside back (M2/C1) |
| 08 | חזרה עריכת פרטים רכ רז כהן בעל דוכן · מא | `/me` | [page](vendor/08-me.jpg) [row](vendor/08-me-row.jpg) | ok |
| 09 | הפרטים שלי | `/me/edit` | [page](vendor/09-me-edit.jpg) | English: Google; logged: account deletion at bottom of edit |
| 10 | תמונת פרופיל | `/me/photo` | [page](vendor/10-me-photo.jpg) | English: Google |
| 11 | להוסיף למסך הבית | `/install` | [page](vendor/11-install.jpg) | English: iPhone, Android, Safari |
| 12 | תנאי שימוש ופרטיות | `/terms` | [page](vendor/12-terms.jpg) | English: havat-ravve.web.app., Google, Firebase:, Cloudflare:, Brevo:, HTTPS |
| 13 | פנייה לחווה | `/contact` | [page](vendor/13-contact.jpg) | ok |
| 14 | מחיקת החשבון | `/delete-account` | [page](vendor/14-delete-account.jpg) | English: Google |
| 15 | האירועים | `/tasks` → /vendor | [page](vendor/15-tasks.jpg) | ok |
| 16 | היום האירוע | `/vendor` (eventDay) | [page](vendor/16-vendor.eventDay.jpg) [row](vendor/16-vendor.eventDay-row.jpg) | ok |
| 17 | הדוכן שלי | `/vendor/stall` (eventDay) | [page](vendor/17-vendor-stall.eventDay.jpg) [row](vendor/17-vendor-stall.eventDay-row.jpg) | ok |
| 18 | פסטיבל הסתיו | `/vendor/events/demo-e-festival` (eventDay) | [page](vendor/18-vendor-events-e-festival.eventDay.jpg) [row](vendor/18-vendor-events-e-festival.eventDay-row.jpg) | ok |
| 19 | האירועים | `/vendor` (afterEvent) | [page](vendor/19-vendor.afterEvent.jpg) | ok |
| 20 | תודה, רז | `/vendor/events/demo-e-festival/summary` (afterEvent) | [page](vendor/20-vendor-events-e-festival-summary.afterEvent.jpg) | ok |

### Guest (אורחת · מיכל): 27 screens

| # | screen | route (day) | shots | result |
|---|---|---|---|---|
| 01 | ליד טנא עומרים חוות רווה הודעה מהחווה ·  | `/` | [page](guest/01-home.jpg) | root length: content 794px vs design 627px (U1-GuestHome) |
| 02 | שבת, 28 בנובמבר · 16:00 עד 21:00 פסטיבל  | `/events/demo-e-festival` | [page](guest/02-events-e-festival.jpg) | two icons as in U2; English: PayBox |
| 03 | הזמנת כרטיסים | `/events/demo-e-festival/order` | [page](guest/03-events-e-festival-order.jpg) | English: PayBox |
| 04 | תיאום ביקור | `/visit` | [page](guest/04-visit.jpg) | ok |
| 05 | תרומה לחווה | `/donate` | [page](guest/05-donate.jpg) | English: PayBox |
| 06 | פנייה לחווה | `/contact` | [page](guest/06-contact.jpg) | ok |
| 07 | תנאי שימוש ופרטיות | `/terms` | [page](guest/07-terms.jpg) | English: havat-ravve.web.app., Google, Firebase:, Cloudflare:, Brevo:, HTTPS |
| 08 | תנאי שימוש ופרטיות | `/privacy` | [page](guest/08-privacy.jpg) | English: havat-ravve.web.app., Google, Firebase:, Cloudflare:, Brevo:, HTTPS |
| 09 | להוסיף למסך הבית | `/install` | [page](guest/09-install.jpg) | English: iPhone, Android, Safari |
| 10 | בית היומן זמין לצוות החווה בית הכרטיסים  | `/calendar` | [page](guest/10-calendar.jpg) | ok |
| 11 | הכרטיסים שלי | `/me` | [page](guest/11-me.jpg) [⋯](guest/11-me-more.jpg) | ok |
| 12 | הכרטיסים שלי פסטיבל הסתיו שבת 28.11 · 16 | `/me/orders/demo-o-19` | [page](guest/12-me-orders-o-19.jpg) [⋯](guest/12-me-orders-o-19-more.jpg) | ok |
| 13 | הכרטיסים שמורים לך | `/me/orders/demo-o-19/pay` | [page](guest/13-me-orders-o-19-pay.jpg) | English: PayBox |
| 14 | אירועים שהיו | `/me/past` | [page](guest/14-me-past.jpg) | ok |
| 15 | מה יש לי בחווה | `/me/items` | [page](guest/15-me-items.jpg) | ok |
| 16 | שישי, 27 בנובמבר | `/me/visits/demo-vi-michal` | [page](guest/16-me-visits-vi-michal.jpg) | ok |
| 17 | תרומה · 180 ₪ | `/me/donations/demo-d-michal` | [page](guest/17-me-donations-d-michal.jpg) | ok |
| 18 | החשבון שלי בדוכן | `/me/stall/demo-tab-michal-unpaid-summer` | [page](guest/18-me-stall-tab-michal-unpaid-summer.jpg) | English: PayBox |
| 19 | עריכת פרטים מב מיכל ברק 054-000-0155 · ט | `/me/account` | [page](guest/19-me-account.jpg) | ok |
| 20 | עריכת פרטים | `/me/edit` | [page](guest/20-me-edit.jpg) | English: Google; logged: account deletion at bottom of edit |
| 21 | הודעות מהחווה | `/me/messages` | [page](guest/21-me-messages.jpg) | ok |
| 22 | מחיקת החשבון | `/delete-account` | [page](guest/22-delete-account.jpg) | English: Google |
| 23 | הכרטיסים שלי | `/login` → /me | [page](guest/23-login.jpg) [⋯](guest/23-login-more.jpg) | ok |
| 24 | ליד טנא עומרים חוות רווה הודעה מהחווה ·  | `/tasks` | [page](guest/24-tasks.jpg) | ok |
| 25 | ליד טנא עומרים חוות רווה הודעה מהחווה ·  | `/` (eventDay) | [page](guest/25-home.eventDay.jpg) | ok |
| 26 | הכרטיסים שלי | `/me` (eventDay) | [page](guest/26-me.eventDay.jpg) [⋯](guest/26-me.eventDay-more.jpg) | ok |
| 27 | שבת, 28 בנובמבר · 16:00 עד 21:00 פסטיבל  | `/events/demo-e-festival` (eventDay) | [page](guest/27-events-e-festival.eventDay.jpg) | two icons as in U2; English: PayBox |

### Signed-out visitor: 16 screens

| # | screen | route (day) | shots | result |
|---|---|---|---|---|
| 01 | ליד טנא עומרים חוות רווה אירועים קרובים  | `/` | [page](anon/01-home.jpg) | root length: content 777px vs design 627px (U1-GuestHome) |
| 02 | שבת, 28 בנובמבר · 16:00 עד 21:00 פסטיבל  | `/events/demo-e-festival` | [page](anon/02-events-e-festival.jpg) | two icons as in U2; English: PayBox |
| 03 | הזמנת כרטיסים | `/events/demo-e-festival/order` | [page](anon/03-events-e-festival-order.jpg) | English: PayBox, Google |
| 04 | תיאום ביקור | `/visit` | [page](anon/04-visit.jpg) | English: Google |
| 05 | תרומה לחווה | `/donate` | [page](anon/05-donate.jpg) | English: PayBox, Google |
| 06 | פנייה לחווה | `/contact` | [page](anon/06-contact.jpg) | English: Google. |
| 07 | תנאי שימוש ופרטיות | `/terms` | [page](anon/07-terms.jpg) | English: havat-ravve.web.app., Google, Firebase:, Cloudflare:, Brevo:, HTTPS |
| 08 | תנאי שימוש ופרטיות | `/privacy` | [page](anon/08-privacy.jpg) | English: havat-ravve.web.app., Google, Firebase:, Cloudflare:, Brevo:, HTTPS |
| 09 | להוסיף למסך הבית | `/install` | [page](anon/09-install.jpg) | English: iPhone, Android, Safari |
| 10 | בית היומן זמין לצוות החווה בית הכרטיסים  | `/calendar` | [page](anon/10-calendar.jpg) | ok |
| 11 | החשבון שלי בחוות רווה | `/login` | [page](anon/11-login.jpg) | English: Google., Google; root length: content 777px vs design 713px (U12-GuestSignIn) |
| 12 | הכרטיסים שלי | `/me` | [page](anon/12-me.jpg) | English: Google. |
| 13 | החשבון שלי בחוות רווה | `/me/account` | [page](anon/13-me-account.jpg) | English: Google., Google |
| 14 | ליד טנא עומרים חוות רווה אירועים קרובים  | `/tasks` | [page](anon/14-tasks.jpg) | ok |
| 15 | ליד טנא עומרים חוות רווה אירועים קרובים  | `/` (eventDay) | [page](anon/15-home.eventDay.jpg) | ok |
| 16 | שבת, 28 בנובמבר · 16:00 עד 21:00 פסטיבל  | `/events/demo-e-festival` (eventDay) | [page](anon/16-events-e-festival.eventDay.jpg) | two icons as in U2; English: PayBox |

## Findings

Ranked: rule breaks first, then smaller ones, then what is already a logged decision and only seen again.

### Rule breaks

| id | where | rule | what |
|---|---|---|---|
| F1 | `/me/edit` (C13), every team member | 7, 12 | "יישוב" and "תאריך לידה" appear twice: once as profile fields ("לא חובה") and again as the registration questions ("יישוב *", the date picker). The second date field shows the browser's English "dd/mm/yyyy". Guests' `/me/edit` (U13 form) is right: each field once, the date filled. See `owner/48-me-edit.jpg`, `staff/40-me-edit.jpg`. |
| F2 | `/welcome` (C9), new team member | 12, approved C9 | The registration questions (יישוב, איך שמעתם עלינו, תאריך לידה) were added under the phone field, and the empty date field reads "dd/mm/yyyy" in English. C9 as approved has name and phone only. `staff/54-welcome.jpg`. |
| F3 | `/manage/people/demo-u-michal` (Q13), owner and manager | 4 (one word per line), 12 | Three rows not in Q13 (יישוב, איך שמעתם עלינו, תאריך לידה). Their labels break one word per line ("איך / שמעתם / עלינו", "תאריך / לידה") and the birth date is raw "1988-05-12" (the tables use dd.mm.yyyy). `owner/89-manage-people-u-michal.jpg`. The only one-word-per-line case in the whole walk. |
| F4 | `/farm` (F1), team | 2 (root closed), root length | A "מקומות בחווה" card is appended under the design's blocks; the body is 760 px against the design's 703. RULES.md (small additions, row "Places link on the Manage root") says places are reached "from the Farm tab card", so this may be the intended entry, but F1 has no such card and no Q screen draws it. Needs Meni's word. `staff/24-farm.jpg`. |

### Smaller

| id | where | rule | what |
|---|---|---|---|
| F5 | many screens | 12 | Latin names on screen (not codes): "PayBox" (settings, payments, guest event, order, pay, donate, stall account), "Google" (sign-in, `/me/edit`, `/me/photo`, invite, sign-up questions, guest pages for a signed-out visitor), "iPhone, Android, Safari" (`/install`), "Firebase, Cloudflare, Brevo, HTTPS, havat-ravve.web.app" (`/terms`, `/privacy`), and the template URL "https://havat-ravve.web.app/app/me" (`/manage/settings/messages`). All were on screen in the approved record too. E-mail addresses are people's data and are left out. |
| F6 | `/manage/settings/questions` (G3) | 4 (meta) | The meta gained "ענו: 2 מתוך 157" and now wraps to two lines on "איך שמעתם עלינו?". Not in G3 or the log. |
| F7 | `/manage/events/demo-e-festival?tab=prep` (M4) | 4 (meta) | "פרטי האירוע" meta gained "פתוח להרשמה ·" and wraps to two lines. |
| F8 | `/manage/events/demo-e-october/tabs/demo-tab-roni-oct` (N12) | 7 | Each line now has its own "17:05 · נועה" meta, and the card still ends with "רשמה נועה, 17:05, 17:40": the same facts twice on one card. |
| F9 | root length (data) | root length | The tasks root is longer than T1 (volunteer 1113 px, manager 1400 px against 703); the guest home is longer than U1 (794 against 627); `/login` for a signed-out visitor 777 against U12's 713. Nothing extra is appended except Q2's two bottom rows and, on guest home, the intro moved to the bottom (logged); the rest is seed data (the unread message card, the "באיחור" group, more tasks). The owner's tasks root fits P6-Full. |

### Seen again, already logged (no action unless Meni decides)

- Text links beside the back link: "מה שטופל" on `/manage/inbox` (M2) and "מה לקבל" on `/notifications` (C1), for every team role and the vendor. Open decision in `docs/tidy-progress.md`.
- Account deletion at the bottom of `/me/edit`: grey "מחיקת החשבון" for the team, red with a bin for guests. Logged (stage 2, stage 6); rule 6 read literally wants ⋯.
- U2's top bar keeps two icons (calendar, share), logged.
- Red counts on the Q1 tiles (ביקורים, תרומות): drawn in Q1, so they stay. No other red count outside the bell and ניהול.
- Row sheets: removing a vendor from an event, a helper from a stall and a file all open the Q8 confirmation ("להסיר מהאירוע?", "להסיר את תמר מהדוכן?", "למחוק את הקובץ?").

## Task A: the 119 earlier screens against their approved record

`others/<id>.pair.jpg` (design | app, made by `scripts/visual-check.mjs`, one call per id) compared with
`docs/visual-check/final/<id>.pair.jpg`. 118 of 119 ran; C11 did not (below). Every pair with any changed pixels was looked at side
by side (approved app | now, changes tinted); the 36 with no changed pixels above JPEG noise were not opened one by one.

### Differences with no Q screen, rule or logged decision behind them

| id | what changed |
|---|---|
| T3-Task, C3-TaskLinks | A volunteer no longer sees "עריכה" on a task (T3: his own task; C3: Noa's, which also lost "להעביר"). From the parity commit `5916c65` ("עריכה" only for a manager or the creator); not in the tidy log. |
| C13-ProfileEdit | F1: duplicate fields and "dd/mm/yyyy". |
| C9-Welcome | F2: registration questions added. |
| X2-Suspended | The demo persona "חסום · יוסי" is a guest, and `App.tsx` now gives a blocked guest the guest page ("החשבון הזה חסום כרגע להזמנת כרטיסים", WhatsApp and phone side by side, outlined "יציאה מהחשבון"). The team X2 screen still exists for a blocked team member but no demo persona reaches it. |
| Z3-DemoSwitch | A new "קישור להדגמה" link in the demo sheet, between the buttons and "מצבים להדגמה" (parity commit). |
| G3-Questions | F6: "ענו: X מתוך 157" in each meta. |
| M4-Prep | F7: "פתוח להרשמה ·" in the details meta. |
| N12-Tab | F8: per-line time and person. |
| V3-Files | Files sorted newest first (approved: police permit first); ⋯ holds "הוספת קישור". |
| S8-History | A "מחפשים" chip, and the found plastic chairs appear under today. |
| T6-History | A ⋯ with one item, "סיכום היום". |
| C1-Notifs | The "הוספה" button on Gil's shopping-trip row is smaller. |
| E1-Home, E9-Tabs, G5-Managers | Seed only: "6" sales became "4", Roni's last purchase 17:05 became 17:40, and the pending farm.ravve@gmail.com invite is gone from G5 (dropped for Q27 in `ae15111`). |
| C11-CalItem | Not run: its coverage steps click name chips ("click:בני"), which Q31 replaced with a picker. The row in `docs/demo-coverage.md` needs new steps. |

### Differences explained by a Q screen, a rule or the log

Q2 tasks root (P6-Full, P1, T1, T2, T4, X1, C8, B4, Z2, L5: no "עליך" list, four views, "באיחור" first, the bottom rows);
Q3 (T5); Q24 (L2 opens the add form); Q22 (S1, S2, S3: suggestion row, history row); Q17 (F4 "תאריך אחר"); Q30 and the legend
row (F2 "היום", F3 legend); Q1 (M1, Z4); Q23 (M8); Q25 (B2 inside People); Q26 (B1); Q27 (N13); Q4 (N3, plus the logged
"ממתין" tile); Q6 (N4); Q7 fill (N7 payment text); Q10 (N8); Q14 (M10, plus the logged extra tiles); Q15 (M7); Q16 (N14);
Q19 (N5); Q21 (N9); Q28 (E8); Q32 (N11); Q18 (C12, L6); delete through ⋯ (N10, S4, L4, V6, N2, N1, Y2 export, M5 "אקסל");
fix-verify log (G1, G2 rows open a sheet; E7 accounts row); vendors log (D4, D5, D6, D11: one WhatsApp button, call in the
sheet); places to the Farm (L3); rule 11 (the red count on ניהול in every manager screen).

## Not reached

- The team X2 suspended screen (no demo persona; see Task A).
- C11's designed state (coverage steps out of date).
- The helper persona beyond D11; `/me/photo/crop` for the vendor; a manager on `/shopping/trip` (only the volunteer is on the
  trip in the seed; the owner and manager are sent to `/shopping`).
- The inbox cards' row sheet ("מחיקה מהרשימה") was not pressed by the script; the first verifier covered it.
