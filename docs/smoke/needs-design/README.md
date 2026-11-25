# Smoke cycle: the "needs a design" round on the emulators

End-to-end smoke of the needs-design round (`havat-raveh-fill/PROMPT.md`, the twelve decisions) as every role, on local
Firebase emulators. Branch `tidy/nd-smoke`, cut from `tidy/needs-design` at cc81e6d. Run 2026-11-23 by a separate verifier.
It is the tidy cycle (`docs/smoke/tidy/README.md`), items 1 to 12, with the round's flows added to the items they belong to,
item 13 rebuilt on new accounts, and a new item 14.

> **Final run: commit 65a807a, 393 of 393 checks passed, no console errors in any session, 31 non-localhost
> requests, all aborted.** No app defect was found, so no app fix was made: the two full runs with the extended
> cycle (on the working tree, then on the committed scripts) both passed every check.

## Environment

As in the tidy cycle:

- Emulators: `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npx firebase emulators:start --only firestore,auth --project demo-havat-ravve` (Firestore 8080, Auth 9099).
- App: `PORT=5237 node scripts/dev.mjs` on `http://localhost:5237`. Every URL carries `?emulator`.
- Browser: Playwright Chromium, 390x844 at 2x, `he-IL`, `Asia/Jerusalem`, service workers blocked. Every context aborts every request to a host that is not localhost. Nothing was deployed and nothing ran against production.
- Data: `scripts/smoke-seed.mjs` wipes both emulators and writes 16 accounts. New in this round: `adi` (a volunteer invited by e-mail in item 13) and `ella` (a guest who signs up in item 13), both with no profile, and the farm's contact numbers in `settings/app` (U15's "וואטסאפ לחווה" needs them).
- Run: `node scripts/smoke-seed.mjs && SHOTS=docs/smoke/needs-design/shots BASE=http://localhost:5237 node scripts/smoke-cycle.mjs`. Results go to `.build/smoke/results.json`.

## What the round added to the cycle

| Decision | Item | What it checks |
|---|---|---|
| 1 Install strip | 2 | C10 opens right after C9, as its own screen; "אחר כך" goes on to `/tasks`; not offered again on four screens; still reachable from the profile row "התקנה למסך הבית" (added by the shell builder, unchanged here) |
| 1 Install strip | 14 (new) | No strip, no banner and no X ("סגירת הזמנת התקנה") on 45 screens: owner 13, manager 10, volunteer 6, vendor 3, guest 8, signed out 5 |
| 2 W1 contact message | 8 | After Rotem's U11 message: the inbox card has no X and no link to the sender; tapping it opens `/manage/inbox/:id` with the text, the sender row, WhatsApp and call; delete in ⋯; WhatsApp goes to the sender's phone; the sender row opens the person file; "טופל" saves `handled` and goes back to the inbox; reopened, it shows who closed it and "החזרה לתור" |
| 3 W2 stall request | 3 | The vendor's "החשמל נפל": D6 reads "נשלח למנהלים"; the inbox card opens W2 (open tag, stall and sender rows, "עוד אף אחד", delete in ⋯, "טופל" and "אני על זה"); "אני על זה" saves `takenBy`/`takenAt` and leaves it open; D6 reads "דנה בדרך אליך"; V7 lists "דנה לקחה" and its row opens the same W2 (back to "הדוכנים היום"); "טופל" saves `closedAt`/`closedBy` and goes back to V7; D6 shows no status line. The second request ("נגמר לי משהו") is still closed by V7's row "טופל" |
| 5 Q4 chip | 8 | With one donation waiting the chip reads "לאישור · 250 ₪"; after Michal's report "לאישור · 2 · 370 ₪"; no "ממתין" tile. The expected text is computed from the emulator data |
| 9 W4 demo per role | 13 | W4 opens from Settings with the defaults (vendors off); the owner turns volunteers off (saved as `demoIntro.staff = false`); a new volunteer (`adi`, invited by e-mail, C9, C10 "אחר כך") lands on `/tasks` with no demo, and none on the next opening; an existing volunteer on a new browser gets none; a new guest (`ella`, U13 sign-up) still opens in demo ("מחובר כאורחת"); the switch goes back on |
| 10 U15 / U16 | 8 | Michal opens her visit request from "מה יש לי בחווה": details, "מחכה לתשובה", the three steps (first done), ⋯ holding only "ביטול הבקשה", "וואטסאפ לחווה" to the farm's number. She donates 120, leaves the thanks screen unpaid, opens the donation from the account: the amber pay block ("נשאר לשלם", Bit), "העברתי את התשלום" saves `claimed` and the block reads "סימנת שהעברת · מחכה לאישור". A manager then sees "120 ₪ · מיכל בר", "סימנה שהעבירה", with "אישור תשלום" |
| 12 G5 phone link | 10 | After Q27 by phone: G5 (`/manage/settings/managers`) lists the pending manager link with "מנהל · לפי טלפון · הקישור נשלח היום" and not the volunteer's; its "ביטול" removes the link and the row, the other stays |

Decisions 4, 6, 7, 8 and 11 add no flow to the smoke cycle (no change, or screens without a write that the cycle exercises); they are covered by the walk.

## Test changes that were not about the round

- Item 3 "D6 live view after check-in" failed in the baseline run (the unchanged cycle, 345/346) because the event runs 17:00-23:00 today and the run started after 20:00, when D6 shows the live count instead of "הגעתם ב־". The check now accepts either view and notes which one it saw. A test issue, not an app defect.
- Item 11 picked "the first card of מיכל בר with אישור תשלום"; Michal's new donation (item 8) is now such a card too, so it filters on the event's title.

## Final run

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

### 2 Manager day (45/45)

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
| C10 is offered right after the first entry, as its own screen | new volunteer | pass |
| C10 "אחר כך" goes on into the app | new volunteer | pass |
| no install strip on /tasks, and C10 is not offered again | new volunteer | pass |
| no install strip on /shopping, and C10 is not offered again | new volunteer | pass |
| no install strip on /farm, and C10 is not offered again | new volunteer | pass |
| no install strip on /me, and C10 is not offered again | new volunteer | pass |
| installing stays reachable from the profile row "התקנה למסך הבית" | new volunteer | pass |
| the new volunteer has the team app without the manage tab | new volunteer | pass |
| first entry: no console errors | noga | pass |
| M9 owner blocks a volunteer | owner | pass |
| M9 owner unblocks the volunteer | owner | pass |
| Q1 "כל הפעילות" row opens the activity feed | owner | pass |
| N14 activity feed lists the day, every line in Hebrew | owner | pass |
| Q1 "יומן אינסטינקט" row (owners only) opens the Instinct log | owner | pass |
| owner: no console errors | owner | pass |

Screenshots: [2-B4-volunteer-card](shots/2-B4-volunteer-card.jpg), [2-C10-after-C9](shots/2-C10-after-C9.jpg), [2-C4-assign](shots/2-C4-assign.jpg), [2-C9-first-entry](shots/2-C9-first-entry.jpg), [2-M2-payments](shots/2-M2-payments.jpg), [2-N14-activity](shots/2-N14-activity.jpg), [2-P3-project](shots/2-P3-project.jpg), [2-Q1-manage](shots/2-Q1-manage.jpg), [2-Q24-recurring-add](shots/2-Q24-recurring-add.jpg), [2-Q26-compose](shots/2-Q26-compose.jpg)

### 3 Event lifecycle with a vendor (58/58)

| Check | Role | Result |
|---|---|---|
| N11 event created and published, M4 opens | manager | pass |
| V4 crew staffed (gate, stall) | manager | pass |
| V1 vendor added to the pool, V2 opens | manager | pass |
| V2 invite to the event: record invited, access link sent in WhatsApp (/app/vendor/invite/dmlojWi7fdsYPsf3o1TM?k=59jt2fi32t68) | manager | pass |
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
| D6 live view after check-in (event open) | vendor | pass |
| D6 request "החשמל נפל" sent | vendor | pass |
| D6 state 1: the open request reads "נשלח למנהלים" | vendor | pass |
| M2 the vendor request reaches the manager inbox | manager | pass |
| W2 the inbox card opens the request: open tag, the stall and the sender as rows, nobody handling yet (/manage/inbox/stall/dmlojWi7fdsYPsf3o1TM/qww2IIYfbZyUuVuvATYE) | manager | pass |
| W2 bottom bar "טופל" and "אני על זה", delete in ⋯ (בקשה מדוכן · עוד פעולות / מחיקה) | manager | pass |
| W2 "אני על זה" saves who handles it (takenBy, takenAt), the request stays open | manager | pass |
| D6 state 2: the vendor sees "דנה בדרך אליך" | vendor | pass |
| V7 vendors today lists the open request, "דנה לקחה" | manager | pass |
| W2 opens from V7 too, back to "הדוכנים היום" (/manage/events/dmlojWi7fdsYPsf3o1TM/vendors/today/qww2IIYfbZyUuVuvATYE) | manager | pass |
| W2 "טופל" closes the request and goes back to V7 (/manage/events/dmlojWi7fdsYPsf3o1TM/vendors/today) | manager | pass |
| D6 state 3: the vendor sees the request closed (no status line) | vendor | pass |
| M2 a "נגמר לי משהו" request reads in Hebrew | manager | pass |
| V7 the row's "טופל" closes the second request | manager | pass |
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

Screenshots: [3-D1-invite](shots/3-D1-invite.jpg), [3-D2-needs](shots/3-D2-needs.jpg), [3-D5-vendor-day](shots/3-D5-vendor-day.jpg), [3-D6-on-the-way](shots/3-D6-on-the-way.jpg), [3-D6-vendor-request](shots/3-D6-vendor-request.jpg), [3-D9-vendor-summary](shots/3-D9-vendor-summary.jpg), [3-E1-event-home](shots/3-E1-event-home.jpg), [3-E3-scan-valid](shots/3-E3-scan-valid.jpg), [3-E5-scan-unknown](shots/3-E5-scan-unknown.jpg), [3-M7-summary](shots/3-M7-summary.jpg), [3-V4-staffing](shots/3-V4-staffing.jpg), [3-V7-vendors-today](shots/3-V7-vendors-today.jpg), [3-W2-stall-request](shots/3-W2-stall-request.jpg), [3-Y5-close](shots/3-Y5-close.jpg)

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
| same free task taken at the same time: exactly one wins (יואב won) | volunteer x2 | pass |
| X1 toast for the loser names who took it (לא נשמר. יואב לקח את המשימה לפני רגע) | volunteer | pass |
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

### 8 Guest side (U1-U14) (50/50)

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
| U2 free event: "חינם, בהרשמה" and "הרשמה" (רביעי, 2 בדצמבר · 21:12 / סדנת הרכבה בחווה / בית / איפה / חוות רווה / ניווט / מחיר / חינם, בהרשמה / כמה / עד 4 כרטיסים ב) | new guest | pass |
| U3 registration creates a free ticket | new guest | pass |
| U8 visit request sent (new, 4 people) (/me/visits/at3gY6jtKqX5zdwHpHZn) | new guest | pass |
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
| M2 the contact card has no X and no inline link to the sender (פנייה · לפני 0 דקותחניה לאוטובוסרותם אברהם · אפשר להגיע עם אוטובוס של 50 מקומות? / מענה בוואטסאפ / התקשרות / טופל) | manager | pass |
| W1 the card opens the message: text, the sender row, WhatsApp and call (/manage/inbox/Bf6PdTCwQ6SXNGEMrpED) | manager | pass |
| W1 delete is in ⋯ | manager | pass |
| W1 "מענה בוואטסאפ" opens WhatsApp to the sender's phone (https://wa.me/972541234567?text=%D7%A9%D7%9C%D7%95%D7%9D%20%) | manager | pass |
| W1 the sender row opens their person file (/manage/people/hFI2u8VmYljS4k3nxZG8aSF8gb1g) | manager | pass |
| W1 "טופל" closes the message and goes back to the inbox (/manage/inbox) | manager | pass |
| W1 the handled message shows who closed it and "החזרה לתור" | manager | pass |
| Q4 one donation waiting: the chip reads "לאישור · 250 ₪" (לאישור · 250 ₪) | manager | pass |
| W1 contact message: no console errors | dana | pass |
| existing guest: her tickets are on "הכרטיסים שלי" | guest | pass |
| existing guest: her visit and donation are on her account | guest | pass |
| U15 the visit request opens from the account list: details and "מחכה לתשובה" (/me/visits/vi-michal) | guest | pass |
| U15 the three-step status line, the first step done | guest | pass |
| U15 ⋯ holds the cancel and nothing else (הבקשה · עוד פעולות / ביטול הבקשה) | guest | pass |
| U15 "וואטסאפ לחווה" opens WhatsApp to the farm (https://wa.me/972507654321?text=%D7%A9%D7%9C%D7%95%D7%9D%2C%) | guest | pass |
| U9 her new donation lands on U16 (pending) (/me/donations/qFcnZPk5udbBzznBcPIx) | guest | pass |
| U16 opens from the account list: the amber pay block with the amount and Bit (/me/donations/qFcnZPk5udbBzznBcPIx) | guest | pass |
| U16 "העברתי את התשלום" marks it paid (claimed), the block says it waits for approval | guest | pass |
| existing guest: no console errors | michal | pass |
| the manager sees her donation as reported paid ("סימנה שהעבירה"), ready to approve | manager | pass |
| Q4 the "לאישור" chip reads "לאישור · 2 · 370 ₪" and there is no "ממתין" tile (לאישור · 2 · 370 ₪) | manager | pass |
| reported paid: no console errors | dana | pass |

Screenshots: [8-Q4-chip](shots/8-Q4-chip.jpg), [8-U1-home-signed-out](shots/8-U1-home-signed-out.jpg), [8-U10-stall](shots/8-U10-stall.jpg), [8-U13-signup](shots/8-U13-signup.jpg), [8-U15-visit](shots/8-U15-visit.jpg), [8-U16-donation](shots/8-U16-donation.jpg), [8-U2-event-page](shots/8-U2-event-page.jpg), [8-U3-order](shots/8-U3-order.jpg), [8-U4-pay](shots/8-U4-pay.jpg), [8-U5-tickets](shots/8-U5-tickets.jpg), [8-U7-account](shots/8-U7-account.jpg), [8-U8-visit-sent](shots/8-U8-visit-sent.jpg), [8-U9-donation-thanks](shots/8-U9-donation-thanks.jpg), [8-W1-inbox-message](shots/8-W1-inbox-message.jpg)

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
| Q25 the registrants' message: tag "נרשמי פסטיבל החורף", "ראו 1 מתוך 2" (נרשמי פסטיבל החורף / לנרשמי פסטיבל החורף: החניה בשער הצפוני. / דנה · היום 21:14 / ראו 1 מתוך 2) | manager | pass |
| messages: no console errors | dana | pass |

Screenshots: [9-Q25-messages-outside](shots/9-Q25-messages-outside.jpg), [9-Q26-farmToday](shots/9-Q26-farmToday.jpg), [9-Q26-registrants](shots/9-Q26-registrants.jpg), [9-U1-guest-message](shots/9-U1-guest-message.jpg)

### 10 Adding someone ahead by phone (Q27) (17/17)

| Check | Role | Result |
|---|---|---|
| People ⋯ "להוסיף מישהו מראש" opens Q27 on "לפי טלפון" | owner | pass |
| Q27 by phone: the link is saved (manager, open) and sent in WhatsApp (/app/login?k=t-95djw45n7yivcd) | owner | pass |
| Q27 the pending list shows the person added by phone | owner | pass |
| Q27 "ביטול" removes the second link (row and link gone) | owner | pass |
| G5 lists the pending manager links by phone ("מנהל · לפי טלפון · הקישור נשלח …"), not the volunteer one (? / 052-555-1212 / מנהל · לפי טלפון · הקישור נשלח היום / ביטול) | owner | pass |
| G5 "ביטול" cancels that link (row and link gone), the other stays | owner | pass |
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

Screenshots: [10-C9-link](shots/10-C9-link.jpg), [10-G5-pending-phone](shots/10-G5-pending-phone.jpg), [10-Q27-pending](shots/10-Q27-pending.jpg), [10-link-cancelled](shots/10-link-cancelled.jpg), [10-link-used](shots/10-link-used.jpg)

### 11 Payment approval and the confirmation (Q7) (11/11)

| Check | Role | Result |
|---|---|---|
| Q7 opens after the approval: WhatsApp and none (she chose WhatsApp) (התשלום אושר / לשלוח למיכל אישור שקיבלנו? / אישור בוואטסאפ / נפתחת הודעה מוכנה, שולחים בעצמך / בלי אישור / רק לסמן ששולם ) | manager | pass |
| WhatsApp: the order is paid and the confirmation is recorded | manager | pass |
| WhatsApp: the wa.me request (with the amount) was aborted by the safety block (https://wa.me/972520000017?text=שלום מיכל בר, קיבלנו את התשלום בסך 80 ₪ עבור כרטיסים לאירו) | runner | pass |
| Q7 for an e-mail guest: "אישור במייל" offered and chosen (התשלום אושר / לשלוח לרותם אישור שקיבלנו? / אישור בוואטסאפ / נפתחת הודעה מוכנה, שולחים בעצמך / אישור במייל / נשלח לבד תוך) | manager | pass |
| e-mail: paid with paidAt and no manual mark, so the Worker sends it (its scan queues email_outbox/donation_<id>); nothing opened (paidAt 2026-11-23T19:15:13.357Z) | manager | pass |
| e-mail: the app writes no outbox job itself (the Worker does, not run on the emulators) | manager | pass |
| none: the order is paid; for an e-mail guest "בלי אישור" records a manual confirmation so no e-mail goes out | manager | pass |
| none: nothing opened | manager | pass |
| payments: no console errors | dana | pass |
| the guest sees the donation and the order paid ("שולם") | guest | pass |
| guest after approval: no console errors | rotem | pass |

Screenshots: [11-Q7-email](shots/11-Q7-email.jpg), [11-Q7-none](shots/11-Q7-none.jpg), [11-Q7-whatsapp](shots/11-Q7-whatsapp.jpg)

### 12 Delete through ⋯ (one of each) (16/16)

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

Screenshots: [12-message-deleted](shots/12-message-deleted.jpg), [12-task-deleted](shots/12-task-deleted.jpg)

### 13 First-visit demo per kind of account (17/17)

| Check | Role | Result |
|---|---|---|
| W4 opens from Q19 with the defaults (vendors off) (true,true,true,false) | owner | pass |
| W4: volunteers off is saved in settings/app | owner | pass |
| W4: a new volunteer is invited by e-mail (staff) | owner | pass |
| W4 switch: no console errors | owner | pass |
| W4: the new volunteer's first entry opens C9 | new volunteer | pass |
| W4: the new account is a volunteer | new volunteer | pass |
| W4: with volunteers off, the new volunteer lands on the real account, no demo (/tasks) | new volunteer | pass |
| W4: still no demo on the next opening | new volunteer | pass |
| W4 new volunteer: no console errors | adi | pass |
| W4: an existing volunteer opening on a new browser gets no demo | volunteer | pass |
| W4 volunteer first visit: no console errors | yoav | pass |
| W4: the new guest's first sign-in opens U13 | new guest | pass |
| W4: the new account is a guest | new guest | pass |
| W4: a new guest's first visit still opens in demo (guests on) (נתוני דמו · מחובר כאורחת · יום רגיל) | new guest | pass |
| W4 new guest: no console errors | ella | pass |
| W4: volunteers back on | owner | pass |
| W4 restore: no console errors | owner | pass |

Screenshots: [13-W4-guest-demo](shots/13-W4-guest-demo.jpg), [13-W4-volunteers-off](shots/13-W4-volunteers-off.jpg)

### 14 No install strip on any screen (13/13)

| Check | Role | Result |
|---|---|---|
| no install strip on 13 screens | owner | pass |
| install sweep: no console errors | owner | pass |
| no install strip on 10 screens | manager | pass |
| install sweep: no console errors | dana | pass |
| no install strip on 6 screens | volunteer | pass |
| install sweep: no console errors | yoav | pass |
| no install strip on 3 screens | vendor | pass |
| install sweep: no console errors | raz | pass |
| no install strip on 8 screens | guest | pass |
| install sweep: no console errors | michal | pass |
| no install strip on 5 screens | signed-out | pass |
| install sweep: no console errors | signed-out | pass |
| non-localhost requests: 31, all aborted (Google hosts among them: 20) | runner | pass |

The last line of item 14 is the runner's: 31 non-localhost requests in the final run, all aborted by the block, none reached
the network (`www.google.com` 17, `wa.me` 9, `unpkg.com` 2, `fonts.googleapis.com` 2, `apis.google.com` 1). The nine `wa.me`
requests are the WhatsApp links the app built (the V2 stall invite in items 3 and 9, D8 helper, Q27 three times, W1 reply, U15 to the farm, Q7);
the cycle checks the number and text inside each.

## Runs

| Run | Head | Cycle | Result |
|---|---|---|---|
| Baseline | cc81e6d | unchanged (items 1-13 as the builders left them) | 345/346: item 3 "D6 live view after check-in" (the hour, see above) |
| 1 | cc81e6d + the extended scripts (working tree) | items 1-14 | 393/393 |
| 2 (final) | 65a807a (the extended scripts committed) | items 1-14, fresh seed | 393/393 |

No app file changed between the runs. After the final run: `npx tsc -p . --noEmit` clean, `npm test` pass (core, demo,
demo-intro), `npm run test:rules` pass (v2 rules 705/705, Q27 team links 44/44, vendor 80/80, guest side, team app, CMS).

## Checks that are not automated here

As in the tidy cycle (e-mail through the Worker, push, the real Google redirect), plus:

- W1 and W2 deletes through ⋯ are checked to be in ⋯; the delete itself is not run (item 12 runs one delete of each entity; an inbox item's delete is covered by `tests/rules-app.mjs` and the walk).
- U15 "ביטול הבקשה" is checked to be the only item in ⋯; it is not run, because item 12 deletes the same visit afterwards.

## Notes (not defects)

- The W1 inbox card has no X and no link to the sender, but it still carries the reply buttons ("מענה בוואטסאפ", "התקשרות") and a quiet "טופל" next to the card's tap target. The decision names only the X and the inline link, so this is as decided; listed here in case the card was meant to be tap-only.
- U16 shows no ⋯ (the builders logged this under "needs a design" in `docs/tidy-progress.md`); the cycle does not look for one.
