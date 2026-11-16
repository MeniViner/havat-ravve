# Stage 0 browser baseline

Screenshots are kept outside the repository in `havat-ravve-feedback-round-1-smoke-screenshots-6a8584c.zip`.

Chrome on the local demo reproduced the reported defects. The result column answers whether the baseline behaviour matched the expected reproduction or control. The console was clean in all 12 persona and viewport combinations.

- **1.1** The inline stall picker stayed open after selecting an open account, a search result or a scanned ticket. The direct picker and account-list workaround opened the grid.
- **1.2** A gate scan left accounts unchanged. Selecting a person in the stall created an empty account that increased the relevant totals.
- **1.3** A cart containing two teas, two cheeses and one olive oil totalled ₪135. The clear button removed all entries and offered no undo.
- **1.4** Both search boxes required two characters before showing matches.
- **1.8** The published event page showed 20 registrations and buyer initials to all personas able to open it. The blocked persona reached its suspension screen.

| Check | Persona | Viewport | Result | Screenshot |
| --- | --- | --- | --- | --- |
| Stall guest selection | staff | 390×844 | Pass | Open row, Accounts workaround, Search result, QR, Direct picker |
| Stall guest selection | staff | 1280×800 | Pass | Open row, Accounts workaround, Search result, QR, Direct picker |
| Stall guest selection | manager | 390×844 | Pass | Open row, Accounts workaround, Search result, QR, Direct picker |
| Stall guest selection | manager | 1280×800 | Pass | Open row, Accounts workaround, Search result, QR, Direct picker |
| Stall guest selection | owner | 390×844 | Pass | Open row, Accounts workaround, Search result, QR, Direct picker |
| Stall guest selection | owner | 1280×800 | Pass | Open row, Accounts workaround, Search result, QR, Direct picker |
| Empty stall accounts | staff | 390×844 | Pass | Gate scan, Empty row, Stall accounts, Event hub |
| Empty stall accounts | staff | 1280×800 | Pass | Gate scan, Empty row, Stall accounts, Event hub |
| Empty stall accounts | manager | 390×844 | Pass | Gate scan, Empty row, Stall accounts, Event hub, Manager accounts |
| Empty stall accounts | manager | 1280×800 | Pass | Gate scan, Empty row, Stall accounts, Event hub, Manager accounts |
| Empty stall accounts | owner | 390×844 | Pass | Gate scan, Empty row, Stall accounts, Event hub, Manager accounts |
| Empty stall accounts | owner | 1280×800 | Pass | Gate scan, Empty row, Stall accounts, Event hub, Manager accounts |
| Per-item cart controls | staff | 390×844 | Pass | Cart, Clear |
| Per-item cart controls | staff | 1280×800 | Pass | Cart, Clear |
| Per-item cart controls | manager | 390×844 | Pass | Cart, Clear |
| Per-item cart controls | manager | 1280×800 | Pass | Cart, Clear |
| Per-item cart controls | owner | 390×844 | Pass | Cart, Clear |
| Per-item cart controls | owner | 1280×800 | Pass | Cart, Clear |
| First-character gate search | staff | 390×844 | Pass | One character, Two characters |
| First-character gate search | staff | 1280×800 | Pass | One character, Two characters |
| First-character gate search | manager | 390×844 | Pass | One character, Two characters |
| First-character gate search | manager | 1280×800 | Pass | One character, Two characters |
| First-character gate search | owner | 390×844 | Pass | One character, Two characters |
| First-character gate search | owner | 1280×800 | Pass | One character, Two characters |
| First-character stall search | staff | 390×844 | Pass | One character, Two characters |
| First-character stall search | staff | 1280×800 | Pass | One character, Two characters |
| First-character stall search | manager | 390×844 | Pass | One character, Two characters |
| First-character stall search | manager | 1280×800 | Pass | One character, Two characters |
| First-character stall search | owner | 390×844 | Pass | One character, Two characters |
| First-character stall search | owner | 1280×800 | Pass | One character, Two characters |
| Guest event registration count | staff | 390×844 | Pass | Registration count |
| Guest event registration count | staff | 1280×800 | Pass | Registration count |
| Guest event registration count | manager | 390×844 | Pass | Registration count |
| Guest event registration count | manager | 1280×800 | Pass | Registration count |
| Guest event registration count | owner | 390×844 | Pass | Registration count |
| Guest event registration count | owner | 1280×800 | Pass | Registration count |
| Guest event registration count | guest | 390×844 | Pass | Registration count |
| Guest event registration count | guest | 1280×800 | Pass | Registration count |
| Guest event registration count | anon | 390×844 | Pass | Registration count |
| Guest event registration count | anon | 1280×800 | Pass | Registration count |
| Guest event registration count | blocked | 390×844 | Pass | Blocked account |
| Guest event registration count | blocked | 1280×800 | Pass | Blocked account |
