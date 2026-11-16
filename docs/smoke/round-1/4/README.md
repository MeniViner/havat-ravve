# Stage 4 farm calendar

Screenshots are kept outside the repository in `havat-ravve-feedback-round-1-smoke-screenshots-6a8584c.zip`.

Chrome passed all 70 current-stage checks at 390×844 and 1280×800 with a clean console. Both typechecks, staged build parity, core and demo tests, Firestore rules, and all 254 Worker assertions passed.

- Team navigation and Today link to the same calendar. The Today strip covers the current Sunday–Saturday week. Presence colours follow the person's ID. Multiple shifts for the same person on one day contribute one dot. Filled and outlined dots distinguish managers and volunteers.
- Calendar members can manage their own presence. Managers can manage team entries, meetings, and festival planning. Approving a visit and publishing an event in demo both added the referenced entry automatically.
- Week and Day preserve stored ranges. A single time draws a 30-minute marker. Older entries with descriptive times such as `שקיעה` stay readable in the all-day row. The selected-day agenda shows full names and times when several entries overlap in the grid.

The same preview passed all 214 earlier regression checks with no browser diagnostics. [Stage 1 evidence](../1/README.md) · [Stage 2 evidence](../2/README.md) · [Stage 3 evidence](../3/README.md)

Screenshot review caught clipped labels on short appointments. These now use one line, and very short appointments use an exact-duration marker. The agenda shows full details with edit access. The final browser run verified both behaviours.

| Check | Persona | Viewport | Result | Screenshot |
| --- | --- | --- | --- | --- |
| 4.all-day-legacy All-day rows and older time labels | staff | 390×844 | Pass | day empty time, day legacy time |
| 4.all-day-legacy All-day rows and older time labels | staff | 1280×800 | Pass | day empty time, day legacy time |
| 4.all-day-legacy All-day rows and older time labels | manager | 390×844 | Pass | day empty time, day legacy time |
| 4.all-day-legacy All-day rows and older time labels | manager | 1280×800 | Pass | day empty time, day legacy time |
| 4.all-day-legacy All-day rows and older time labels | owner | 390×844 | Pass | day empty time, day legacy time |
| 4.all-day-legacy All-day rows and older time labels | owner | 1280×800 | Pass | day empty time, day legacy time |
| 4.approve-and-publish Automatic visit and event entries | manager | 390×844 | Pass | newly approved visit, newly published event |
| 4.approve-and-publish Automatic visit and event entries | manager | 1280×800 | Pass | newly approved visit, newly published event |
| 4.approve-and-publish Automatic visit and event entries | owner | 390×844 | Pass | newly approved visit, newly published event |
| 4.approve-and-publish Automatic visit and event entries | owner | 1280×800 | Pass | newly approved visit, newly published event |
| 4.day-timed Timed day placement and overlap | staff | 390×844 | Pass | day timed range, day single time, day single time agenda, week timed range, week single time |
| 4.day-timed Timed day placement and overlap | staff | 1280×800 | Pass | day timed range, day single time, day single time agenda, week timed range, week single time |
| 4.day-timed Timed day placement and overlap | manager | 390×844 | Pass | day timed range, day single time, day single time agenda, week timed range, week single time |
| 4.day-timed Timed day placement and overlap | manager | 1280×800 | Pass | day timed range, day single time, day single time agenda, week timed range, week single time |
| 4.day-timed Timed day placement and overlap | owner | 390×844 | Pass | day timed range, day single time, day single time agenda, week timed range, week single time |
| 4.day-timed Timed day placement and overlap | owner | 1280×800 | Pass | day timed range, day single time, day single time agenda, week timed range, week single time |
| 4.dots Stable colours, roles, and overflow | staff | 390×844 | Pass | today dots, month dots, week dots, day dots, next month dots |
| 4.dots Stable colours, roles, and overflow | staff | 1280×800 | Pass | today dots, month dots, week dots, day dots, next month dots |
| 4.dots Stable colours, roles, and overflow | manager | 390×844 | Pass | today dots, month dots, week dots, day dots, next month dots |
| 4.dots Stable colours, roles, and overflow | manager | 1280×800 | Pass | today dots, month dots, week dots, day dots, next month dots |
| 4.dots Stable colours, roles, and overflow | owner | 390×844 | Pass | today dots, month dots, week dots, day dots, next month dots |
| 4.dots Stable colours, roles, and overflow | owner | 1280×800 | Pass | today dots, month dots, week dots, day dots, next month dots |
| 4.guest-denied Guest calendar access | guest | 390×844 | Pass | calendar denied, mark presence denied |
| 4.guest-denied Guest calendar access | guest | 1280×800 | Pass | calendar denied, mark presence denied |
| 4.manager-entry-types Manager entry types | manager | 390×844 | Pass | meeting created, planning created, manual created |
| 4.manager-entry-types Manager entry types | manager | 1280×800 | Pass | meeting created, planning created, manual created |
| 4.manager-entry-types Manager entry types | owner | 390×844 | Pass | meeting created, planning created, manual created |
| 4.manager-entry-types Manager entry types | owner | 1280×800 | Pass | meeting created, planning created, manual created |
| 4.manager-other-presence Manager controls for team presence | manager | 390×844 | Pass | other person edit, other person changed |
| 4.manager-other-presence Manager controls for team presence | manager | 1280×800 | Pass | other person edit, other person changed |
| 4.manager-other-presence Manager controls for team presence | owner | 390×844 | Pass | other person edit, other person changed |
| 4.manager-other-presence Manager controls for team presence | owner | 1280×800 | Pass | other person edit, other person changed |
| 4.month Month view | staff | 390×844 | Pass | month grid |
| 4.month Month view | staff | 1280×800 | Pass | month grid |
| 4.month Month view | manager | 390×844 | Pass | month grid |
| 4.month Month view | manager | 1280×800 | Pass | month grid |
| 4.month Month view | owner | 390×844 | Pass | month grid |
| 4.month Month view | owner | 1280×800 | Pass | month grid |
| 4.navigation-today Team navigation and Today strip | staff | 390×844 | Pass | main navigation, today presence strip |
| 4.navigation-today Team navigation and Today strip | staff | 1280×800 | Pass | main navigation, today presence strip |
| 4.navigation-today Team navigation and Today strip | manager | 390×844 | Pass | main navigation, today presence strip |
| 4.navigation-today Team navigation and Today strip | manager | 1280×800 | Pass | main navigation, today presence strip |
| 4.navigation-today Team navigation and Today strip | owner | 390×844 | Pass | main navigation, today presence strip |
| 4.navigation-today Team navigation and Today strip | owner | 1280×800 | Pass | main navigation, today presence strip |
| 4.own-presence Own presence create, edit, and remove | staff | 390×844 | Pass | presence create, presence edit, presence delete undo |
| 4.own-presence Own presence create, edit, and remove | staff | 1280×800 | Pass | presence create, presence edit, presence delete undo |
| 4.own-presence Own presence create, edit, and remove | manager | 390×844 | Pass | presence create, presence edit, presence delete undo |
| 4.own-presence Own presence create, edit, and remove | manager | 1280×800 | Pass | presence create, presence edit, presence delete undo |
| 4.own-presence Own presence create, edit, and remove | owner | 390×844 | Pass | presence create, presence edit, presence delete undo |
| 4.own-presence Own presence create, edit, and remove | owner | 1280×800 | Pass | presence create, presence edit, presence delete undo |
| 4.period-navigation Calendar period navigation | staff | 390×844 | Pass | month next, day return to today |
| 4.period-navigation Calendar period navigation | staff | 1280×800 | Pass | month next, day return to today |
| 4.period-navigation Calendar period navigation | manager | 390×844 | Pass | month next, day return to today |
| 4.period-navigation Calendar period navigation | manager | 1280×800 | Pass | month next, day return to today |
| 4.period-navigation Calendar period navigation | owner | 390×844 | Pass | month next, day return to today |
| 4.period-navigation Calendar period navigation | owner | 1280×800 | Pass | month next, day return to today |
| 4.source-fixtures Published events and approved visits | staff | 390×844 | Pass | approved visit, published event |
| 4.source-fixtures Published events and approved visits | staff | 1280×800 | Pass | approved visit, published event |
| 4.source-fixtures Published events and approved visits | manager | 390×844 | Pass | approved visit, published event |
| 4.source-fixtures Published events and approved visits | manager | 1280×800 | Pass | approved visit, published event |
| 4.source-fixtures Published events and approved visits | owner | 390×844 | Pass | approved visit, published event |
| 4.source-fixtures Published events and approved visits | owner | 1280×800 | Pass | approved visit, published event |
| 4.staff-permissions Volunteer edit permissions | staff | 390×844 | Pass | other person denied, presence only form |
| 4.staff-permissions Volunteer edit permissions | staff | 1280×800 | Pass | other person denied, presence only form |
| 4.week Week hour grid | staff | 390×844 | Pass | week grid, week last date |
| 4.week Week hour grid | staff | 1280×800 | Pass | week grid, week last date |
| 4.week Week hour grid | manager | 390×844 | Pass | week grid, week last date |
| 4.week Week hour grid | manager | 1280×800 | Pass | week grid, week last date |
| 4.week Week hour grid | owner | 390×844 | Pass | week grid, week last date |
| 4.week Week hour grid | owner | 1280×800 | Pass | week grid, week last date |
