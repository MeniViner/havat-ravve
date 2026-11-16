# Stage 1 event-day verification

Screenshots are kept outside the repository in `havat-ravve-feedback-round-1-smoke-screenshots-6a8584c.zip`.

Both typechecks, the build, the core and demo suites, Firestore rules, and all 250 Worker assertions passed. The build matched the staged app bundle, styles, and service worker. Chrome passed all 66 checks across 18 contexts with zero console errors, warnings, or requests outside the local demo.

- The emulator rejected combining the empty account create and first item update in one batch. The stall queues two ordered writes at first purchase and retains the new account ID if the item update needs a retry. A rules test verified a volunteer can queue both writes while offline and sync them on reconnect.
- Open account counters include only accounts with recorded items or a balance. Management shows claimed payments separately. A guest's ticket query remains scoped to their own tickets.
- Chrome verified QR decoding, the loading state on open and when returning from search, feature-detected focus constraints and the permission refusal message. Physical camera quality, physical autofocus and loss of reception at the gate remain unverified on a phone.
- The same sweep rechecked Stage 0 scenarios with the corrected expectations.

| Check | Persona | Viewport | Result | Screenshot |
| --- | --- | --- | --- | --- |
| 1.1 Picker and account access (Stage 0 regression) | staff | 390×844 | Pass | inline open row grid, inline search grid, inline qr grid, explicit open row grid, explicit search grid, explicit qr grid, all account card, selling header account card, distinct holder same buyer |
| 1.1 Picker and account access (Stage 0 regression) | staff | 1280×800 | Pass | inline open row grid, inline search grid, inline qr grid, explicit open row grid, explicit search grid, explicit qr grid, all account card, selling header account card, distinct holder same buyer |
| 1.1 Picker and account access (Stage 0 regression) | manager | 390×844 | Pass | inline open row grid, inline search grid, inline qr grid, explicit open row grid, explicit search grid, explicit qr grid, all account card, selling header account card, distinct holder same buyer |
| 1.1 Picker and account access (Stage 0 regression) | manager | 1280×800 | Pass | inline open row grid, inline search grid, inline qr grid, explicit open row grid, explicit search grid, explicit qr grid, all account card, selling header account card, distinct holder same buyer |
| 1.1 Picker and account access (Stage 0 regression) | owner | 390×844 | Pass | inline open row grid, inline search grid, inline qr grid, explicit open row grid, explicit search grid, explicit qr grid, all account card, selling header account card, distinct holder same buyer |
| 1.1 Picker and account access (Stage 0 regression) | owner | 1280×800 | Pass | inline open row grid, inline search grid, inline qr grid, explicit open row grid, explicit search grid, explicit qr grid, all account card, selling header account card, distinct holder same buyer |
| 1.2 First purchase and account totals (Stage 0 regression) | staff | 390×844 | Pass | picker no new row, hub 0, stall accounts 0, hub 1, stall accounts 1, picker first real account |
| 1.2 First purchase and account totals (Stage 0 regression) | staff | 1280×800 | Pass | picker no new row, hub 0, stall accounts 0, hub 1, stall accounts 1, picker first real account |
| 1.2 First purchase and account totals (Stage 0 regression) | manager | 390×844 | Pass | picker no new row, hub 0, stall accounts 0, manager accounts 0, hub 1, stall accounts 1, manager accounts 1, picker first real account |
| 1.2 First purchase and account totals (Stage 0 regression) | manager | 1280×800 | Pass | picker no new row, hub 0, stall accounts 0, manager accounts 0, hub 1, stall accounts 1, manager accounts 1, picker first real account |
| 1.2 First purchase and account totals (Stage 0 regression) | owner | 390×844 | Pass | picker no new row, hub 0, stall accounts 0, manager accounts 0, hub 1, stall accounts 1, manager accounts 1, picker first real account |
| 1.2 First purchase and account totals (Stage 0 regression) | owner | 1280×800 | Pass | picker no new row, hub 0, stall accounts 0, manager accounts 0, hub 1, stall accounts 1, manager accounts 1, picker first real account |
| 1.3 Cart quantities and undo (Stage 0 regression) | staff | 390×844 | Pass | five items and controls, olive oil removed, cleared with undo, two quantities restored |
| 1.3 Cart quantities and undo (Stage 0 regression) | staff | 1280×800 | Pass | five items and controls, olive oil removed, cleared with undo, two quantities restored |
| 1.3 Cart quantities and undo (Stage 0 regression) | manager | 390×844 | Pass | five items and controls, olive oil removed, cleared with undo, two quantities restored |
| 1.3 Cart quantities and undo (Stage 0 regression) | manager | 1280×800 | Pass | five items and controls, olive oil removed, cleared with undo, two quantities restored |
| 1.3 Cart quantities and undo (Stage 0 regression) | owner | 390×844 | Pass | five items and controls, olive oil removed, cleared with undo, two quantities restored |
| 1.3 Cart quantities and undo (Stage 0 regression) | owner | 1280×800 | Pass | five items and controls, olive oil removed, cleared with undo, two quantities restored |
| 1.4-gate Gate search (Stage 0 regression) | staff | 390×844 | Pass | single hebrew character |
| 1.4-gate Gate search (Stage 0 regression) | staff | 1280×800 | Pass | single hebrew character |
| 1.4-gate Gate search (Stage 0 regression) | manager | 390×844 | Pass | single hebrew character |
| 1.4-gate Gate search (Stage 0 regression) | manager | 1280×800 | Pass | single hebrew character |
| 1.4-gate Gate search (Stage 0 regression) | owner | 390×844 | Pass | single hebrew character |
| 1.4-gate Gate search (Stage 0 regression) | owner | 1280×800 | Pass | single hebrew character |
| 1.4-stall Stall search (Stage 0 regression) | staff | 390×844 | Pass | single hebrew character |
| 1.4-stall Stall search (Stage 0 regression) | staff | 1280×800 | Pass | single hebrew character |
| 1.4-stall Stall search (Stage 0 regression) | manager | 390×844 | Pass | single hebrew character |
| 1.4-stall Stall search (Stage 0 regression) | manager | 1280×800 | Pass | single hebrew character |
| 1.4-stall Stall search (Stage 0 regression) | owner | 390×844 | Pass | single hebrew character |
| 1.4-stall Stall search (Stage 0 regression) | owner | 1280×800 | Pass | single hebrew character |
| 1.5-scan Countdown returns to scan | staff | 390×844 | Pass | scan live two seconds |
| 1.5-scan Countdown returns to scan | staff | 1280×800 | Pass | scan live two seconds |
| 1.5-scan Countdown returns to scan | manager | 390×844 | Pass | scan live two seconds |
| 1.5-scan Countdown returns to scan | manager | 1280×800 | Pass | scan live two seconds |
| 1.5-scan Countdown returns to scan | owner | 390×844 | Pass | scan live two seconds |
| 1.5-scan Countdown returns to scan | owner | 1280×800 | Pass | scan live two seconds |
| 1.5-search Countdown returns to search | staff | 390×844 | Pass | search live two seconds |
| 1.5-search Countdown returns to search | staff | 1280×800 | Pass | search live two seconds |
| 1.5-search Countdown returns to search | manager | 390×844 | Pass | search live two seconds |
| 1.5-search Countdown returns to search | manager | 1280×800 | Pass | search live two seconds |
| 1.5-search Countdown returns to search | owner | 390×844 | Pass | search live two seconds |
| 1.5-search Countdown returns to search | owner | 1280×800 | Pass | search live two seconds |
| 1.6 Orders and people | staff | 390×844 | Pass | two gate orders, one stall guest, single ticket grammar |
| 1.6 Orders and people | staff | 1280×800 | Pass | two gate orders, one stall guest, single ticket grammar |
| 1.6 Orders and people | manager | 390×844 | Pass | two gate orders, one stall guest, single ticket grammar |
| 1.6 Orders and people | manager | 1280×800 | Pass | two gate orders, one stall guest, single ticket grammar |
| 1.6 Orders and people | owner | 390×844 | Pass | two gate orders, one stall guest, single ticket grammar |
| 1.6 Orders and people | owner | 1280×800 | Pass | two gate orders, one stall guest, single ticket grammar |
| 1.7 Camera preview and permissions | staff | 390×844 | Pass | initial loading, native playing preview, loading after search, permission denied |
| 1.7 Camera preview and permissions | staff | 1280×800 | Pass | initial loading, native playing preview, loading after search, permission denied |
| 1.7 Camera preview and permissions | manager | 390×844 | Pass | initial loading, native playing preview, loading after search, permission denied |
| 1.7 Camera preview and permissions | manager | 1280×800 | Pass | initial loading, native playing preview, loading after search, permission denied |
| 1.7 Camera preview and permissions | owner | 390×844 | Pass | initial loading, native playing preview, loading after search, permission denied |
| 1.7 Camera preview and permissions | owner | 1280×800 | Pass | initial loading, native playing preview, loading after search, permission denied |
| 1.8 Guest event privacy (Stage 0 regression) | staff | 390×844 | Pass | event page no attendee section |
| 1.8 Guest event privacy (Stage 0 regression) | staff | 1280×800 | Pass | event page no attendee section |
| 1.8 Guest event privacy (Stage 0 regression) | manager | 390×844 | Pass | event page no attendee section |
| 1.8 Guest event privacy (Stage 0 regression) | manager | 1280×800 | Pass | event page no attendee section |
| 1.8 Guest event privacy (Stage 0 regression) | owner | 390×844 | Pass | event page no attendee section |
| 1.8 Guest event privacy (Stage 0 regression) | owner | 1280×800 | Pass | event page no attendee section |
| 1.8 Guest event privacy (Stage 0 regression) | guest | 390×844 | Pass | event page no attendee section |
| 1.8 Guest event privacy (Stage 0 regression) | guest | 1280×800 | Pass | event page no attendee section |
| 1.8 Guest event privacy (Stage 0 regression) | anon | 390×844 | Pass | event page no attendee section |
| 1.8 Guest event privacy (Stage 0 regression) | anon | 1280×800 | Pass | event page no attendee section |
| 1.8 Guest event privacy (Stage 0 regression) | blocked | 390×844 | Pass | blocked event guard |
| 1.8 Guest event privacy (Stage 0 regression) | blocked | 1280×800 | Pass | blocked event guard |
