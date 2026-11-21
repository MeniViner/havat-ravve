# Demo coverage

Every designed screen is reachable in demo under the persona and day scenario below. `scripts/visual-check.mjs` reads this table.
Route is relative to `/app`. `steps` are actions run after load (`click:<text>`, `fill:<label>=<text>`, `wait:<ms>`, `scroll:<px>`, `demo:<state>`).

| id | persona | scenario | route | steps |
|---|---|---|---|---|
| T1-Root | staff | regular | /tasks |  |
| T2-Time | staff | regular | /tasks?view=time |  |
| T4-Done | staff | regular | /tasks | click:בוצע |
| T3-Task | staff | regular | /tasks/demo-t-toolbox |  |
| C3-TaskLinks | staff | regular | /tasks/demo-t-tables |  |
| C4-Assign | manager | regular | /tasks/demo-t-tap/assign |  |
| T5-Add | staff | regular | /new |  |
| T6-History | staff | regular | /tasks/history |  |
| L5-MineEmpty | staff | regular | /tasks?view=mine | demo:empty |
| C6-DonePhoto | staff | regular | /tasks/demo-t-toolbox/done |  |
| C7-DayEnd | staff | regular | /day |  |
| C8-Offline | staff | regular | /tasks | demo:offline |
| X1-Refused | staff | regular | /tasks | demo:refuseNext; click:לקחת |
| B4-Receive | staff | regular | /tasks |  |
| P1-Root | owner | regular | /tasks |  |
| P6-Full | owner | regular | /tasks | fullpage |
| P2-List | owner | regular | /projects |  |
| P3-Project | owner | regular | /projects/demo-p-festival |  |
| P4-Step | owner | regular | /projects/demo-p-festival/steps/demo-ps-police |  |
| P5-New | owner | regular | /projects/new | fill:לאן רוצים להגיע=מערכת השקיה חדשה; fill:עד מתי=סוף דצמבר; fill:צעד 1=למדוד את השטח ולשרטט; click:צעד נוסף; fill:צעד 2=לקבל שלוש הצעות מחיר; click:צעד נוסף; fill:צעד 3=לאשר תקציב עם אליה; click:צעד נוסף; fill:צעד 4=להזמין ולהתקין |
| L1-Templates | manager | regular | /manage/recurring |  |
| L2-Template | manager | regular | /manage/recurring/demo-tpl-pots |  |
| L3-Places | staff | regular | /places |  |
| L4-Place | manager | regular | /places/demo-p-stall |  |
| S1-Root | staff | regular | /shopping |  |
| S2-Wish | staff | regular | /shopping?list=wish |  |
| S3-Empty | staff | regular | /shopping?list=online |  |
| S4-Item | staff | regular | /shopping/demo-s-milk |  |
| S5-Add | staff | regular | /new?kind=shopping |  |
| S6-Trip | staff | eventDay | /shopping/trip |  |
| S7-TripEnd | staff | afterEvent | /shopping/trip/done |  |
| S8-History | staff | regular | /shopping/history |  |
| F1-Root | staff | regular | /farm |  |
| F2-Month | staff | regular | /farm/calendar?view=month |  |
| F3-Day | staff | regular | /farm/calendar?view=day |  |
| F4-Presence | staff | regular | /farm/presence |  |
| F5-Feed | staff | regular | /farm/today |  |
| F6-Event | staff | regular | /farm/events/demo-e-festival |  |
| C11-CalItem | manager | regular | /farm/calendar/new |  |
| C5-Teammate | staff | regular | /people/demo-u-noa |  |
| E1-Home | staff | eventDay | /event |  |
| E2-Scan | staff | eventDay | /event/gate |  |
| E3-Ok | staff | eventDay | /event/gate | click:QR תקין |
| E4-Pay | staff | eventDay | /event/gate | click:QR לא שולם |
| E5-Bad | staff | eventDay | /event/gate | click:QR מבוטל |
| E6-Search | staff | eventDay | /event/gate/search |  |
| E7-StallWho | staff | eventDay | /event/stall |  |
| E8-StallSell | staff | eventDay | /event/stall/demo-tab-roni-fest |  |
| E9-Tabs | manager | eventDay | /event/stall/tabs |  |
| M1-Root | owner | regular | /manage |  |
| M2-Inbox | manager | regular | /manage/inbox |  |
| M3-Events | manager | regular | /manage/events |  |
| M4-Prep | manager | regular | /manage/events/demo-e-festival?tab=prep |  |
| M5-Guests | manager | regular | /manage/events/demo-e-festival?tab=guests |  |
| M6-Live | manager | eventDay | /manage/events/demo-e-festival?tab=day |  |
| M7-Summary | manager | afterEvent | /manage/events/demo-e-october?tab=summary |  |
| M8-People | manager | regular | /manage/people |  |
| M9-Person | manager | regular | /manage/people/demo-u-david |  |
| M10-Reports | manager | regular | /manage/reports |  |
| N1-Visits | manager | regular | /manage/visits |  |
| N2-Visit | manager | regular | /manage/visits/demo-vi-cohen |  |
| N3-Donations | manager | regular | /manage/donations |  |
| N4-Donation | manager | regular | /manage/donations/demo-d-michal |  |
| N5-Settings | manager | regular | /manage/settings |  |
| N6-Payments | owner | regular | /manage/settings/payments |  |
| N7-Messages | manager | regular | /manage/settings/messages |  |
| N8-Vendors | manager | regular | /manage/events/demo-e-festival/vendors |  |
| N9-Products | manager | regular | /manage/events/demo-e-festival/products |  |
| N10-Product | manager | regular | /manage/events/demo-e-festival/products/demo-pr-lemonade |  |
| N11-EventEdit | manager | regular | /manage/events/demo-e-festival/edit |  |
| N12-Tab | manager | regular | /manage/events/demo-e-october/tabs/demo-tab-roni-oct |  |
| N13-Invite | manager | regular | /manage/people/invite |  |
| N14-Activity | manager | regular | /manage/activity |  |
| G1-Amounts | owner | regular | /manage/settings/donation-amounts |  |
| G2-VisitTypes | manager | regular | /manage/settings/visit-types |  |
| G3-Questions | manager | regular | /manage/settings/questions |  |
| G4-Contact | manager | regular | /manage/settings/contact |  |
| G5-Managers | owner | regular | /manage/settings/managers |  |
| V1-Pool | manager | regular | /manage/vendors |  |
| V2-Vendor | manager | regular | /manage/vendors/demo-v-raz |  |
| V3-Files | manager | regular | /manage/events/demo-e-festival/files |  |
| V4-Staffing | manager | regular | /manage/events/demo-e-festival/staffing |  |
| V5-Debts | manager | afterEvent | /manage/events/demo-e-october/debts |  |
| V6-VendorApp | manager | regular | /manage/vendors/demo-v-raz/access |  |
| V7-VendorsDay | manager | eventDay | /manage/events/demo-e-festival/vendors/today |  |
| B1-Compose | owner | regular | /manage/broadcasts/new | fill:תוכן ההודעה=מחר מתחילים ב־15:30 ולא ב־16:00. להגיע עם כובע ומים. |
| B2-Sent | manager | regular | /manage/broadcasts |  |
| B3-Read | manager | regular | /manage/broadcasts/demo-b-1 |  |
| Y1-Live | manager | eventDay | /manage/events/demo-e-festival/live |  |
| Y2-Scans | manager | eventDay | /manage/events/demo-e-festival/live/scans |  |
| Y3-Rejected | manager | eventDay | /manage/events/demo-e-festival/live/scans/demo-sc-yossi |  |
| Y4-Waiting | manager | eventDay | /manage/events/demo-e-festival/live/waiting |  |
| Y5-Close | manager | afterEvent | /manage/events/demo-e-festival/close |  |
| L6-Me | staff | regular | /me |  |
| C12-Profile | owner | regular | /me |  |
| C13-ProfileEdit | owner | regular | /me/edit |  |
| A1-Photo | staff | regular | /me/photo |  |
| A2-Crop | staff | regular | /me/photo/crop |  |
| C1-Notifs | staff | regular | /notifications |  |
| C2-Search | owner | regular | /search | fill:חיפוש בכל האפליקציה=כהן |
| C9-Welcome | new | regular | /welcome |  |
| C10-Install | staff | regular | /install |  |
| X2-Suspended | blocked | regular | / |  |
| D1-Invite | vendor | regular | /vendor/invite/demo-e-festival |  |
| D2-Confirm | vendor | regular | /vendor/events/demo-e-festival/needs |  |
| D3-Home | vendor | regular | /vendor |  |
| D10-Empty | vendor | regular | /vendor | demo:empty |
| D4-Event | vendor | regular | /vendor/events/demo-e-festival |  |
| D7-Stall | vendor | regular | /vendor/stall |  |
| D8-Helper | vendor | regular | /vendor/stall/helpers/new |  |
| D11-HelperHome | helper | regular | /vendor |  |
| D5-Day | vendor | eventDay | /vendor |  |
| D6-DayLive | vendor | eventDay | /vendor |  |
| D9-Summary | vendor | afterEvent | /vendor/events/demo-e-festival/summary |  |
| Z1-DemoStart | staff | regular | /demo |  |
| Z2-DemoBanner | staff | regular | /tasks |  |
| Z3-DemoSwitch | staff | regular | /tasks | click:נתוני דמו |
| Z4-DemoOwner | owner | regular | /manage |  |
| Z5-DemoVendor | vendor | regular | /vendor |  |
