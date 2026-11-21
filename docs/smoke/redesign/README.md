# Smoke cycle: team-app redesign on the emulators

End-to-end smoke of the v2 redesign (branch `redesign/v2`) as every role, on local Firebase emulators. Run 2026-11-21.
Result of the final cycle: 236 of 236 checks passed, no console errors in any session.

## Environment

- Emulators: `firebase emulators:start --only firestore,auth --project demo-havat-ravve` (Firestore 8080, Auth 9099). The app keeps its real project id inside the emulator, so the data lives under `havat-ravve` on localhost.
- App: `node scripts/dev.mjs` on `http://localhost:5173` (esbuild watch of this checkout, dev build with React StrictMode). Every URL carried `?emulator`.
- Browser: Playwright Chromium, 390x844 at 2x, `he-IL`, `Asia/Jerusalem`, service workers blocked, a canvas camera that shows a generated QR.
- Safety: every browser context aborts every request to a host that is not localhost. In the final cycle 21 requests were aborted, none reached the network: 19 x `www.google.com/images/cleardot.gif` (the Firestore SDK checking for a connection while offline in items 5 and 6) and 2 x `wa.me` (the WhatsApp links that V2 and D8 open).
- Sign-in: the Google button goes through the Auth emulator's page, whose redirect needs Google's loader from `apis.google.com`, which the block aborts. Each session therefore signs in to the Auth emulator by REST (a Google IdP sign-in) and hands the result to Firebase's own storage before the app loads. The app restores the session as after a real sign-in.
- Data: `scripts/smoke-seed.mjs` wipes both emulators and writes 11 accounts (owner, manager, 2 volunteers, a pending and a blocked volunteer, a guest, and 4 people without a profile who join during the run), places, tasks, shopping, 2 events, a visit, a donation and tickets. Item 8 adds a free event and a stall tab for the new guest directly, as the staff side would.
- Run: `node scripts/smoke-seed.mjs && node scripts/smoke-cycle.mjs` (`--only=3,4` for some items). Results go to `.build/smoke/results.json`.

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
| L6 profile renders | volunteer | pass |
| C13 profile edit saved | volunteer | pass |
| farm, notifications, profile: no console errors | yoav | pass |

Screenshots: [1-F1-farm](shots/1-F1-farm.jpg), [1-L6-profile](shots/1-L6-profile.jpg), [1-S1-shopping](shots/1-S1-shopping.jpg), [1-T3-task-photo](shots/1-T3-task-photo.jpg), [1-done-photo-screen](shots/1-done-photo-screen.jpg), [1-task-done-struck](shots/1-task-done-struck.jpg), [1-tasks-by-place](shots/1-tasks-by-place.jpg)

### 2 Manager day (31/31)

| Check | Role | Result |
|---|---|---|
| M1 manage tab renders | manager | pass |
| C4 opens from the task | manager | pass |
| C4 assigned to Yoav (saved), back on the task | manager | pass |
| L2 recurring template saved with place and time | manager | pass |
| L2 template turned off (saved) | manager | pass |
| L3 save a place from the current position opens L4 | manager | pass |
| L4 place saved with the position | manager | pass |
| P1 projects block shows above the tasks for a manager | manager | pass |
| P5 project created with two steps, P3 opens | manager | pass |
| M8 people directory renders | manager | pass |
| N13 role invite by email saved (staff) | manager | pass |
| M9 manager blocks a guest | manager | pass |
| M9 manager unblocks the guest | manager | pass |
| M9 a manager cannot block a volunteer (owner only) | manager | pass |
| B1 broadcast sent (saved) (recipients 4) | manager | pass |
| M2 bulk approval: donation and both tickets paid | manager | pass |
| M2 approved items leave the queue (handled) | manager | pass |
| manager day: no console errors | dana | pass |
| B4 the broadcast card shows on the volunteer root | volunteer | pass |
| B3 read receipt saved, card leaves | volunteer | pass |
| C1 the assignment reached the volunteer's notifications | volunteer | pass |
| volunteer reads: no console errors | yoav | pass |
| B2 the manager sees who read it | manager | pass |
| C9 first entry opens for the invited person, names who added them | new volunteer | pass |
| C9 profile created with the invited role (staff) | new volunteer | pass |
| the new volunteer has the team app without the manage tab | new volunteer | pass |
| first entry: no console errors | noga | pass |
| M9 owner blocks a volunteer | owner | pass |
| M9 owner unblocks the volunteer | owner | pass |
| N14 activity feed lists the day, every line in Hebrew | owner | pass |
| owner: no console errors | owner | pass |

Screenshots: [2-B1-compose](shots/2-B1-compose.jpg), [2-B4-volunteer-card](shots/2-B4-volunteer-card.jpg), [2-C4-assign](shots/2-C4-assign.jpg), [2-C9-first-entry](shots/2-C9-first-entry.jpg), [2-M1-manage](shots/2-M1-manage.jpg), [2-M2-payments](shots/2-M2-payments.jpg), [2-N14-activity](shots/2-N14-activity.jpg), [2-P3-project](shots/2-P3-project.jpg)

### 3 Event lifecycle with a vendor (51/51)

| Check | Role | Result |
|---|---|---|
| N11 event created and published, M4 opens | manager | pass |
| V4 crew staffed (gate, stall) | manager | pass |
| V1 vendor added to the pool, V2 opens | manager | pass |
| V2 invite to the event: record invited, access link sent in WhatsApp (/app/vendor/invite/e0MwCQWdvX3SK9Zns87s?k=5huy388943tw) | manager | pass |
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
| guest orders 2 tickets (pending) (2 tickets) | guest | pass |
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

### 4 Role boundaries (43/43)

| Check | Role | Result |
|---|---|---|
| volunteer opening /manage is sent to /tasks | volunteer | pass |
| volunteer opening /manage/people is sent to /tasks | volunteer | pass |
| volunteer opening /projects is sent to /tasks | volunteer | pass |
| volunteer opening /manage/recurring is sent to /tasks | volunteer | pass |
| volunteer opening /manage/events is sent to /tasks | volunteer | pass |
| volunteer has no manage tab | volunteer | pass |
| volunteer redirects: no console errors | yoav | pass |
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
| boots: guest · regular | demo | pass |
| boots: guest · eventDay | demo | pass |
| boots: guest · afterEvent | demo | pass |
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

### 8 Guest flows (legacy) (26/26)

| Check | Role | Result |
|---|---|---|
| signed out: guest home lists the upcoming event and the tiles | signed-out | pass |
| event page with price and "הזמנת כרטיסים" | signed-out | pass |
| ordering signed out asks to sign in first | signed-out | pass |
| "הכרטיסים שלי" signed out invites to sign in | signed-out | pass |
| signed-out guest: no console errors | signed-out | pass |
| first sign-in opens the sign-up form | new guest | pass |
| sign-up creates a guest profile and opens the guest home ({"role":"guest","phone":"0541234567"}) | new guest | pass |
| order: 2 tickets created, pending, the second in the companion's name | new guest | pass |
| "הכרטיסים שלי" shows the order with a QR and the payment band | new guest | pass |
| "העברתי" marks the order paid (claimed) | new guest | pass |
| the managers' inbox gets the payment claim | new guest | pass |
| free event: "כניסה חופשית · נדרש רישום" | new guest | pass |
| registration creates a free ticket | new guest | pass |
| visit request sent ("קיבלנו, נחזור אליכם") | new guest | pass |
| donation 250 with a memorial (pending) | new guest | pass |
| donation "העברתי" (claimed) | new guest | pass |
| stall tab shows on "הכרטיסים שלי" (open) | new guest | pass |
| stall tab "העברתי" (claimed) | new guest | pass |
| account page lists tickets, visit, donation and the stall tab | new guest | pass |
| account page: thank-you strip and the profile | new guest | pass |
| contact page opens | new guest | pass |
| new guest flows: no console errors | rotem | pass |
| existing guest: her tickets are on "הכרטיסים שלי" | guest | pass |
| existing guest: account page lists her visit and donation | guest | pass |
| existing guest: no console errors | michal | pass |
| non-localhost requests: 21, all aborted (Google hosts among them: 19) | runner | pass |

Screenshots: [8-account](shots/8-account.jpg), [8-donation-thanks](shots/8-donation-thanks.jpg), [8-event-page](shots/8-event-page.jpg), [8-guest-home-signed-out](shots/8-guest-home-signed-out.jpg), [8-my-tickets](shots/8-my-tickets.jpg), [8-signup](shots/8-signup.jpg), [8-stall-tab](shots/8-stall-tab.jpg), [8-visit-sent](shots/8-visit-sent.jpg)

## Rounds

**Round 1** (items 1 to 6, built and run item by item; each defect was fixed, the suites rerun, and the items run again from item 1):

| Defect | Fix |
|---|---|
| C9 named the inviter with a fixed masculine verb ("דנה הוסיף אותך") | 072e7e2 `src/app/v2/screens/system/misc.tsx` |
| N14 activity feed showed English verbs ("assigned", "closed") and doubled verbs in older "/ה" texts | 91f8bbc `src/app/v2/screens/manage/calc.ts`, test in `tests/v2-manage.mjs` |
| Vendor link claim ran twice (StrictMode remount): the second transaction was refused, a 403 in the console | a85ebd3 `src/app/App.tsx` |
| M2 inbox showed "undefined" for a vendor's "נגמר לי משהו" request | c19bcec `src/app/types.ts`, `src/app/v2/screens/manage/Root.tsx` |
| E1 hero said "קורה עכשיו" before the event started | 803485e `src/app/v2/screens/eventday/home.tsx` |
| React setState-in-render error: D8 helper redirect and the past-event hand-over to D9 navigated during render | 9cf19d2 `src/app/v2/screens/vendor/stall.tsx`, `vendor/event.tsx` |
| X1 on a lost race to take a task said "מישהו אחר הקדים אותך" instead of naming who took it | eab7b23 `src/app/v2/data/tasks.ts` |

**Round 2**: the whole cycle, items 1 to 8, from a fresh seed after the last fix. No defects, no console errors (tables above).

After round 2: `npm test`, all `tests/v2-*.mjs` against the dev server, `tsc --noEmit -p .`, `npm run typecheck:api` and `npm run build` pass. Firestore rules were not changed, so `npm run test:rules` was not rerun.

## Decided after the run

1. T1 "לפי מקום": a task ticked under "בלי מקום" used to leave the list at once, while T4 says a ticked row stays visible, struck through. No artboard or written rule makes "בלי מקום" an exception, so it now follows T4 like the other groups (`groupByPlace`, test updated in `tests/v2-tasks.mjs`).
2. A take kept offline and refused after sync (someone else took the task meanwhile) shows the general X1 text "לא נשמר. אין הרשאה לפעולה הזו". The named form ("נועה לקחה את המשימה לפני רגע") appears when the conflict is known at the moment of the tap, online. This is logged as an added state; naming the taker after a late refusal would need the queued write to read the task again.

## Notes (not defects)

- A volunteer whose status is still pending gets the guest app until a manager approves.
- After Y5 closes a same-day event, the guest home (legacy, unchanged) still lists it with its ticket button until its end time.
- The vendor screens follow the event's end time, not the manager's close: until the end time the vendor still sees the event day.
- In demo the "הפעולה הבאה לא תישמר" trigger names Noa as the one who was first, as the design shows.
