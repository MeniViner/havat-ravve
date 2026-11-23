# Smoke cycle: tidy round on the emulators

End-to-end smoke of the tidy round (branch `tidy/s7-smoke`, cut from `tidy/placement`) as every role, on local Firebase
emulators. Run 2026-11-23. It is the redesign cycle (`docs/smoke/redesign/README.md`) with every check moved to the tidy
placement of its capability, plus the stage 7 checks of `havat-raveh-tidy/PROMPT.md` (items 9 to 12).
Result of the final cycle: 329 of 329 checks passed, no console errors in any session.

## Environment

- Emulators: `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npx firebase emulators:start --only firestore,auth --project demo-havat-ravve` (Firestore 8080, Auth 9099). The app keeps its real project id inside the emulator, so the data lives under `havat-ravve` on localhost.
- App: `PORT=5237 node scripts/dev.mjs` on `http://localhost:5237` (esbuild watch of this checkout, dev build with React StrictMode). Every URL carried `?emulator`.
- Browser: Playwright Chromium, 390x844 at 2x, `he-IL`, `Asia/Jerusalem`, service workers blocked, a canvas camera that shows a generated QR, a fixed position at the farm for the place check.
- Safety: every browser context aborts every request to a host that is not localhost. Nothing was deployed and nothing ran against production. The aborted requests of the final cycle are listed below.
- Sign-in: as in the redesign cycle, each session signs in to the Auth emulator by REST (a Google IdP sign-in) and hands the result to Firebase's own storage before the app loads (the Google button's redirect needs `apis.google.com`, which the block aborts). New in this round: each signed-in session also marks the first-visit demo (PR #24) as already answered for its account (`farm-demo-intro:<uid>` = `done`), otherwise every account would open in demo at its own role and never touch the emulator data. The first-visit demo itself is covered by `tests/demo-intro.mjs`, not here.
- Data: `scripts/smoke-seed.mjs` wipes both emulators and writes 14 accounts (owner, manager, 2 volunteers, a pending and a blocked volunteer, 2 guests, and 6 accounts without a profile that join during the run: an e-mail invitee, a stall owner, a helper, a new guest, a person added ahead by phone, a second account for the used link), places, recurring tasks, tasks, shopping, 2 events, a visit, a donation and tickets. Item 8 adds a free event and a stall account for the new guest directly, as the staff side would.
- Run: `node scripts/smoke-seed.mjs && BASE=http://localhost:5237 node scripts/smoke-cycle.mjs` (`--only=3,4` for some items; items depend on the ones before them). Results go to `.build/smoke/results.json`, screenshots to `docs/smoke/tidy/shots`.

## Where the checks moved (tidy placements)

| Capability | Redesign cycle | Tidy cycle |
|---|---|---|
| Recurring tasks | `/manage/recurring` "חדשה" form (L2) | add form "חוזרת" chip (Q24), listed from the managers-only row "משימות חוזרות" at the bottom of Tasks; edit and "פעילה" in the same form |
| Places | `/places` opened directly | Farm tab card "מקומות בחווה" |
| Role by e-mail | People "תפקיד לפי כתובת מייל" | People ⋯ → Q27 "לפי מייל" |
| Block / unblock | "חסימה" button on the person | person ⋯ → "חסימה" / "שחרור חסימה" |
| Broadcasts | `/manage/broadcasts/new`, `/manage/broadcasts/:id` | People "הודעות" segment, "הודעה חדשה" (Q26), read details at `/manage/people/messages/:id` |
| Activity | `/manage/activity` opened directly | "כל הפעילות" row on the Manage root; "יומן אינסטינקט" row for owners only |
| Event form date | one date field | "מתאריך" field (the form has "מתאריך" and "עד תאריך") |
| Guest order | old order page with a select for the confirmation | U3 with the "לאן לשלוח אישור תשלום" picker, then U4 "העברתי את התשלום" |
| Guest sign-up | "נעים להכיר" form | U13 "עוד רגע ונכנסים" with "לקבל עדכונים מהחווה" |
| Ordering signed out | `/login` "רגע לפני הכרטיסים" | the order bar goes straight to the Google sign-in (Auth emulator page); U12 `/login` checked on its own |
| Guest account | one page listing everything | U7 shows four, "הכל · 5" opens the full list |
| Stall account | row on "הכרטיסים שלי" | U7 row → U10 page "העברתי את התשלום" |
| Contact | page opens | U11 message sent and found in the managers' inbox |
| Deletes | red buttons, instant deletes | ⋯ → "מחיקה" → Q8 (detail screens with "עריכה": ⋯ in the edit form's header) |

## Final cycle (round 2)

### 1 Volunteer day (26/26)

| Check | Role | Result |
|---|---|---|
| T1 tasks root: next-up card with my task | volunteer | pass |
| T1 by time view | volunteer | pass |
| T1 only mine view | volunteer | pass |
| take a free task (assignee saved, row tagged שלך) | volunteer | pass |
| mark done: saved, toast בוצע | volunteer | pass |
| done row stays in place, struck through (T4) | volunteer | pass |
| capture bar opens T5 with the text | volunteer | pass |
| T5 task saved with place and date, back on T1 | volunteer | pass |
| T3 add a photo to the task (saved as an image) | volunteer | pass |
| done with photo opens the photo screen | volunteer | pass |
| tasks: no console errors | yoav | pass |
| S1 shopping list renders | volunteer | pass |
| S5 opens with the text and the list | volunteer | pass |
| S5 item saved, back on S1 | volunteer | pass |
| suggestion chip adds "לחם" | volunteer | pass |
| mark bought (saved) | volunteer | pass |
| bought item listed under נקנה היום after reload | volunteer | pass |
| shopping: no console errors | yoav | pass |
| F1 farm tab: presence, week, next event | volunteer | pass |
| farm calendar opens | volunteer | pass |
| F5 today feed lists what was done | volunteer | pass |
| farm: no console errors | yoav | pass |
| bell opens notifications | volunteer | pass |
| Q18 (L6) profile renders | volunteer | pass |
| C13 profile edit saved | volunteer | pass |
| farm, notifications, profile: no console errors | yoav | pass |

Screenshots: [1-F1-farm](shots/1-F1-farm.jpg), [1-L6-profile](shots/1-L6-profile.jpg), [1-S1-shopping](shots/1-S1-shopping.jpg), [1-T3-task-photo](shots/1-T3-task-photo.jpg), [1-done-photo-screen](shots/1-done-photo-screen.jpg), [1-task-done-struck](shots/1-task-done-struck.jpg), [1-tasks-by-place](shots/1-tasks-by-place.jpg)

### 2 Manager day (38/38)

| Check | Role | Result |
|---|---|---|
| Q1 manage root: tiles and the activity row (no Instinct log for a manager) | manager | pass |
| C4 opens from the task | manager | pass |
| C4 assigned to Yoav (saved), back on the task | manager | pass |
| Q24 recurring task created from the add form (place, time, on) (then on /tasks) | manager | pass |
| Q2 the managers-only "משימות חוזרות" row at the bottom of Tasks lists it | manager | pass |
| Q24 the recurring task opens in the add form, with "פעילה" | manager | pass |
| Q24 recurring task edited (time saved) | manager | pass |
| Q24 recurring task switched off (saved) | manager | pass |
| places open from the Farm tab | manager | pass |
| L3 save a place from the current position opens L4 | manager | pass |
| L4 place saved with the position | manager | pass |
| P1 projects block shows above the tasks for a manager | manager | pass |
| P5 project created with two steps, P3 opens | manager | pass |
| M8 people directory renders | manager | pass |
| People ⋯ "תפקיד לפי כתובת מייל" opens Q27 | manager | pass |
| N13 role invite by e-mail saved (staff) | manager | pass |
| M9 manager blocks a guest (⋯ → חסימה) | manager | pass |
| M9 manager unblocks the guest | manager | pass |
| M9 a manager cannot block a volunteer (owner only) | manager | pass |
| Q26 message to the whole team sent (saved), back on People · הודעות (recipients 4) | manager | pass |
| M2 bulk approval: donation and both tickets paid | manager | pass |
| M2 approved items leave the queue (handled) | manager | pass |
| manager day: no console errors | dana | pass |
| B4 the message card shows on the volunteer root | volunteer | pass |
| B3 read receipt saved, card leaves | volunteer | pass |
| C1 the assignment reached the volunteer's notifications | volunteer | pass |
| volunteer reads: no console errors | yoav | pass |
| B3 the manager sees who read it (People · הודעות → the message) | manager | pass |
| C9 first entry opens for the invited person, names who added them | new volunteer | pass |
| C9 profile created with the invited role (staff) | new volunteer | pass |
| the new volunteer has the team app without the manage tab | new volunteer | pass |
| first entry: no console errors | noga | pass |
| M9 owner blocks a volunteer | owner | pass |
| M9 owner unblocks the volunteer | owner | pass |
| Q1 "כל הפעילות" row opens the activity feed | owner | pass |
| N14 activity feed lists the day, every line in Hebrew | owner | pass |
| Q1 "יומן אינסטינקט" row (owners only) opens the Instinct log | owner | pass |
| owner: no console errors | owner | pass |

Screenshots: [2-B4-volunteer-card](shots/2-B4-volunteer-card.jpg), [2-C4-assign](shots/2-C4-assign.jpg), [2-C9-first-entry](shots/2-C9-first-entry.jpg), [2-M2-payments](shots/2-M2-payments.jpg), [2-N14-activity](shots/2-N14-activity.jpg), [2-P3-project](shots/2-P3-project.jpg), [2-Q1-manage](shots/2-Q1-manage.jpg), [2-Q24-recurring-add](shots/2-Q24-recurring-add.jpg), [2-Q26-compose](shots/2-Q26-compose.jpg)

### 3 Event lifecycle with a vendor (51/51)

| Check | Role | Result |
|---|---|---|
| N11 event created and published, M4 opens | manager | pass |
| V4 crew staffed (gate, stall) | manager | pass |
| V1 vendor added to the pool, V2 opens | manager | pass |
| V2 invite to the event: record invited, access link sent in WhatsApp (/app/vendor/invite/NaIUXrMTw2wLCVlOnugB?k=55quvu2k7buh) | manager | pass |
| event setup: no console errors | dana | pass |
| vendor link claimed: profile bound to the stall | vendor | pass |
| D1 invitation shows after the claim | vendor | pass |
| D1 מגיעים opens D2 | vendor | pass |
| D2 arrival details saved (confirmed, needs, note) | vendor | pass |
| D3 home shows the confirmed event | vendor | pass |
| vendor sees 2 tabs only | vendor | pass |
| D8 helper added, link sent in WhatsApp | vendor | pass |
| vendor before the day: no console errors | raz | pass |
| helper link claimed: helper of the stall | helper | pass |
| D11 helper home | helper | pass |
| helper: no console errors | tamar | pass |
| U3 guest orders 2 tickets (pending), U4 opens (2 tickets) | guest | pass |
| guest marks the order paid (claimed, trust-based) | guest | pass |
| guest order: no console errors | michal | pass |
| N11 event date edited to today | manager | pass |
| the אירוע tab appears on event day for crew | volunteer (crew) | pass |
| E1 event home | volunteer (crew) | pass |
| E3 valid ticket: approved, first entry | volunteer (crew) | pass |
| E3 entry saved on the ticket | volunteer (crew) | pass |
| E3 the same ticket again: second entry, "יצא וחזר" | volunteer (crew) | pass |
| E5 unknown ticket: לא נמצא | volunteer (crew) | pass |
| E5 forged code: ברקוד לא תקין (שער · ערב קטיף בחווה / ברקוד לא תקין / מיכל בר / הקוד לא תואם את הכרטיס. / חיפוש בשם / לסרוק שוב) | volunteer (crew) | pass |
| gate: no console errors | yoav | pass |
| D5 event day for the vendor | vendor | pass |
| D5 "הגעתי לחווה" saved (arrivedAt) | vendor | pass |
| D6 live view after check-in | vendor | pass |
| D6 request "החשמל נפל" sent | vendor | pass |
| M2 the vendor request reaches the manager inbox | manager | pass |
| V7 vendors today lists the open request | manager | pass |
| V7 request handled (closed) | manager | pass |
| the vendor sees the request closed | vendor | pass |
| M2 a "נגמר לי משהו" request reads in Hebrew | manager | pass |
| vendor on the day: no console errors | raz | pass |
| Y5 gate cash counted (saved) | manager | pass |
| Y5 event closed, the summary opens | manager | pass |
| Y5 reopen window shown | manager | pass |
| Y5 reopened inside the window | manager | pass |
| Y5 closed again | manager | pass |
| M7 after-event summary for the manager | manager | pass |
| manager on the day: no console errors | dana | pass |
| after close the אירוע tab leaves the crew's phones | volunteer (crew) | pass |
| gate closed after the event | volunteer (crew) | pass |
| crew after close: no console errors | yoav | pass |
| D9 after-event summary for the vendor | vendor | pass |
| D9 vendor feedback saved | vendor | pass |
| vendor after the event: no console errors | raz | pass |

Screenshots: [3-D1-invite](shots/3-D1-invite.jpg), [3-D2-needs](shots/3-D2-needs.jpg), [3-D5-vendor-day](shots/3-D5-vendor-day.jpg), [3-D6-vendor-request](shots/3-D6-vendor-request.jpg), [3-D9-vendor-summary](shots/3-D9-vendor-summary.jpg), [3-E1-event-home](shots/3-E1-event-home.jpg), [3-E3-scan-valid](shots/3-E3-scan-valid.jpg), [3-E5-scan-unknown](shots/3-E5-scan-unknown.jpg), [3-M7-summary](shots/3-M7-summary.jpg), [3-V4-staffing](shots/3-V4-staffing.jpg), [3-V7-vendors-today](shots/3-V7-vendors-today.jpg), [3-Y5-close](shots/3-Y5-close.jpg)

### 4 Role boundaries (51/51)

| Check | Role | Result |
|---|---|---|
| volunteer opening /manage is sent to /tasks | volunteer | pass |
| volunteer opening /manage/people is sent to /tasks | volunteer | pass |
| volunteer opening /manage/people?tab=messages is sent to /tasks | volunteer | pass |
| volunteer opening /manage/people/invite is sent to /tasks | volunteer | pass |
| volunteer opening /projects is sent to /tasks | volunteer | pass |
| volunteer opening /manage/recurring is sent to /tasks | volunteer | pass |
| volunteer opening /manage/recurring/new is sent to /tasks | volunteer | pass |
| volunteer opening /manage/events is sent to /tasks | volunteer | pass |
| volunteer opening /manage/activity is sent to /tasks | volunteer | pass |
| volunteer has no manage tab | volunteer | pass |
| volunteer: no "משימות חוזרות" row on Tasks (managers only) | volunteer | pass |
| volunteer: the add form has no "חוזרת" chip | volunteer | pass |
| volunteer redirects: no console errors | yoav | pass |
| manager opening the Instinct log is sent away (owners only) (/tasks) | manager | pass |
| manager redirect: no console errors | dana | pass |
| rules refuse a volunteer writing settings/app | volunteer | pass |
| rules refuse a volunteer writing a recurring template | volunteer | pass |
| rules refuse a volunteer making himself a manager | volunteer | pass |
| rules refuse a volunteer reading a guest profile | volunteer | pass |
| rules refuse a volunteer reading a managers-only task | volunteer | pass |
| rules refuse a volunteer reading the manager inbox | volunteer | pass |
| rules refuse a volunteer reading a project | volunteer | pass |
| vendor opening /tasks is sent to /vendor | vendor | pass |
| vendor opening /manage is sent to /vendor | vendor | pass |
| vendor opening /shopping is sent to /vendor | vendor | pass |
| vendor opening /farm is sent to /vendor | vendor | pass |
| vendor opening /manage/vendors is sent to /vendor | vendor | pass |
| vendor nav: 2 tabs only | vendor | pass |
| vendor redirects: no console errors | raz | pass |
| rules refuse a vendor reading a team profile | vendor | pass |
| rules refuse a vendor reading tasks | vendor | pass |
| rules refuse a vendor reading the team notes on the stall | vendor | pass |
| the vendor reads its own stall | vendor | pass |
| helper: stall is read-only (no edit, no adding helpers) | helper | pass |
| helper opening the add-helper form is sent back to the stall | helper | pass |
| helper limits: no console errors | tamar | pass |
| rules refuse a helper editing the stall | helper | pass |
| pending account gets the guest app, not the team screens | pending | pass |
| pending: no console errors | yossi | pass |
| rules refuse a pending account reading tasks | pending | pass |
| X2 suspended screen for a blocked account | blocked | pass |
| X2 on every route | blocked | pass |
| blocked: no console errors | avi | pass |
| rules refuse a blocked account reading tasks | blocked | pass |
| guest opening /tasks sees the guest home | guest | pass |
| guest opening /manage sees the guest home | guest | pass |
| guest opening /shopping sees the guest home | guest | pass |
| guest opening /farm sees the guest home | guest | pass |
| guest: no console errors | michal | pass |
| rules refuse a guest reading tasks | guest | pass |
| rules refuse a guest writing shopping | guest | pass |

Screenshots: [4-X2-suspended](shots/4-X2-suspended.jpg), [4-guest-no-team](shots/4-guest-no-team.jpg), [4-vendor-two-tabs](shots/4-vendor-two-tabs.jpg)

### 5 Offline (9/9)

| Check | Role | Result |
|---|---|---|
| C8 offline strip shows | volunteer | pass |
| C8 strip counts the kept writes (אין קליטה. 6 פעולות שמורות בטלפון) | volunteer | pass |
| C8 queue screen lists what waits | volunteer | pass |
| nothing reached the server while offline | volunteer | pass |
| back online: take, done and the new item sync to the server | volunteer | pass |
| C8 strip leaves when the network is back | volunteer | pass |
| after reload the taken task is still mine (next up) | volunteer | pass |
| after reload the item added offline is on the list | volunteer | pass |
| offline: no console errors | orly | pass |

Screenshots: [5-C8-offline-queue](shots/5-C8-offline-queue.jpg), [5-C8-offline-strip](shots/5-C8-offline-strip.jpg)

### 6 Refused write (9/9)

| Check | Role | Result |
|---|---|---|
| same free task taken at the same time: exactly one wins (אורלי won) | volunteer x2 | pass |
| X1 toast for the loser names who took it (לא נשמר. אורלי לקחה את המשימה לפני רגע) | volunteer | pass |
| nothing breaks: the loser's list reloads with the task on the winner | volunteer | pass |
| online teammate takes it first | volunteer | pass |
| X1 after sync: the queued take is refused by the rules and the toast says so (לא נשמר. אין הרשאה לפעולה הזו) | volunteer | pass |
| the server keeps the first taker | volunteer | pass |
| the app carries on after the refusal | volunteer | pass |
| race winner/loser a: no console errors | yoav | pass |
| race loser b: no console errors | orly | pass |

Screenshots: [6-X1-refused-after-sync](shots/6-X1-refused-after-sync.jpg), [6-X1-refused-take](shots/6-X1-refused-take.jpg)

### 7 Demo mode (41/41)

| Check | Role | Result |
|---|---|---|
| boots: owner · regular (4 tabs) | demo | pass |
| boots: owner · eventDay (5 tabs) | demo | pass |
| boots: owner · afterEvent (5 tabs) | demo | pass |
| boots: manager · regular (4 tabs) | demo | pass |
| boots: manager · eventDay (5 tabs) | demo | pass |
| boots: manager · afterEvent (5 tabs) | demo | pass |
| boots: staff · regular (3 tabs) | demo | pass |
| boots: staff · eventDay (4 tabs) | demo | pass |
| boots: staff · afterEvent (4 tabs) | demo | pass |
| boots: vendor · regular (2 tabs) | demo | pass |
| boots: vendor · eventDay (2 tabs) | demo | pass |
| boots: vendor · afterEvent (2 tabs) | demo | pass |
| boots: guest · regular (3 tabs) | demo | pass |
| boots: guest · eventDay (3 tabs) | demo | pass |
| boots: guest · afterEvent (3 tabs) | demo | pass |
| boots: new · regular | demo | pass |
| boots: new · eventDay | demo | pass |
| boots: new · afterEvent | demo | pass |
| boots: blocked · regular | demo | pass |
| boots: blocked · eventDay | demo | pass |
| boots: blocked · afterEvent | demo | pass |
| boots: helper · regular (2 tabs) | demo | pass |
| boots: helper · eventDay (2 tabs) | demo | pass |
| boots: helper · afterEvent (2 tabs) | demo | pass |
| Z1 start page | demo | pass |
| Z1 "כניסה להדגמה" enters as the chosen persona | demo | pass |
| Z3 sheet opens from the strip | demo | pass |
| Z3 switches persona (manager, with the manage tab) | demo | pass |
| Z3 switches the day (event day adds the event tab) | demo | pass |
| reset restores the seed (a demo edit survives a reload, then is gone after reset) (added true kept true toast true) | demo | pass |
| trigger "אין קליטה": the C8 strip shows | demo | pass |
| trigger "אין קליטה" off: the strip leaves | demo | pass |
| trigger "הפעולה הבאה לא תישמר": the next take shows X1 (לא נשמר. נועה לקחה את המשימה לפני רגע) | demo | pass |
| trigger "רשימות ריקות": "רק שלי" shows everything of mine done (L5) | demo | pass |
| trigger "רשימות ריקות": the shopping list is empty (S3) | demo | pass |
| trigger "רשימות ריקות" off: the list is back | demo | pass |
| trigger "כניסה ראשונה" opens C9 | demo | pass |
| trigger "חשבון מושעה" opens X2 | demo | pass |
| trigger helper opens the helper's vendor screens | demo | pass |
| "יציאה" leaves demo to the start page | demo | pass |
| demo sheet and triggers: no console errors | signed-out | pass |

Screenshots: [7-Z3-demo-sheet](shots/7-Z3-demo-sheet.jpg), [7-Z3-trigger-empty-tasks](shots/7-Z3-trigger-empty-tasks.jpg), [7-Z3-trigger-offline](shots/7-Z3-trigger-offline.jpg), [7-Z3-trigger-refuse](shots/7-Z3-trigger-refuse.jpg), [7-demo-owner-regular](shots/7-demo-owner-regular.jpg), [7-demo-staff-eventDay](shots/7-demo-staff-eventDay.jpg), [7-demo-vendor-eventDay](shots/7-demo-vendor-eventDay.jpg)

### 8 Guest side (U1-U14) (31/31)

| Check | Role | Result |
|---|---|---|
| U1 signed out: home lists the upcoming event and the tiles | signed-out | pass |
| U2 event page with price and "הזמנת כרטיסים" | signed-out | pass |
| U3 the order opens signed out, with the sign-in note on the bar | signed-out | pass |
| U3 ordering signed out goes to the Google sign-in first (the Auth emulator's page) (http://localhost:9099/emulator/auth/handler?apiKey=AIzaSyCeQ) | signed-out | pass |
| U5 "הכרטיסים שלי" signed out invites to sign in | signed-out | pass |
| U12 sign-in page: Google and the quiet demo link | signed-out | pass |
| signed-out guest: no console errors | signed-out | pass |
| U13 first sign-in opens the sign-up form | new guest | pass |
| U13 sign-up creates a guest profile (agreed to updates) and opens the guest home ({"role":"guest","phone":"0541234567","optIn":true}) | new guest | pass |
| U3 order: 2 tickets created, pending, the second in the companion's name | new guest | pass |
| U3 the confirmation choice (e-mail) is kept on the profile | new guest | pass |
| U4 the pay page opens with the amount | new guest | pass |
| U4 "העברתי" marks the order paid (claimed) | new guest | pass |
| the managers' inbox gets the payment claim | new guest | pass |
| U5 "הכרטיסים שלי" shows the ticket with its QR | new guest | pass |
| U2 free event: "חינם, בהרשמה" and "הרשמה" (רביעי, 2 בדצמבר · 04:47 עד 07:47 / סדנת הרכבה בחווה / בית / איפה / חוות רווה / ניווט / מחיר / חינם, בהרשמה / כמה / עד 4 כרטיסים בהזמנה / סדנה פתוחה לכל המשפחה. ) | new guest | pass |
| U3 registration creates a free ticket | new guest | pass |
| U8 visit request sent (new, 4 people) (/me/visits/mj5asQOroZSDyTO5ZTPq) | new guest | pass |
| U9 donation 250 with a memorial (pending) | new guest | pass |
| U9 donation "העברתי" (claimed) | new guest | pass |
| U7 the stall account shows on the account page | new guest | pass |
| U10 the stall account page lists what was taken | new guest | pass |
| U10 stall account "העברתי" (claimed) | new guest | pass |
| U7 account page lists tickets, donation and the stall account, "הכל · 5" | new guest | pass |
| U7 account page: the profile, "עריכת פרטים" and the e-mail confirmation choice (אישור תשלום נשלח אליי במייל) | new guest | pass |
| U7 "הכל" lists the five, the visit among them | new guest | pass |
| U11 contact message reaches the managers' inbox | new guest | pass |
| new guest flows: no console errors | rotem | pass |
| existing guest: her tickets are on "הכרטיסים שלי" | guest | pass |
| existing guest: her visit and donation are on her account | guest | pass |
| existing guest: no console errors | michal | pass |

Screenshots: [8-U1-home-signed-out](shots/8-U1-home-signed-out.jpg), [8-U10-stall](shots/8-U10-stall.jpg), [8-U13-signup](shots/8-U13-signup.jpg), [8-U2-event-page](shots/8-U2-event-page.jpg), [8-U3-order](shots/8-U3-order.jpg), [8-U4-pay](shots/8-U4-pay.jpg), [8-U5-tickets](shots/8-U5-tickets.jpg), [8-U7-account](shots/8-U7-account.jpg), [8-U8-visit-sent](shots/8-U8-visit-sent.jpg), [8-U9-donation-thanks](shots/8-U9-donation-thanks.jpg)

### 9 Messages to every audience (30/30)

| Check | Role | Result |
|---|---|---|
| F presence: Orly marks today at the farm | volunteer | pass |
| presence: no console errors | orly | pass |
| the next event has a crew (Yoav) and an invited stall (סדנת הרכבה בחווה) | manager | pass |
| Q26 sent to "כל הצוות": the recipients are exactly that audience (כל הצוות · 5 → 5 (שליחה ל־5 אנשים)) | manager | pass |
| read as team member (volunteer): the card shows, "קראתי" saves the receipt (בדיקה לכל הצוות) | team member (volunteer) | pass |
| read as team member (volunteer): no console errors | noga | pass |
| Q26 sent to "בחווה היום": the recipients are exactly that audience (בחווה היום · 1 → 1 (שליחה לאדם אחד)) | manager | pass |
| read as team member at the farm today: the card shows, "קראתי" saves the receipt (למי שבחווה היום) | team member at the farm today | pass |
| read as team member at the farm today: no console errors | orly | pass |
| Q26 sent to "מנהלים": the recipients are exactly that audience (מנהלים · 2 → 2 (שליחה ל־2 אנשים)) | manager | pass |
| read as manager (owner): the card shows, "קראתי" saves the receipt (למנהלים) | manager (owner) | pass |
| read as manager (owner): no console errors | owner | pass |
| Q26 sent to "צוות האירוע": the recipients are exactly that audience (צוות האירוע · 1 → 1 (שליחה לאדם אחד)) | manager | pass |
| read as event crew (volunteer): the card shows, "קראתי" saves the receipt (לצוות האירוע) | event crew (volunteer) | pass |
| read as event crew (volunteer): no console errors | yoav | pass |
| Q26 sent to "בעלי דוכנים": the recipients are exactly that audience (בעלי דוכנים · 2 → 2 (שליחה ל־2 אנשים)) | manager | pass |
| read as stall owner: the card shows, "קראתי" saves the receipt (לבעלי הדוכנים) | stall owner | pass |
| read as stall owner: no console errors | raz | pass |
| Q26 sent to "נרשמי פסטיבל החורף": the recipients are exactly that audience (נרשמי פסטיבל החורף · 2 → 2 (שליחה ל־2 הזמנות)) | manager | pass |
| read as registrant guest: the card shows, "ראיתי" saves the receipt (לנרשמי פסטיבל החורף) | registrant guest | pass |
| read as registrant guest: no console errors | michal | pass |
| Q26 sent to "כל המשתמשים": the recipients are exactly that audience (כל המשתמשים · 1 → 1 (שליחה לאדם אחד)) | manager | pass |
| read as opted-in guest: the card shows on home, "ראיתי" saves the receipt | opted-in guest | pass |
| U14 the guest's messages list both messages to her | opted-in guest | pass |
| opted-in guest: no console errors | rotem | pass |
| opted-out guest: the all-users message does not reach her (not a recipient, not on home, not in her messages) | opted-out guest | pass |
| opted-out guest: no console errors | michal | pass |
| Q25 filter "לאורחים ולכולם" shows only the messages outside the team | manager | pass |
| Q25 the registrants' message: tag "נרשמי פסטיבל החורף", "ראו 1 מתוך 2" (נרשמי פסטיבל החורף / לנרשמי פסטיבל החורף: החניה בשער הצפוני. / דנה · היום 04:48 / ראו 1 מתוך 2) | manager | pass |
| messages: no console errors | dana | pass |

Screenshots: [9-Q25-messages-outside](shots/9-Q25-messages-outside.jpg), [9-Q26-farmToday](shots/9-Q26-farmToday.jpg), [9-Q26-registrants](shots/9-Q26-registrants.jpg), [9-U1-guest-message](shots/9-U1-guest-message.jpg)

### 10 Adding someone ahead by phone (Q27) (15/15)

| Check | Role | Result |
|---|---|---|
| People ⋯ "להוסיף מישהו מראש" opens Q27 on "לפי טלפון" | owner | pass |
| Q27 by phone: the link is saved (manager, open) and sent in WhatsApp (/app/login?k=t-qfcxhd3iwd5frh) | owner | pass |
| Q27 the pending list shows the person added by phone | owner | pass |
| Q27 "ביטול" removes the second link (row and link gone) | owner | pass |
| add ahead: no console errors | owner | pass |
| C9 a new account through the link sees the invitation ("אליה הוסיף אותך כמנהל") | new account | pass |
| the link is claimed once: the account becomes a manager, the link is marked used ({"role":"manager","usedBy":true}) | new account | pass |
| the new manager has the manage tab | new account | pass |
| link claimed: no console errors | gal | pass |
| a second account opening the used link is refused ("הקישור כבר לא בתוקף") | second account | pass |
| "המשך" goes on as a guest sign-up; no role, the link stays with the first account | second account | pass |
| second account: no console errors | shir | pass |
| a guest opening the cancelled link is refused | guest | pass |
| the guest stays a guest | guest | pass |
| cancelled link: no console errors | lior | pass |

Screenshots: [10-C9-link](shots/10-C9-link.jpg), [10-Q27-pending](shots/10-Q27-pending.jpg), [10-link-cancelled](shots/10-link-cancelled.jpg), [10-link-used](shots/10-link-used.jpg)

### 11 Payment approval and the confirmation (Q7) (11/11)

| Check | Role | Result |
|---|---|---|
| Q7 opens after the approval: WhatsApp and none (she chose WhatsApp) (התשלום אושר / לשלוח למיכל אישור שקיבלנו? / אישור בוואטסאפ / נפתחת הודעה מוכנה, שולחים בעצמך / בלי אישור / רק לסמן ששולם / שלום מיכל בר, קיבל) | manager | pass |
| WhatsApp: the order is paid and the confirmation is recorded | manager | pass |
| WhatsApp: the wa.me request (with the amount) was aborted by the safety block (https://wa.me/972520000017?text=שלום מיכל בר, קיבלנו את התשלום בסך 80 ₪ עבור כרטיסים לאירו) | runner | pass |
| Q7 for an e-mail guest: "אישור במייל" offered and chosen (התשלום אושר / לשלוח לרותם אישור שקיבלנו? / אישור בוואטסאפ / נפתחת הודעה מוכנה, שולחים בעצמך / אישור במייל / נשלח לבד תוך כמה דקות / בלי אישו) | manager | pass |
| e-mail: paid with paidAt and no manual mark, so the Worker sends it (its scan queues email_outbox/donation_<id>); nothing opened (paidAt 2026-11-23T02:49:06.021Z) | manager | pass |
| e-mail: the app writes no outbox job itself (the Worker does, not run on the emulators) | manager | pass |
| none: the order is paid; for an e-mail guest "בלי אישור" records a manual confirmation so no e-mail goes out | manager | pass |
| none: nothing opened | manager | pass |
| payments: no console errors | dana | pass |
| the guest sees the donation and the order paid ("שולם") | guest | pass |
| guest after approval: no console errors | rotem | pass |

Screenshots: [11-Q7-email](shots/11-Q7-email.jpg), [11-Q7-none](shots/11-Q7-none.jpg), [11-Q7-whatsapp](shots/11-Q7-whatsapp.jpg)

### 12 Delete through ⋯ (one of each) (17/17)

| Check | Role | Result |
|---|---|---|
| task: ⋯ → מחיקה → "למחוק את המשימה?" → deleted | owner | pass |
| recurring task: ⋯ → מחיקה → "למחוק את המשימה החוזרת?" → deleted | owner | pass |
| project: ⋯ → מחיקה → "למחוק את הפרויקט?" → deleted | owner | pass |
| shopping item: ⋯ → מחיקה → "למחוק מהרשימה?" → deleted | owner | pass |
| place: ⋯ → מחיקה → "למחוק את המקום?" → deleted | owner | pass |
| calendar item: ⋯ → מחיקה → "למחוק מהיומן?" → deleted | owner | pass |
| event: ⋯ → מחיקה → "למחוק את האירוע?" → deleted | owner | pass |
| product: ⋯ → מחיקה → "למחוק את המוצר?" → deleted | owner | pass |
| vendor: ⋯ → מחיקה → "למחוק את בעל הדוכן?" → deleted | owner | pass |
| visit: ⋯ → מחיקה → "למחוק את הבקשה?" → deleted | owner | pass |
| donation: ⋯ → מחיקה → "למחוק את התרומה?" → deleted | owner | pass |
| person: ⋯ → מחיקה → "למחוק את אבי שטרן?" → deleted | owner | pass |
| message: ⋯ → מחיקה → "למחוק את ההודעה?" → deleted | owner | pass |
| deletes (owner): no console errors | owner | pass |
| presence: ⋯ → מחיקה → "להסיר מהיומן?" → removed (להסיר מהיומן? / היום הזה יוסר מהיומן של הצוות. / הסרה / ביטול) | volunteer | pass |
| presence delete: no console errors | orly | pass |
| non-localhost requests: 29, all aborted (Google hosts among them: 21) | runner | pass |

Screenshots: [12-message-deleted](shots/12-message-deleted.jpg), [12-task-deleted](shots/12-task-deleted.jpg)

## Aborted requests (final cycle)

29 requests to hosts other than localhost, all aborted by the block, none reached the network:

| Count | Request | Where it came from |
|---|---|---|
| 18 | `www.google.com/images/cleardot.gif` | the Firestore SDK checking for a connection while offline (items 5 and 6) |
| 2 | `wa.me/972527778899` | V2 "הזמנה לאירוע": the stall's invitation with its access link (item 3; item 9 invites the stall to the next event) |
| 1 | `wa.me/972521234567` | D8 the helper's link (item 3) |
| 1 | `wa.me/972525551212` | Q27 by phone: Gal's one-time link (item 10) |
| 1 | `wa.me/972525553434` | Q27 by phone: Lior's link, cancelled afterwards (item 10) |
| 1 | `wa.me/972520000017` | Q7 "שליחה בוואטסאפ": Michal's payment confirmation with the amount (item 11) |
| 2 | `unpkg.com/material-components-web@10/...` | the Auth emulator's own sign-in page, opened by "הזמנה" signed out (item 8) |
| 2 | `fonts.googleapis.com/icon`, `/css2` | the same Auth emulator page |
| 1 | `apis.google.com/js/api.js` | the same Auth emulator page |

## Checks that are not automated here

- The e-mail itself: Q7 "שליחה במייל" only stamps `paidAt` and leaves no manual mark; the Worker's cron scan (`api/src/email.ts`) creates `email_outbox/donation_<id>` and sends through Brevo. The Worker does not run on the emulators, so the cycle checks the recorded state (paid, `paidAt`, no `paymentConfirmation`, no outbox job written by the app) and that "בלי אישור" for an e-mail guest records the manual mark that stops the Worker. The Worker's side is covered by `tests/api.mjs` against a mock Brevo.
- Push on the lock screen (messages, assignments): the emulators run no Worker and no push service; the cycle checks the in-app card, the notification document and the read receipt.
- WhatsApp: the `wa.me` requests are aborted on purpose; the cycle checks the link and text the app built, and what it recorded.
- The real Google sign-in redirect: replaced by the REST sign-in described above. "הזמנה" signed out is checked up to the Auth emulator's page.
- The first-visit demo (PR #24): switched off per account in this cycle, covered by `tests/demo-intro.mjs`.

## Rounds

**Round 1** (the redesign cycle run unchanged on `tidy/placement`, then each item moved to the tidy placements and run item by item, then items 9 to 12 written and run): the failures were script errors from the moves (the table above) and the first-visit demo opening every account in demo, plus two app defects:

| Defect | Fix |
|---|---|
| A React warning on Tasks for anyone with project steps ("The final argument passed to useMemo changed size between renders"): `useMySteps` spread every step into the memo's dependency list, so the list changed length as steps arrived | 1fd3888 `src/app/v2/data/projects.ts`: one dependency per project slot (fixed length) |
| M5 נרשמים, its order sheet, Q12 and N12 tagged every claimed payment "סימן שהעביר", also for women (Q4, Q6, Q13 and the Q12 design follow the person: "סימנה שהעבירה") | 1fd3888 `src/app/v2/screens/events/event.tsx`, `tabs.tsx`, `tab.tsx`: `gw(name, …)` |

After the fixes: `npx tsc --noEmit -p .` clean, `node tests/v2-events.mjs` 18/18, `node tests/v2-projects.mjs` pass.

**Round 2**: the whole cycle, items 1 to 12, from a fresh seed after the last fix. No defects, no console errors (tables above).

## Notes (not defects)

- The seed's owner is "אליה כהן"; the app's name list reads אליה as a man's name, so C9 says "אליה הוסיף אותך כמנהל" (the seed's `gender` is not written into profiles).
- "כל המשתמשים" reaches only people who turned on "לקבל עדכונים מהחווה" (`updatesOptIn`, open decision: opt-in only). Rotem turned it on at sign-up and got the message; Michal did not and did not get it, though she got the registrants' message of the event she holds tickets for.
- "צוות האירוע" and "בעלי דוכנים" refer to the next open event (here the free workshop added in item 8), not to a chosen one.
- A shopping item is deleted 6 seconds after the confirmation (its undo window), the other entities at once.
- A second account opening a used link sees "הקישור כבר לא בתוקף" and "המשך" goes on to the guest sign-up; a guest who opens a cancelled link sees "לא הצלחנו לצרף אותך לצוות" and stays a guest.
