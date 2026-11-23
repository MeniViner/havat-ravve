# Stage 7 walk, round 2 (final): every screen in demo, checked against the placement rules

Independent verifier (wrote no screen), 2026-11-23, branch `tidy/s7-walk2` cut from `origin/tidy/placement` at `925e171`
("Build dist after the smoke-cycle merge"). Demo mode only (localStorage `farm-demo`), local dev server on port 5270, nothing
against production, nothing deployed, nothing fixed. Every shot in this folder is from this run; round 1 (`6b94a19`) is in
git history.

## Result

**No new findings.** Every flag the walk raised is either a designed pattern, a logged decision or an item already in
`docs/tidy-progress.md` (round-1 F4 and the parity-traced list). No console errors on any screen.

The four round-1 fixes hold:

- **C13** `/me/edit` (owner, manager, volunteer, vendor): "יישוב" and "תאריך לידה" appear once each; the page is 992 px
  long instead of 1164. `owner/48-me-edit.jpg`, `staff/40-me-edit.jpg`.
- **C9** `/welcome`: name, phone and "יישוב *" stay; "איך שמעתם עלינו?" and "תאריך לידה" sit in a closed "עוד פרטים" fold.
  `staff/58-welcome.jpg`, `others/C9-Welcome.pair.jpg`.
- **Q13** `/manage/people/demo-u-michal`: the details list is טלפון, מייל, תפקיד as in Q13. A closed "תשובות בהרשמה" card
  sits at the bottom. Opened, it lists יישוב, איך שמעתם עלינו? and תאריך לידה. Each label fits on one line and the date
  reads 12.05.1988. The leaf check (`_leaf.json`) is now empty for every role. `manager/92-manage-people-u-michal.jpg`.
- **C11** `/farm/calendar/new`: the coverage steps run and the participant picker is set. `others/C11-CalItem.pair.jpg`.

Smoke-cycle changes seen:

- The "claimed" tag follows the guest's gender, for example "רוני לוי · סימנה שהעבירה" on the event's guests tab, the
  October tabs and the stall account.
- The "my steps" fix shows no React warning. The console was empty on every screen, including Tasks for the owner, who has
  project steps.

## How it was walked (same method as round 1)

- **Routes:** every route of `src/app/v2/routes.tsx` and `src/app/v2/screens/guest/index.tsx` that the role can open, with
  real seed ids.
- **Roles:** owner, manager, volunteer, vendor, guest and signed-out visitor.
- **Days:**
  - Regular day for everything.
  - Event day where the screens differ: tasks, farm, the event tab, gate, stall, the stall tabs, live, vendor home and
    stall, guest home and tickets.
  - After the event for close, debts, summary and the vendor summary.
- **Extra routes:** round 1 walked `/me/items`, a recurring task's day instance, `/terms` and the volunteer's
  `/event/stall/tabs` as extras. They are now in the main list for every team role.
- **Shots:** each screen loads fresh at 390×844 with the demo strip hidden. One full-length shot is taken (`.k-screen`
  grown to its content), as JPEG.
- **⋯ sheet:** on every screen with ⋯, the sheet is opened and shot (`-more`). When it has "מחיקה" or "הסרה", that item is
  pressed and the confirmation is checked for "מחיקה" and "ביטול". Nothing is confirmed.
- **First row:** on every screen whose first row is a button, the row is pressed. A row sheet is shot (`-row`); a
  navigation is recorded.
- **Checks in the page:**
  - rows with more than one control;
  - text links or loose text beside the back link, and more than one top-bar control;
  - red count badges outside the bell and ניהול;
  - Latin text and code words;
  - X buttons on rows and cards, and delete buttons outside a sheet;
  - root body height against the design's content height;
  - console errors.
- **One word per line:** checked twice, first on titles, tags, buttons and meta lines (`_titles.json`), then on every leaf
  element (`_leaf.json`), using text rects only.
- **Compared with round 1:**
  - every screen's findings, matched by route and day;
  - every one of the 452 shots both rounds share, pixel by pixel (changes over 0.2 % were opened side by side).
- **What changed since round 1:**
  - C13 and C9;
  - the Q13 card on both people files (Michal, and Yoav, whose יישוב moved into the card);
  - the gendered tag;
  - nothing else.
- **Raw data:** `<role>/_walk.json` holds every finding, the ⋯ items, the delete confirmation text and the row sheet items.

**Totals:**

| | |
|---|---|
| Screens walked | 367: owner 124, manager 122, volunteer 58, vendor 20, guest 27, signed-out 16 |
| Shots | 455 |
| Console errors | 0 |
| X buttons on a row or card | 0 |
| One-word-per-line titles | 0 |

**⋯ → מחיקה:** all 23 checks opened the Q8 confirmation.

- As owner: the task, project, recurring task, shopping item, place, event, product, stall account, message, two people,
  the visit and the donation.
- As manager: the same, minus the project, message and people.
- As volunteer: the shopping item.

**Row-sheet removals:** all four open Q8 too:

- vendor from an event: "להסיר מהאירוע?";
- helper from a stall: "להסיר את תמר מהדוכן?";
- a file: "למחוק את הקובץ?";
- an inbox card's "מחיקה מהרשימה": "למחוק מהרשימה?". Round 1 did not press this one.

The helper (עוזרת בדוכן) was not walked as a role. Its one screen (D11) is in Task A.

## Walk, per role

### Owner (בעלים · בני): 124 screens

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
| 32 | החווה | `/farm` | [page](owner/32-farm.jpg) | known: places card (round-1 F4); root length: content 760px vs design 703px (F1-Root) |
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
| 48 | הפרטים שלי | `/me/edit` | [page](owner/48-me-edit.jpg) | C13 fix holds; English: Google; logged: account deletion at bottom of edit |
| 49 | תמונת פרופיל | `/me/photo` | [page](owner/49-me-photo.jpg) | English: Google |
| 50 | למקם את התמונה | `/me/photo/crop` | [page](owner/50-me-photo-crop.jpg) | ok |
| 51 | הכרטיסים שלי | `/me/tickets` | [page](owner/51-me-tickets.jpg) | ok |
| 52 | מה יש לי בחווה | `/me/items` | [page](owner/52-me-items.jpg) | ok |
| 53 | להשקות את שורת העציצים | `/tasks/demo-tpl-pots_2026-11-19` | [page](owner/53-tasks-tpl-pots_2026-11-19.jpg) | ok |
| 54 | תנאי שימוש ופרטיות | `/terms` | [page](owner/54-terms.jpg) | English: havat-ravve.web.app., Google, Firebase:, Cloudflare:, Brevo:, HTTPS |
| 55 | להוסיף למסך הבית | `/install` | [page](owner/55-install.jpg) | English: iPhone, Android, Safari |
| 56 | חזרה הכול נשלח אין פעולות שמחכות לקליטה  | `/offline` | [page](owner/56-offline.jpg) | ok |
| 57 | משימות | `/tasks` (eventDay) | [page](owner/57-tasks.eventDay.jpg) | rows as designed |
| 58 | החווה | `/farm` (eventDay) | [page](owner/58-farm.eventDay.jpg) | known: places card (round-1 F4) |
| 59 | אירוע | `/event` (eventDay) | [page](owner/59-event.eventDay.jpg) | ok |
| 60 | שער · פסטיבל הסתיו יציאה מהשער QR תקין Q | `/event/gate` (eventDay) | [page](owner/60-event-gate.eventDay.jpg) | ok |
| 61 | מי בכניסה? | `/event/gate/search` (eventDay) | [page](owner/61-event-gate-search.eventDay.jpg) | ok |
| 62 | מי קונה? | `/event/stall` (eventDay) | [page](owner/62-event-stall.eventDay.jpg) | ok |
| 63 | החלפת קונה רל רוני לוי כבר בחשבון: 2 פרי | `/event/stall/demo-tab-roni-fest` (eventDay) | [page](owner/63-event-stall-tab-roni-fest.eventDay.jpg) | ok |
| 64 | חשבונות הדוכן | `/event/stall/tabs` (eventDay) | [page](owner/64-event-stall-tabs.eventDay.jpg) | ok |
| 65 | ניהול | `/manage` | [page](owner/65-manage.jpg) | tile counts as in Q1 |
| 66 | לטיפול · 4 | `/manage/inbox` | [page](owner/66-manage-inbox.jpg) | open: text link beside back (M2/C1) |
| 67 | אירועים | `/manage/events` | [page](owner/67-manage-events.jpg) | ok |
| 68 | אירוע חדש | `/manage/events/new` | [page](owner/68-manage-events-new.jpg) | ok |
| 69 | פסטיבל הסתיו | `/manage/events/demo-e-festival?tab=prep` | [page](owner/69-manage-events-e-festival-tab-prep.jpg) | ok |
| 70 | פסטיבל הסתיו | `/manage/events/demo-e-festival?tab=guests` | [page](owner/70-manage-events-e-festival-tab-guests.jpg) [⋯](owner/70-manage-events-e-festival-tab-guests-more.jpg) | rows as designed |
| 71 | עריכת אירוע | `/manage/events/demo-e-festival/edit` | [page](owner/71-manage-events-e-festival-edit.jpg) [⋯](owner/71-manage-events-e-festival-edit-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 72 | בעלי דוכנים | `/manage/events/demo-e-festival/vendors` | [page](owner/72-manage-events-e-festival-vendors.jpg) [⋯](owner/72-manage-events-e-festival-vendors-more.jpg) [row](owner/72-manage-events-e-festival-vendors-row.jpg) | ok |
| 73 | מוצרי הדוכן | `/manage/events/demo-e-festival/products` | [page](owner/73-manage-events-e-festival-products.jpg) [⋯](owner/73-manage-events-e-festival-products-more.jpg) | rows as designed |
| 74 | מוצר בדוכן | `/manage/events/demo-e-festival/products/new` | [page](owner/74-manage-events-e-festival-products-new.jpg) | ok |
| 75 | מוצר בדוכן | `/manage/events/demo-e-festival/products/demo-pr-lemonade` | [page](owner/75-manage-events-e-festival-products-pr-lemonade.jpg) [⋯](owner/75-manage-events-e-festival-products-pr-lemonade-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 76 | קבצים | `/manage/events/demo-e-festival/files` | [page](owner/76-manage-events-e-festival-files.jpg) [⋯](owner/76-manage-events-e-festival-files-more.jpg) [row](owner/76-manage-events-e-festival-files-row.jpg) | ok |
| 77 | מי עובד באירוע | `/manage/events/demo-e-festival/staffing` | [page](owner/77-manage-events-e-festival-staffing.jpg) | ok |
| 78 | יריד אוקטובר | `/manage/events/demo-e-october?tab=summary` | [page](owner/78-manage-events-e-october-tab-summary.jpg) [⋯](owner/78-manage-events-e-october-tab-summary-more.jpg) | ok |
| 79 | מה נמכר בדוכן | `/manage/events/demo-e-october?tab=summary&part=sold` | [page](owner/79-manage-events-e-october-tab-summary-part-sold.jpg) | ok |
| 80 | כסף | `/manage/events/demo-e-october?tab=summary&part=money` | [page](owner/80-manage-events-e-october-tab-summary-part-money.jpg) | ok |
| 81 | לעומת אירועים קודמים | `/manage/events/demo-e-october?tab=summary&part=compare` | [page](owner/81-manage-events-e-october-tab-summary-part-compare.jpg) | ok |
| 82 | חשבונות הדוכן | `/manage/events/demo-e-october/tabs` | [page](owner/82-manage-events-e-october-tabs.jpg) [⋯](owner/82-manage-events-e-october-tabs-more.jpg) | ok |
| 83 | רוני לוי | `/manage/events/demo-e-october/tabs/demo-tab-roni-oct` | [page](owner/83-manage-events-e-october-tabs-tab-roni-oct.jpg) [⋯](owner/83-manage-events-e-october-tabs-tab-roni-oct-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 84 | בעלי דוכנים · 9 | `/manage/vendors` | [page](owner/84-manage-vendors.jpg) | ok |
| 85 | גבינות משק רז | `/manage/vendors/demo-v-raz` | [page](owner/85-manage-vendors-v-raz.jpg) | ok |
| 86 | גישה לאפליקציה | `/manage/vendors/demo-v-raz/access` | [page](owner/86-manage-vendors-v-raz-access.jpg) [⋯](owner/86-manage-vendors-v-raz-access-more.jpg) | ok |
| 87 | אנשים והודעות | `/manage/people` | [page](owner/87-manage-people.jpg) [⋯](owner/87-manage-people-more.jpg) | ok |
| 88 | אנשים והודעות | `/manage/people?filter=team` | [page](owner/88-manage-people-filter-team.jpg) [⋯](owner/88-manage-people-filter-team-more.jpg) | ok |
| 89 | אנשים והודעות | `/manage/people?tab=messages` | [page](owner/89-manage-people-tab-messages.jpg) | ok |
| 90 | להוסיף מישהו מראש | `/manage/people/invite` | [page](owner/90-manage-people-invite.jpg) | English: Google |
| 91 | הודעות בני · היום 14:10 · כל הצוות מחר מ | `/manage/people/messages/demo-b-1` | [page](owner/91-manage-people-messages-b-1.jpg) [⋯](owner/91-manage-people-messages-b-1-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 92 | אנשים מב מיכל ברק לקוחה 155 · נרשמה באוק | `/manage/people/demo-u-michal` | [page](owner/92-manage-people-u-michal.jpg) [⋯](owner/92-manage-people-u-michal-more.jpg) [row](owner/92-manage-people-u-michal-row.jpg) | Q13 fix holds · ⋯ → מחיקה → Q8 ok |
| 93 | אנשים יפ יואב פרץ מתנדב 9 · נרשם באוקטוב | `/manage/people/demo-u-yoav` | [page](owner/93-manage-people-u-yoav.jpg) [⋯](owner/93-manage-people-u-yoav-more.jpg) [row](owner/93-manage-people-u-yoav-row.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 94 | הודעה חדשה | `/manage/broadcasts/new` | [page](owner/94-manage-broadcasts-new.jpg) | ok |
| 95 | דוחות | `/manage/reports` | [page](owner/95-manage-reports.jpg) [⋯](owner/95-manage-reports-more.jpg) | ok |
| 96 | אנשים ונרשמים | `/manage/reports/people` | [page](owner/96-manage-reports-people.jpg) | ok |
| 97 | אירועים | `/manage/reports/events` | [page](owner/97-manage-reports-events.jpg) | ok |
| 98 | דוחות | `/manage/reports/tasks` | [page](owner/98-manage-reports-tasks.jpg) [⋯](owner/98-manage-reports-tasks-more.jpg) | ok |
| 99 | ביקורים | `/manage/visits` | [page](owner/99-manage-visits.jpg) [⋯](owner/99-manage-visits-more.jpg) | ok |
| 100 | משפחת כהן | `/manage/visits/demo-vi-cohen` | [page](owner/100-manage-visits-vi-cohen.jpg) [⋯](owner/100-manage-visits-vi-cohen-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 101 | תרומות | `/manage/donations` | [page](owner/101-manage-donations.jpg) [⋯](owner/101-manage-donations-more.jpg) | ok |
| 102 | תרומות · החודש | `/manage/donations/table` | [page](owner/102-manage-donations-table.jpg) | ok |
| 103 | 180 ₪ · מיכל ברק | `/manage/donations/demo-d-michal` | [page](owner/103-manage-donations-d-michal.jpg) [⋯](owner/103-manage-donations-d-michal-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 104 | הגדרות | `/manage/settings` | [page](owner/104-manage-settings.jpg) [row](owner/104-manage-settings-row.jpg) | English: PayBox |
| 105 | הודעות מוכנות | `/manage/settings/messages` | [page](owner/105-manage-settings-messages.jpg) | English: https://havat-ravve.web.app/app/me |
| 106 | שאלות הרשמה | `/manage/settings/questions` | [page](owner/106-manage-settings-questions.jpg) | rows as designed; English: Google |
| 107 | איך משלמים | `/manage/settings/payments` | [page](owner/107-manage-settings-payments.jpg) | English: PayBox |
| 108 | סכומי תרומה | `/manage/settings/donation-amounts` | [page](owner/108-manage-settings-donation-amounts.jpg) | rows as designed |
| 109 | סוגי ביקור | `/manage/settings/visit-types` | [page](owner/109-manage-settings-visit-types.jpg) | rows as designed |
| 110 | פרטי קשר לחווה | `/manage/settings/contact` | [page](owner/110-manage-settings-contact.jpg) | ok |
| 111 | סוגי ביקור ושאלות הרשמה | `/manage/settings/guests` | [page](owner/111-manage-settings-guests.jpg) | ok |
| 112 | מנהלים ובעלים | `/manage/settings/managers` | [page](owner/112-manage-settings-managers.jpg) | ok |
| 113 | יומן אינסטינקט | `/manage/instinct` | [page](owner/113-manage-instinct.jpg) [⋯](owner/113-manage-instinct-more.jpg) | ok |
| 114 | כל הפעילות | `/manage/activity` | [page](owner/114-manage-activity.jpg) [⋯](owner/114-manage-activity-more.jpg) | ok |
| 115 | ניהול | `/manage` (eventDay) | [page](owner/115-manage.eventDay.jpg) | tile counts as in Q1 |
| 116 | פסטיבל הסתיו | `/manage/events/demo-e-festival?tab=day` (eventDay) | [page](owner/116-manage-events-e-festival-tab-day.eventDay.jpg) | ok |
| 117 | פסטיבל הסתיו חי · 17:20 212 נכנסו מתוך 6 | `/manage/events/demo-e-festival/live` (eventDay) | [page](owner/117-manage-events-e-festival-live.eventDay.jpg) | ok |
| 118 | סריקות · 217 | `/manage/events/demo-e-festival/live/scans` (eventDay) | [page](owner/118-manage-events-e-festival-live-scans.eventDay.jpg) [⋯](owner/118-manage-events-e-festival-live-scans.eventDay-more.jpg) | ok |
| 119 | יוסי מזרחי | `/manage/events/demo-e-festival/live/scans/demo-sc-yossi` (eventDay) | [page](owner/119-manage-events-e-festival-live-scans-sc-yossi.eventDay.jpg) | ok |
| 120 | עוד לא הגיעו | `/manage/events/demo-e-festival/live/waiting` (eventDay) | [page](owner/120-manage-events-e-festival-live-waiting.eventDay.jpg) | ok |
| 121 | הדוכנים היום | `/manage/events/demo-e-festival/vendors/today` (eventDay) | [page](owner/121-manage-events-e-festival-vendors-today.eventDay.jpg) | ok |
| 122 | סגירת האירוע | `/manage/events/demo-e-festival/close` (afterEvent) | [page](owner/122-manage-events-e-festival-close.afterEvent.jpg) | ok |
| 123 | תזכורות חוב · 4 | `/manage/events/demo-e-october/debts` (afterEvent) | [page](owner/123-manage-events-e-october-debts.afterEvent.jpg) | rows as designed |
| 124 | פסטיבל הסתיו | `/manage/events/demo-e-festival?tab=summary` (afterEvent) | [page](owner/124-manage-events-e-festival-tab-summary.afterEvent.jpg) [⋯](owner/124-manage-events-e-festival-tab-summary.afterEvent-more.jpg) | ok |

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
| 32 | החווה | `/farm` | [page](manager/32-farm.jpg) | known: places card (round-1 F4); root length: content 760px vs design 703px (F1-Root) |
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
| 48 | הפרטים שלי | `/me/edit` | [page](manager/48-me-edit.jpg) | C13 fix holds; English: Google; logged: account deletion at bottom of edit |
| 49 | תמונת פרופיל | `/me/photo` | [page](manager/49-me-photo.jpg) | English: Google |
| 50 | למקם את התמונה | `/me/photo/crop` | [page](manager/50-me-photo-crop.jpg) | ok |
| 51 | הכרטיסים שלי | `/me/tickets` | [page](manager/51-me-tickets.jpg) | ok |
| 52 | מה יש לי בחווה | `/me/items` | [page](manager/52-me-items.jpg) | ok |
| 53 | להשקות את שורת העציצים | `/tasks/demo-tpl-pots_2026-11-19` | [page](manager/53-tasks-tpl-pots_2026-11-19.jpg) | ok |
| 54 | תנאי שימוש ופרטיות | `/terms` | [page](manager/54-terms.jpg) | English: havat-ravve.web.app., Google, Firebase:, Cloudflare:, Brevo:, HTTPS |
| 55 | להוסיף למסך הבית | `/install` | [page](manager/55-install.jpg) | English: iPhone, Android, Safari |
| 56 | חזרה הכול נשלח אין פעולות שמחכות לקליטה  | `/offline` | [page](manager/56-offline.jpg) | ok |
| 57 | משימות | `/tasks` (eventDay) | [page](manager/57-tasks.eventDay.jpg) | ok |
| 58 | החווה | `/farm` (eventDay) | [page](manager/58-farm.eventDay.jpg) | known: places card (round-1 F4) |
| 59 | אירוע | `/event` (eventDay) | [page](manager/59-event.eventDay.jpg) | ok |
| 60 | שער · פסטיבל הסתיו יציאה מהשער QR תקין Q | `/event/gate` (eventDay) | [page](manager/60-event-gate.eventDay.jpg) | ok |
| 61 | מי בכניסה? | `/event/gate/search` (eventDay) | [page](manager/61-event-gate-search.eventDay.jpg) | ok |
| 62 | מי קונה? | `/event/stall` (eventDay) | [page](manager/62-event-stall.eventDay.jpg) | ok |
| 63 | החלפת קונה רל רוני לוי כבר בחשבון: 2 פרי | `/event/stall/demo-tab-roni-fest` (eventDay) | [page](manager/63-event-stall-tab-roni-fest.eventDay.jpg) | ok |
| 64 | חשבונות הדוכן | `/event/stall/tabs` (eventDay) | [page](manager/64-event-stall-tabs.eventDay.jpg) | ok |
| 65 | ניהול | `/manage` | [page](manager/65-manage.jpg) | tile counts as in Q1 |
| 66 | לטיפול · 4 | `/manage/inbox` | [page](manager/66-manage-inbox.jpg) | open: text link beside back (M2/C1) |
| 67 | אירועים | `/manage/events` | [page](manager/67-manage-events.jpg) | ok |
| 68 | אירוע חדש | `/manage/events/new` | [page](manager/68-manage-events-new.jpg) | ok |
| 69 | פסטיבל הסתיו | `/manage/events/demo-e-festival?tab=prep` | [page](manager/69-manage-events-e-festival-tab-prep.jpg) | ok |
| 70 | פסטיבל הסתיו | `/manage/events/demo-e-festival?tab=guests` | [page](manager/70-manage-events-e-festival-tab-guests.jpg) [⋯](manager/70-manage-events-e-festival-tab-guests-more.jpg) | rows as designed |
| 71 | עריכת אירוע | `/manage/events/demo-e-festival/edit` | [page](manager/71-manage-events-e-festival-edit.jpg) [⋯](manager/71-manage-events-e-festival-edit-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 72 | בעלי דוכנים | `/manage/events/demo-e-festival/vendors` | [page](manager/72-manage-events-e-festival-vendors.jpg) [⋯](manager/72-manage-events-e-festival-vendors-more.jpg) [row](manager/72-manage-events-e-festival-vendors-row.jpg) | ok |
| 73 | מוצרי הדוכן | `/manage/events/demo-e-festival/products` | [page](manager/73-manage-events-e-festival-products.jpg) [⋯](manager/73-manage-events-e-festival-products-more.jpg) | rows as designed |
| 74 | מוצר בדוכן | `/manage/events/demo-e-festival/products/new` | [page](manager/74-manage-events-e-festival-products-new.jpg) | ok |
| 75 | מוצר בדוכן | `/manage/events/demo-e-festival/products/demo-pr-lemonade` | [page](manager/75-manage-events-e-festival-products-pr-lemonade.jpg) [⋯](manager/75-manage-events-e-festival-products-pr-lemonade-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 76 | קבצים | `/manage/events/demo-e-festival/files` | [page](manager/76-manage-events-e-festival-files.jpg) [⋯](manager/76-manage-events-e-festival-files-more.jpg) [row](manager/76-manage-events-e-festival-files-row.jpg) | ok |
| 77 | מי עובד באירוע | `/manage/events/demo-e-festival/staffing` | [page](manager/77-manage-events-e-festival-staffing.jpg) | ok |
| 78 | יריד אוקטובר | `/manage/events/demo-e-october?tab=summary` | [page](manager/78-manage-events-e-october-tab-summary.jpg) [⋯](manager/78-manage-events-e-october-tab-summary-more.jpg) | ok |
| 79 | מה נמכר בדוכן | `/manage/events/demo-e-october?tab=summary&part=sold` | [page](manager/79-manage-events-e-october-tab-summary-part-sold.jpg) | ok |
| 80 | כסף | `/manage/events/demo-e-october?tab=summary&part=money` | [page](manager/80-manage-events-e-october-tab-summary-part-money.jpg) | ok |
| 81 | לעומת אירועים קודמים | `/manage/events/demo-e-october?tab=summary&part=compare` | [page](manager/81-manage-events-e-october-tab-summary-part-compare.jpg) | ok |
| 82 | חשבונות הדוכן | `/manage/events/demo-e-october/tabs` | [page](manager/82-manage-events-e-october-tabs.jpg) [⋯](manager/82-manage-events-e-october-tabs-more.jpg) | ok |
| 83 | רוני לוי | `/manage/events/demo-e-october/tabs/demo-tab-roni-oct` | [page](manager/83-manage-events-e-october-tabs-tab-roni-oct.jpg) [⋯](manager/83-manage-events-e-october-tabs-tab-roni-oct-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 84 | בעלי דוכנים · 9 | `/manage/vendors` | [page](manager/84-manage-vendors.jpg) | ok |
| 85 | גבינות משק רז | `/manage/vendors/demo-v-raz` | [page](manager/85-manage-vendors-v-raz.jpg) | ok |
| 86 | גישה לאפליקציה | `/manage/vendors/demo-v-raz/access` | [page](manager/86-manage-vendors-v-raz-access.jpg) [⋯](manager/86-manage-vendors-v-raz-access-more.jpg) | ok |
| 87 | אנשים והודעות | `/manage/people` | [page](manager/87-manage-people.jpg) [⋯](manager/87-manage-people-more.jpg) | ok |
| 88 | אנשים והודעות | `/manage/people?filter=team` | [page](manager/88-manage-people-filter-team.jpg) [⋯](manager/88-manage-people-filter-team-more.jpg) | ok |
| 89 | אנשים והודעות | `/manage/people?tab=messages` | [page](manager/89-manage-people-tab-messages.jpg) | ok |
| 90 | להוסיף מישהו מראש | `/manage/people/invite` | [page](manager/90-manage-people-invite.jpg) | English: Google |
| 91 | הודעות בני · היום 14:10 · כל הצוות מחר מ | `/manage/people/messages/demo-b-1` | [page](manager/91-manage-people-messages-b-1.jpg) | ok |
| 92 | אנשים מב מיכל ברק לקוחה 155 · נרשמה באוק | `/manage/people/demo-u-michal` | [page](manager/92-manage-people-u-michal.jpg) [⋯](manager/92-manage-people-u-michal-more.jpg) [row](manager/92-manage-people-u-michal-row.jpg) | Q13 fix holds |
| 93 | אנשים יפ יואב פרץ מתנדב 9 · נרשם באוקטוב | `/manage/people/demo-u-yoav` | [page](manager/93-manage-people-u-yoav.jpg) [row](manager/93-manage-people-u-yoav-row.jpg) | ok |
| 94 | הודעה חדשה | `/manage/broadcasts/new` | [page](manager/94-manage-broadcasts-new.jpg) | ok |
| 95 | דוחות | `/manage/reports` | [page](manager/95-manage-reports.jpg) [⋯](manager/95-manage-reports-more.jpg) | ok |
| 96 | אנשים ונרשמים | `/manage/reports/people` | [page](manager/96-manage-reports-people.jpg) | ok |
| 97 | אירועים | `/manage/reports/events` | [page](manager/97-manage-reports-events.jpg) | ok |
| 98 | דוחות | `/manage/reports/tasks` | [page](manager/98-manage-reports-tasks.jpg) [⋯](manager/98-manage-reports-tasks-more.jpg) | ok |
| 99 | ביקורים | `/manage/visits` | [page](manager/99-manage-visits.jpg) [⋯](manager/99-manage-visits-more.jpg) | ok |
| 100 | משפחת כהן | `/manage/visits/demo-vi-cohen` | [page](manager/100-manage-visits-vi-cohen.jpg) [⋯](manager/100-manage-visits-vi-cohen-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 101 | תרומות | `/manage/donations` | [page](manager/101-manage-donations.jpg) [⋯](manager/101-manage-donations-more.jpg) | ok |
| 102 | תרומות · החודש | `/manage/donations/table` | [page](manager/102-manage-donations-table.jpg) | ok |
| 103 | 180 ₪ · מיכל ברק | `/manage/donations/demo-d-michal` | [page](manager/103-manage-donations-d-michal.jpg) [⋯](manager/103-manage-donations-d-michal-more.jpg) | ok · ⋯ → מחיקה → Q8 ok |
| 104 | הגדרות | `/manage/settings` | [page](manager/104-manage-settings.jpg) | English: PayBox |
| 105 | הודעות מוכנות | `/manage/settings/messages` | [page](manager/105-manage-settings-messages.jpg) | English: https://havat-ravve.web.app/app/me |
| 106 | שאלות הרשמה | `/manage/settings/questions` | [page](manager/106-manage-settings-questions.jpg) | rows as designed; English: Google |
| 107 | איך משלמים | `/manage/settings/payments` | [page](manager/107-manage-settings-payments.jpg) | English: PayBox |
| 108 | סכומי תרומה | `/manage/settings/donation-amounts` | [page](manager/108-manage-settings-donation-amounts.jpg) | rows as designed |
| 109 | סוגי ביקור | `/manage/settings/visit-types` | [page](manager/109-manage-settings-visit-types.jpg) | rows as designed |
| 110 | פרטי קשר לחווה | `/manage/settings/contact` | [page](manager/110-manage-settings-contact.jpg) | ok |
| 111 | סוגי ביקור ושאלות הרשמה | `/manage/settings/guests` | [page](manager/111-manage-settings-guests.jpg) | ok |
| 112 | כל הפעילות | `/manage/activity` | [page](manager/112-manage-activity.jpg) [⋯](manager/112-manage-activity-more.jpg) | ok |
| 113 | ניהול | `/manage` (eventDay) | [page](manager/113-manage.eventDay.jpg) | tile counts as in Q1 |
| 114 | פסטיבל הסתיו | `/manage/events/demo-e-festival?tab=day` (eventDay) | [page](manager/114-manage-events-e-festival-tab-day.eventDay.jpg) | ok |
| 115 | פסטיבל הסתיו חי · 17:20 212 נכנסו מתוך 6 | `/manage/events/demo-e-festival/live` (eventDay) | [page](manager/115-manage-events-e-festival-live.eventDay.jpg) | ok |
| 116 | סריקות · 217 | `/manage/events/demo-e-festival/live/scans` (eventDay) | [page](manager/116-manage-events-e-festival-live-scans.eventDay.jpg) [⋯](manager/116-manage-events-e-festival-live-scans.eventDay-more.jpg) | ok |
| 117 | יוסי מזרחי | `/manage/events/demo-e-festival/live/scans/demo-sc-yossi` (eventDay) | [page](manager/117-manage-events-e-festival-live-scans-sc-yossi.eventDay.jpg) | ok |
| 118 | עוד לא הגיעו | `/manage/events/demo-e-festival/live/waiting` (eventDay) | [page](manager/118-manage-events-e-festival-live-waiting.eventDay.jpg) | ok |
| 119 | הדוכנים היום | `/manage/events/demo-e-festival/vendors/today` (eventDay) | [page](manager/119-manage-events-e-festival-vendors-today.eventDay.jpg) | ok |
| 120 | סגירת האירוע | `/manage/events/demo-e-festival/close` (afterEvent) | [page](manager/120-manage-events-e-festival-close.afterEvent.jpg) | ok |
| 121 | תזכורות חוב · 4 | `/manage/events/demo-e-october/debts` (afterEvent) | [page](manager/121-manage-events-e-october-debts.afterEvent.jpg) | rows as designed |
| 122 | פסטיבל הסתיו | `/manage/events/demo-e-festival?tab=summary` (afterEvent) | [page](manager/122-manage-events-e-festival-tab-summary.afterEvent.jpg) [⋯](manager/122-manage-events-e-festival-tab-summary.afterEvent-more.jpg) | ok |

### Volunteer (מתנדב · יואב): 58 screens

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
| 24 | החווה | `/farm` | [page](staff/24-farm.jpg) | known: places card (round-1 F4); root length: content 760px vs design 703px (F1-Root) |
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
| 40 | הפרטים שלי | `/me/edit` | [page](staff/40-me-edit.jpg) | C13 fix holds; English: Google; logged: account deletion at bottom of edit |
| 41 | תמונת פרופיל | `/me/photo` | [page](staff/41-me-photo.jpg) | English: Google |
| 42 | למקם את התמונה | `/me/photo/crop` | [page](staff/42-me-photo-crop.jpg) | ok |
| 43 | הכרטיסים שלי | `/me/tickets` | [page](staff/43-me-tickets.jpg) | ok |
| 44 | מה יש לי בחווה | `/me/items` | [page](staff/44-me-items.jpg) | ok |
| 45 | להשקות את שורת העציצים | `/tasks/demo-tpl-pots_2026-11-19` | [page](staff/45-tasks-tpl-pots_2026-11-19.jpg) | ok |
| 46 | תנאי שימוש ופרטיות | `/terms` | [page](staff/46-terms.jpg) | English: havat-ravve.web.app., Google, Firebase:, Cloudflare:, Brevo:, HTTPS |
| 47 | להוסיף למסך הבית | `/install` | [page](staff/47-install.jpg) | English: iPhone, Android, Safari |
| 48 | חזרה הכול נשלח אין פעולות שמחכות לקליטה  | `/offline` | [page](staff/48-offline.jpg) | ok |
| 49 | משימות | `/tasks` (eventDay) | [page](staff/49-tasks.eventDay.jpg) | ok |
| 50 | החווה | `/farm` (eventDay) | [page](staff/50-farm.eventDay.jpg) | known: places card (round-1 F4) |
| 51 | אירוע | `/event` (eventDay) | [page](staff/51-event.eventDay.jpg) | ok |
| 52 | שער · פסטיבל הסתיו יציאה מהשער QR תקין Q | `/event/gate` (eventDay) | [page](staff/52-event-gate.eventDay.jpg) | ok |
| 53 | מי בכניסה? | `/event/gate/search` (eventDay) | [page](staff/53-event-gate-search.eventDay.jpg) | ok |
| 54 | מי קונה? | `/event/stall` (eventDay) | [page](staff/54-event-stall.eventDay.jpg) | ok |
| 55 | החלפת קונה רל רוני לוי כבר בחשבון: 2 פרי | `/event/stall/demo-tab-roni-fest` (eventDay) | [page](staff/55-event-stall-tab-roni-fest.eventDay.jpg) | ok |
| 56 | חשבונות הדוכן | `/event/stall/tabs` (eventDay) | [page](staff/56-event-stall-tabs.eventDay.jpg) | ok |
| 57 | משימות | `/manage` → /tasks | [page](staff/57-manage.jpg) | ok |
| 58 | ברוך הבא לצוות | `/welcome` | [page](staff/58-welcome.jpg) | C9 fix holds |

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
| 09 | הפרטים שלי | `/me/edit` | [page](vendor/09-me-edit.jpg) | C13 fix holds; English: Google; logged: account deletion at bottom of edit |
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

### New in round 2

None.

### Seen again, already known (in `docs/tidy-progress.md` or logged; no action unless Meni decides)

- **Places card on `/farm`** (round-1 F4): a "מקומות בחווה" card appended under the F1 blocks, for every team role.
- **Parity-traced differences:**
  - T3/C3: no "עריכה" for a volunteer on others' tasks.
  - G3 and M4: the meta wraps to two lines.
  - N12: per-line time and person.
  - V3: files newest first.
  - S8: the "מחפשים" chip.
  - T6: ⋯ "סיכום היום".
  - Z3: the "קישור להדגמה" link.
  - X2: a blocked guest gets the guest page, and no demo persona reaches the team X2 screen.
- **Text links beside the back link:** "מה שטופל" on `/manage/inbox` (M2) and "מה לקבל" on `/notifications` (C1). This is
  an open decision.
- **Account deletion:** at the bottom of `/me/edit`, and the inline "מחיקת חשבון" link inside the `/terms` text. Both are
  logged.
- **Top bar and badges:** U2 keeps two top-bar icons, and the Q1 tiles keep their red counts (drawn in the design).
- **Rows with two controls that the design draws:**
  - task check plus "לקחת";
  - the S6 trip rows;
  - the Q21 reorder handles;
  - the recurring switch;
  - the M5 select box (now with the gendered tag);
  - the V5 send button;
  - the P3 and P5 step rows.
- **Latin names on screen** (PayBox, Google, iPhone/Android/Safari, Firebase/Cloudflare/Brevo/HTTPS on `/terms` and
  `/privacy`, the template URL). These were in the approved record too.
- **Root length from seed data:**
  - the tasks root for the volunteer and manager;
  - the guest home;
  - `/login` for a signed-out visitor.
- **Demo-only:** the volunteer's `/welcome` shows the "new" persona's e-mail (omer.levi2@…) with Yoav's filled-in name and
  phone. Same as round 1.

## Task A: the 119 earlier screens against their approved record

**How it was compared:**

- `others/<id>.pair.jpg` (design | app) was made by `scripts/visual-check.mjs`, one call per id. All 119 ran, C11
  included.
- Each new pair was compared, pixel by pixel on the app half, with two records:
  - `docs/visual-check/final` (the approved record);
  - round 1's pairs (`6b94a19`, in git).

**Against round 1:** 117 of 119 pairs are unchanged. Two changed:

| id | what changed since round 1 |
|---|---|
| C9-Welcome | The fix: the optional sign-up questions are folded into "עוד פרטים". The page is now closer to the approved C9. |
| M9-Person | The fix: יישוב, איך שמעתם עלינו and תאריך לידה left the details list for the closed "תשובות בהרשמה" card. The details list now matches Q13 (טלפון, מייל, תפקיד). |

**Against the approved record:**

- The remaining differences are the ones round 1 listed:
  - those explained by a Q screen, a rule or the log;
  - the parity-traced list;
  - seed-only changes in E1, E9 and G5.
- C13 and C11:
  - C13's frame is unchanged. Its two duplicate fields sat below the pair's 844-pixel frame, so only the walk shows the
    fix.
  - C11 ran all its coverage steps, with its participants set.

## Not reached

- **The team X2 suspended screen:** no demo persona reaches it (known).
- **Helper and vendor gaps:**
  - the helper persona beyond D11;
  - `/me/photo/crop` for the vendor.
- **Shopping trip for owner and manager:** only the volunteer is on the trip in the seed, so the owner and manager are sent
  to `/shopping`.
- **Other recurring-task instances:** `/tasks/<template>_2026-11-18`, `_2026-11-28` and the instance edit link are other
  dates of the walked recurring task (`/tasks/demo-tpl-pots_2026-11-19`).
