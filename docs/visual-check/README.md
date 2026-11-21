# Visual check: redesign v2

Each designed screen is opened in demo mode (390x844, device scale 2) with the persona, scenario and steps from `docs/demo-coverage.md`, and compared pixel by pixel with `design/png/<id>.png`.

- Latest full run: `docs/visual-check/final/`. Each screen has `<id>.pair.jpg` (design on the left, app on the right) ; scores are in `results.json`. The full-size `<id>.actual.png` files are not committed: re-run the check to get them.
- Earlier verifier passes, with notes per screen: `A/`, `B/`, `C/`.
- Re-run it: `node scripts/dev.mjs`, then `node scripts/visual-check.mjs --out=docs/visual-check/final --design=havat-raveh-redesign/design`.

The score is the share of pixels that differ clearly. Real photos, live times and seed lists that are longer than the artboard sample raise it without being defects.

## Result

119 screens. No console errors on any screen.

- Under 1%: 62 screens
- 1% to 5%: 46 screens (same layout; the difference is text such as names, counts and times)
- 5% or more: 11 screens, each explained below

## Screens at 5% or more

| Screen | Score | Why |
|---|---|---|
| B2-Sent | 5.1% | Layout matches. Sent-message rows and read counts come from the seed. |
| C7-DayEnd | 6.4% | Layout matches. The list shows the seed day (task names and counts), not the artboard sample. |
| M8-People | 5.5% | Layout matches. The list is the 12-person seed team, longer than the artboard sample. |
| N8-Vendors | 5.9% | Layout matches. The vendor list comes from the seed. |
| N14-Activity | 5.6% | Layout matches. The activity rows come from the seed. |
| P1-Root | 9.1% | P1 and P6 are the same screen at two scroll positions, but the two artboards disagree with each other; the app follows P6. The extra row is the seed task on Beni that C2 needs. |
| P6-Full | 12.0% | As P1. Also longer because of the C2 seed task ("עליך · היום"). |
| Y2-Scans | 5.0% | Michal is left out of the scans list so the E3 sample code stays unused. |
| Z1-DemoStart | 5.7% | One line of the intro wraps at a different word; spacing within 3px. |
| Z3-DemoSwitch | 13.6% | Adds the collapsed "מצבים להדגמה" row that DEMO.md requires (item 7). Everything else matches. |
| Z5-DemoVendor | 5.7% | Same content; card heights differ by up to 4px. |

## How the check lines up with the artboards

- The demo strip is hidden on every screen except Z1-Z5, because only those artboards show it. The 28px that the app normally gives the strip is given back to the screen during the check.
- Screens whose artboard shows a state after a tap (C4 with Yoav picked, T4 after "קראתי", D6 after the arrival toast closes) reach that state through the steps column.

## Every screen

| Screen | Persona | Scenario | Score | Verdict |
|---|---|---|---|---|
| A1-Photo | staff | regular | 0.3% | match |
| A2-Crop | staff | regular | 2.6% | match, live values differ |
| B1-Compose | owner | regular | 0.9% | match |
| B2-Sent | manager | regular | 5.1% | explained below |
| B3-Read | manager | regular | 2.7% | match, live values differ |
| B4-Receive | staff | regular | 0.5% | match |
| C1-Notifs | staff | regular | 0.8% | match |
| C2-Search | owner | regular | 1.2% | match, live values differ |
| C3-TaskLinks | staff | regular | 4.0% | match, live values differ |
| C4-Assign | owner | regular | 1.2% | match, live values differ |
| C5-Teammate | staff | regular | 3.9% | match, live values differ |
| C6-DonePhoto | staff | regular | 1.8% | match, live values differ |
| C7-DayEnd | staff | regular | 6.4% | explained below |
| C8-Offline | staff | regular | 1.0% | match, live values differ |
| C9-Welcome | new | regular | 0.3% | match |
| C10-Install | staff | regular | 0.1% | match |
| C11-CalItem | manager | regular | 0.3% | match |
| C12-Profile | owner | regular | 0.7% | match |
| C13-ProfileEdit | owner | regular | 0.3% | match |
| D1-Invite | vendor | regular | 0.3% | match |
| D2-Confirm | vendor | regular | 0.5% | match |
| D3-Home | vendor | regular | 4.2% | match, live values differ |
| D4-Event | vendor | regular | 0.1% | match |
| D5-Day | vendor | eventDay | 2.9% | match, live values differ |
| D6-DayLive | vendor | eventDay | 0.1% | match |
| D7-Stall | vendor | regular | 0.4% | match |
| D8-Helper | vendor | regular | 3.3% | match, live values differ |
| D9-Summary | vendor | afterEvent | 0.5% | match |
| D10-Empty | vendor | afterEvent | 3.6% | match, live values differ |
| D11-HelperHome | helper | regular | 2.9% | match, live values differ |
| E1-Home | staff | eventDay | 2.9% | match, live values differ |
| E2-Scan | staff | eventDay | 0.7% | match |
| E3-Ok | staff | eventDay | 0.1% | match |
| E4-Pay | staff | eventDay | 0.0% | match |
| E5-Bad | staff | eventDay | 0.0% | match |
| E6-Search | staff | eventDay | 0.2% | match |
| E7-StallWho | staff | eventDay | 0.4% | match |
| E8-StallSell | staff | eventDay | 0.9% | match |
| E9-Tabs | manager | eventDay | 0.8% | match |
| F1-Root | staff | regular | 0.3% | match |
| F2-Month | staff | regular | 0.5% | match |
| F3-Day | staff | regular | 2.3% | match, live values differ |
| F4-Presence | staff | regular | 4.4% | match, live values differ |
| F5-Feed | staff | regular | 1.9% | match, live values differ |
| F6-Event | staff | regular | 0.5% | match |
| G1-Amounts | owner | regular | 0.2% | match |
| G2-VisitTypes | manager | regular | 0.2% | match |
| G3-Questions | manager | regular | 0.1% | match |
| G4-Contact | manager | regular | 0.2% | match |
| G5-Managers | owner | regular | 2.7% | match, live values differ |
| L1-Templates | manager | regular | 3.3% | match, live values differ |
| L2-Template | manager | regular | 1.5% | match, live values differ |
| L3-Places | manager | regular | 3.8% | match, live values differ |
| L4-Place | manager | regular | 4.2% | match, live values differ |
| L5-MineEmpty | staff | regular | 0.3% | match |
| L6-Me | staff | regular | 0.3% | match |
| M1-Root | owner | regular | 0.1% | match |
| M2-Inbox | manager | regular | 0.3% | match |
| M3-Events | manager | regular | 0.3% | match |
| M4-Prep | manager | regular | 0.5% | match |
| M5-Guests | manager | regular | 1.1% | match, live values differ |
| M6-Live | manager | eventDay | 1.6% | match, live values differ |
| M7-Summary | manager | afterEvent | 1.7% | match, live values differ |
| M8-People | manager | regular | 5.5% | explained below |
| M9-Person | owner | regular | 2.2% | match, live values differ |
| M10-Reports | manager | regular | 1.9% | match, live values differ |
| N1-Visits | manager | regular | 0.1% | match |
| N2-Visit | manager | regular | 2.0% | match, live values differ |
| N3-Donations | manager | regular | 1.9% | match, live values differ |
| N4-Donation | manager | regular | 1.4% | match, live values differ |
| N5-Settings | owner | regular | 0.1% | match |
| N6-Payments | owner | regular | 0.2% | match |
| N7-Messages | manager | regular | 1.0% | match, live values differ |
| N8-Vendors | manager | regular | 5.9% | explained below |
| N9-Products | manager | regular | 0.3% | match |
| N10-Product | manager | regular | 0.5% | match |
| N11-EventEdit | manager | regular | 0.4% | match |
| N12-Tab | manager | regular | 1.1% | match, live values differ |
| N13-Invite | owner | regular | 0.4% | match |
| N14-Activity | manager | regular | 5.6% | explained below |
| P1-Root | owner | regular | 9.1% | explained below |
| P2-List | owner | regular | 0.2% | match |
| P3-Project | owner | regular | 0.3% | match |
| P4-Step | owner | regular | 0.8% | match |
| P5-New | owner | regular | 0.9% | match |
| P6-Full | owner | regular | 12.0% | explained below |
| S1-Root | staff | regular | 2.2% | match, live values differ |
| S2-Wish | staff | regular | 0.1% | match |
| S3-Empty | staff | regular | 1.1% | match, live values differ |
| S4-Item | staff | regular | 0.2% | match |
| S5-Add | staff | regular | 0.6% | match |
| S6-Trip | staff | eventDay | 3.6% | match, live values differ |
| S7-TripEnd | staff | afterEvent | 0.3% | match |
| S8-History | staff | regular | 0.3% | match |
| T1-Root | staff | regular | 0.6% | match |
| T2-Time | staff | regular | 2.4% | match, live values differ |
| T3-Task | staff | regular | 0.2% | match |
| T4-Done | staff | regular | 0.3% | match |
| T5-Add | staff | regular | 0.5% | match |
| T6-History | staff | regular | 2.3% | match, live values differ |
| V1-Pool | manager | regular | 1.6% | match, live values differ |
| V2-Vendor | manager | regular | 0.4% | match |
| V3-Files | manager | regular | 0.6% | match |
| V4-Staffing | manager | regular | 2.1% | match, live values differ |
| V5-Debts | manager | afterEvent | 1.0% | match, live values differ |
| V6-VendorApp | manager | regular | 3.5% | match, live values differ |
| V7-VendorsDay | manager | eventDay | 3.7% | match, live values differ |
| X1-Refused | staff | regular | 0.3% | match |
| X2-Suspended | blocked | regular | 0.1% | match |
| Y1-Live | manager | eventDay | 1.9% | match, live values differ |
| Y2-Scans | manager | eventDay | 5.0% | explained below |
| Y3-Rejected | manager | eventDay | 1.3% | match, live values differ |
| Y4-Waiting | manager | eventDay | 4.7% | match, live values differ |
| Y5-Close | manager | afterEvent | 1.9% | match, live values differ |
| Z1-DemoStart | staff | regular | 5.7% | explained below |
| Z2-DemoBanner | staff | regular | 0.6% | match |
| Z3-DemoSwitch | staff | regular | 13.6% | explained below |
| Z4-DemoOwner | owner | regular | 0.1% | match |
| Z5-DemoVendor | vendor | regular | 5.7% | explained below |
