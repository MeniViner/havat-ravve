# Stage 2 Today, shopping, and exports

Screenshots are kept outside the repository in `havat-ravve-feedback-round-1-smoke-screenshots-6a8584c.zip`.

Chrome passed all 98 Stage 2 checks at 390×844 and 1280×800 with a clean console. Each of the 11 export locations passed as manager and owner. A table preview and CSV download use the same rows and column definitions.

Both typechecks, staged build parity, the core and demo suites, Firestore rules, and all 250 Worker assertions passed. The same preview passed all 66 [Stage 1 regression checks](../1/README.md), including the 42 corrected Stage 0 scenarios, with no console or network failures.

- Today uses the Jerusalem calendar day for completed tasks. Ticking and unticking keep the row in its group. The shared Tasks screen retains its existing completion animation.
- The demo now applies manager-only visibility to direct task detail and edit links. Creating recurring templates stays manager-only.
- The quick shopping line already offered an optional quantity after entering a name. The browser photo chooser is in the full form and item detail. Chrome verified compression, thumbnails, enlargement, replacing and removing images with a test fixture. Physical phone camera and gallery choices remain unverified.
- An initial phone check measured the shopping action at 40 px. After the scoped CSS correction, visible Today and staff event hub controls measured at least 44×44 px at both requested sizes.

| Check | Persona | Viewport | Result | Screenshot |
| --- | --- | --- | --- | --- |
| 2.1 Today ledger and free ratio | staff | 390×844 | Pass | ratio and ledger |
| 2.1 Today ledger and free ratio | staff | 1280×800 | Pass | ratio and ledger |
| 2.1 Today ledger and free ratio | manager | 390×844 | Pass | ratio and ledger |
| 2.1 Today ledger and free ratio | manager | 1280×800 | Pass | ratio and ledger |
| 2.1 Today ledger and free ratio | owner | 390×844 | Pass | ratio and ledger |
| 2.1 Today ledger and free ratio | owner | 1280×800 | Pass | ratio and ledger |
| 2.2 Task completion stays in place | staff | 390×844 | Pass | ticked stays on you, ticked stays in free group, unticked still in free group, ticked stays with others |
| 2.2 Task completion stays in place | staff | 1280×800 | Pass | ticked stays on you, ticked stays in free group, unticked still in free group, ticked stays with others |
| 2.2 Task completion stays in place | manager | 390×844 | Pass | ticked stays on you, ticked stays in free group, unticked still in free group, ticked stays with others |
| 2.2 Task completion stays in place | manager | 1280×800 | Pass | ticked stays on you, ticked stays in free group, unticked still in free group, ticked stays with others |
| 2.2 Task completion stays in place | owner | 390×844 | Pass | ticked stays on you, ticked stays in free group, unticked still in free group, ticked stays with others |
| 2.2 Task completion stays in place | owner | 1280×800 | Pass | ticked stays on you, ticked stays in free group, unticked still in free group, ticked stays with others |
| 2.3 Task group hierarchy | staff | 390×844 | Pass | on you and free hierarchy, others with distinct treatment |
| 2.3 Task group hierarchy | staff | 1280×800 | Pass | on you and free hierarchy, others with distinct treatment |
| 2.3 Task group hierarchy | manager | 390×844 | Pass | on you and free hierarchy, others with distinct treatment |
| 2.3 Task group hierarchy | manager | 1280×800 | Pass | on you and free hierarchy, others with distinct treatment |
| 2.3 Task group hierarchy | owner | 390×844 | Pass | on you and free hierarchy, others with distinct treatment |
| 2.3 Task group hierarchy | owner | 1280×800 | Pass | on you and free hierarchy, others with distinct treatment |
| 2.4 Separate shopping section | staff | 390×844 | Pass | separate shopping area |
| 2.4 Separate shopping section | staff | 1280×800 | Pass | separate shopping area |
| 2.4 Separate shopping section | manager | 390×844 | Pass | separate shopping area |
| 2.4 Separate shopping section | manager | 1280×800 | Pass | separate shopping area |
| 2.4 Separate shopping section | owner | 390×844 | Pass | separate shopping area |
| 2.4 Separate shopping section | owner | 1280×800 | Pass | separate shopping area |
| 2.5 Palette, readability, and touch sizes | staff | 390×844 | Pass | today palette and typography, event hub palette and controls |
| 2.5 Palette, readability, and touch sizes | staff | 1280×800 | Pass | today palette and typography, event hub palette and controls |
| 2.5 Palette, readability, and touch sizes | manager | 390×844 | Pass | today palette and typography, event hub palette and controls |
| 2.5 Palette, readability, and touch sizes | manager | 1280×800 | Pass | today palette and typography, event hub palette and controls |
| 2.5 Palette, readability, and touch sizes | owner | 390×844 | Pass | today palette and typography, event hub palette and controls |
| 2.5 Palette, readability, and touch sizes | owner | 1280×800 | Pass | today palette and typography, event hub palette and controls |
| 2.6-managers-only Manager-only task access | staff | 390×844 | Pass | staff history hides private completion, staff direct private task blocked, staff direct private edit blocked, staff template creation blocked |
| 2.6-managers-only Manager-only task access | staff | 1280×800 | Pass | staff history hides private completion, staff direct private task blocked, staff direct private edit blocked, staff template creation blocked |
| 2.6-managers-only Manager-only task access | manager | 390×844 | Pass | manager new task toggle, manager edit task toggle, manager new template toggle, manager edit template toggle, manager can see private history |
| 2.6-managers-only Manager-only task access | manager | 1280×800 | Pass | manager new task toggle, manager edit task toggle, manager new template toggle, manager edit template toggle, manager can see private history |
| 2.6-managers-only Manager-only task access | owner | 390×844 | Pass | manager new task toggle, manager edit task toggle, manager new template toggle, manager edit template toggle, manager can see private history |
| 2.6-managers-only Manager-only task access | owner | 1280×800 | Pass | manager new task toggle, manager edit task toggle, manager new template toggle, manager edit template toggle, manager can see private history |
| 2.6-routine Routine task claiming and completion | staff | 390×844 | Pass | routine can be taken, routine assigned and completed |
| 2.6-routine Routine task claiming and completion | staff | 1280×800 | Pass | routine can be taken, routine assigned and completed |
| 2.6-routine Routine task claiming and completion | manager | 390×844 | Pass | routine can be taken, routine assigned and completed |
| 2.6-routine Routine task claiming and completion | manager | 1280×800 | Pass | routine can be taken, routine assigned and completed |
| 2.6-routine Routine task claiming and completion | owner | 390×844 | Pass | routine can be taken, routine assigned and completed |
| 2.6-routine Routine task claiming and completion | owner | 1280×800 | Pass | routine can be taken, routine assigned and completed |
| 2.7 Shopping photo capture and editing | staff | 390×844 | Pass | quick add stays a line, form gallery control, form gallery compressed preview, building thumbnail, building photo lightbox, form camera control, form camera compressed preview, online thumbnail, online photo lightbox |
| 2.7 Shopping photo capture and editing | staff | 1280×800 | Pass | quick add stays a line, form gallery control, form gallery compressed preview, building thumbnail, building photo lightbox, form camera control, form camera compressed preview, online thumbnail, online photo lightbox |
| 2.7 Shopping photo capture and editing | manager | 390×844 | Pass | quick add stays a line, form gallery control, form gallery compressed preview, building thumbnail, building photo lightbox, form camera control, form camera compressed preview, online thumbnail, online photo lightbox |
| 2.7 Shopping photo capture and editing | manager | 1280×800 | Pass | quick add stays a line, form gallery control, form gallery compressed preview, building thumbnail, building photo lightbox, form camera control, form camera compressed preview, online thumbnail, online photo lightbox |
| 2.7 Shopping photo capture and editing | owner | 390×844 | Pass | quick add stays a line, form gallery control, form gallery compressed preview, building thumbnail, building photo lightbox, form camera control, form camera compressed preview, online thumbnail, online photo lightbox |
| 2.7 Shopping photo capture and editing | owner | 1280×800 | Pass | quick add stays a line, form gallery control, form gallery compressed preview, building thumbnail, building photo lightbox, form camera control, form camera compressed preview, online thumbnail, online photo lightbox |
| 2.8-activity Activity export | manager | 390×844 | Pass | paired actions, rtl table |
| 2.8-activity Activity export | manager | 1280×800 | Pass | paired actions, rtl table |
| 2.8-activity Activity export | owner | 390×844 | Pass | paired actions, rtl table |
| 2.8-activity Activity export | owner | 1280×800 | Pass | paired actions, rtl table |
| 2.8-donations Donations export | manager | 390×844 | Pass | paired actions, rtl table |
| 2.8-donations Donations export | manager | 1280×800 | Pass | paired actions, rtl table |
| 2.8-donations Donations export | owner | 390×844 | Pass | paired actions, rtl table |
| 2.8-donations Donations export | owner | 1280×800 | Pass | paired actions, rtl table |
| 2.8-event-accounts Event accounts export | manager | 390×844 | Pass | paired actions, rtl table |
| 2.8-event-accounts Event accounts export | manager | 1280×800 | Pass | paired actions, rtl table |
| 2.8-event-accounts Event accounts export | owner | 390×844 | Pass | paired actions, rtl table |
| 2.8-event-accounts Event accounts export | owner | 1280×800 | Pass | paired actions, rtl table |
| 2.8-event-guests Event registrations export | manager | 390×844 | Pass | paired actions, rtl table |
| 2.8-event-guests Event registrations export | manager | 1280×800 | Pass | paired actions, rtl table |
| 2.8-event-guests Event registrations export | owner | 390×844 | Pass | paired actions, rtl table |
| 2.8-event-guests Event registrations export | owner | 1280×800 | Pass | paired actions, rtl table |
| 2.8-event-report Event report export | manager | 390×844 | Pass | paired actions, rtl table |
| 2.8-event-report Event report export | manager | 1280×800 | Pass | paired actions, rtl table |
| 2.8-event-report Event report export | owner | 390×844 | Pass | paired actions, rtl table |
| 2.8-event-report Event report export | owner | 1280×800 | Pass | paired actions, rtl table |
| 2.8-money-report Money report export | manager | 390×844 | Pass | paired actions, rtl table |
| 2.8-money-report Money report export | manager | 1280×800 | Pass | paired actions, rtl table |
| 2.8-money-report Money report export | owner | 390×844 | Pass | paired actions, rtl table |
| 2.8-money-report Money report export | owner | 1280×800 | Pass | paired actions, rtl table |
| 2.8-people People export | manager | 390×844 | Pass | paired actions, rtl table |
| 2.8-people People export | manager | 1280×800 | Pass | paired actions, rtl table |
| 2.8-people People export | owner | 390×844 | Pass | paired actions, rtl table |
| 2.8-people People export | owner | 1280×800 | Pass | paired actions, rtl table |
| 2.8-places Places export | manager | 390×844 | Pass | paired actions, rtl table |
| 2.8-places Places export | manager | 1280×800 | Pass | paired actions, rtl table |
| 2.8-places Places export | owner | 390×844 | Pass | paired actions, rtl table |
| 2.8-places Places export | owner | 1280×800 | Pass | paired actions, rtl table |
| 2.8-shared-table Table sorting, filtering, and scrolling | manager | 390×844 | Pass | filtered people, sticky header after scroll, rtl phone last columns |
| 2.8-shared-table Table sorting, filtering, and scrolling | manager | 1280×800 | Pass | filtered people, sticky header after scroll |
| 2.8-shared-table Table sorting, filtering, and scrolling | owner | 390×844 | Pass | filtered people, sticky header after scroll, rtl phone last columns |
| 2.8-shared-table Table sorting, filtering, and scrolling | owner | 1280×800 | Pass | filtered people, sticky header after scroll |
| 2.8-staff-access Export access for volunteers | staff | 390×844 | Pass | management export guard |
| 2.8-staff-access Export access for volunteers | staff | 1280×800 | Pass | management export guard |
| 2.8-tasks-report Task report export | manager | 390×844 | Pass | paired actions, rtl table |
| 2.8-tasks-report Task report export | manager | 1280×800 | Pass | paired actions, rtl table |
| 2.8-tasks-report Task report export | owner | 390×844 | Pass | paired actions, rtl table |
| 2.8-tasks-report Task report export | owner | 1280×800 | Pass | paired actions, rtl table |
| 2.8-vendors Vendor export | manager | 390×844 | Pass | paired actions, rtl table |
| 2.8-vendors Vendor export | manager | 1280×800 | Pass | paired actions, rtl table |
| 2.8-vendors Vendor export | owner | 390×844 | Pass | paired actions, rtl table |
| 2.8-vendors Vendor export | owner | 1280×800 | Pass | paired actions, rtl table |
| 2.8-visits Visits export | manager | 390×844 | Pass | paired actions, rtl table |
| 2.8-visits Visits export | manager | 1280×800 | Pass | paired actions, rtl table |
| 2.8-visits Visits export | owner | 390×844 | Pass | paired actions, rtl table |
| 2.8-visits Visits export | owner | 1280×800 | Pass | paired actions, rtl table |
