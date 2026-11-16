# Stage 3 event modules

Screenshots are kept outside the repository in `havat-ravve-feedback-round-1-smoke-screenshots-6a8584c.zip`.

Chrome passed all 50 current-stage checks at 390×844 and 1280×800 with a clean console. Both typechecks, staged build parity, core and demo tests, Firestore rules, and all 250 Worker assertions passed.

The same preview passed all 98 [Stage 2 checks](../2/README.md) and all 66 [Stage 1 checks](../1/README.md), including the corrected Stage 0 scenarios, with no browser diagnostics.

The Saturday tour starts with both modules off and the autumn festival starts with both on. The October event verifies the enabled default on older documents. The manager editor round trip covered both mixed settings and restored the original switches after testing.

External vendor planning remains an independent event tab. The gate and stall route guards apply to staff shortcuts and direct links. Staff can open the task list from an event with both modules off.

| Check | Persona | Viewport | Result | Screenshot |
| --- | --- | --- | --- | --- |
| 3.autumn Festival with both modules enabled | staff | 390×844 | Pass | overview |
| 3.autumn Festival with both modules enabled | staff | 1280×800 | Pass | overview |
| 3.autumn Festival with both modules enabled | manager | 390×844 | Pass | overview |
| 3.autumn Festival with both modules enabled | manager | 1280×800 | Pass | overview |
| 3.autumn Festival with both modules enabled | owner | 390×844 | Pass | overview |
| 3.autumn Festival with both modules enabled | owner | 1280×800 | Pass | overview |
| 3.enabled-cross-actions Shortcuts between enabled modules | staff | 390×844 | Pass | gate to stall, search to stall picker, stall to gate |
| 3.enabled-cross-actions Shortcuts between enabled modules | staff | 1280×800 | Pass | gate to stall, search to stall picker, stall to gate |
| 3.enabled-cross-actions Shortcuts between enabled modules | manager | 390×844 | Pass | gate to stall, search to stall picker, stall to gate |
| 3.enabled-cross-actions Shortcuts between enabled modules | manager | 1280×800 | Pass | gate to stall, search to stall picker, stall to gate |
| 3.enabled-cross-actions Shortcuts between enabled modules | owner | 390×844 | Pass | gate to stall, search to stall picker, stall to gate |
| 3.enabled-cross-actions Shortcuts between enabled modules | owner | 1280×800 | Pass | gate to stall, search to stall picker, stall to gate |
| 3.entry-off-only Stall only | staff | 390×844 | Pass | staff event hub, guarded module, stall without gate |
| 3.entry-off-only Stall only | staff | 1280×800 | Pass | staff event hub, guarded module, stall without gate |
| 3.entry-off-only Stall only | manager | 390×844 | Pass | editor after reload, management, staff event hub, guarded module, stall without gate |
| 3.entry-off-only Stall only | manager | 1280×800 | Pass | editor after reload, management, staff event hub, guarded module, stall without gate |
| 3.entry-off-only Stall only | owner | 390×844 | Pass | editor after reload, management, staff event hub, guarded module, stall without gate |
| 3.entry-off-only Stall only | owner | 1280×800 | Pass | editor after reload, management, staff event hub, guarded module, stall without gate |
| 3.manager-navigation Module visibility in management | manager | 390×844 | Pass | demo e tour navigation, demo e fall navigation, demo e oct navigation |
| 3.manager-navigation Module visibility in management | manager | 1280×800 | Pass | demo e tour navigation, demo e fall navigation, demo e oct navigation |
| 3.manager-navigation Module visibility in management | owner | 390×844 | Pass | demo e tour navigation, demo e fall navigation, demo e oct navigation |
| 3.manager-navigation Module visibility in management | owner | 1280×800 | Pass | demo e tour navigation, demo e fall navigation, demo e oct navigation |
| 3.october-legacy Older event defaults | staff | 390×844 | Pass | overview |
| 3.october-legacy Older event defaults | staff | 1280×800 | Pass | overview |
| 3.october-legacy Older event defaults | manager | 390×844 | Pass | overview |
| 3.october-legacy Older event defaults | manager | 1280×800 | Pass | overview |
| 3.october-legacy Older event defaults | owner | 390×844 | Pass | overview |
| 3.october-legacy Older event defaults | owner | 1280×800 | Pass | overview |
| 3.restore-both Save and reopen both switches enabled | manager | 390×844 | Pass | editor after reload |
| 3.restore-both Save and reopen both switches enabled | manager | 1280×800 | Pass | editor after reload |
| 3.restore-both Save and reopen both switches enabled | owner | 390×844 | Pass | editor after reload |
| 3.restore-both Save and reopen both switches enabled | owner | 1280×800 | Pass | editor after reload |
| 3.stall-off-only Entry only | staff | 390×844 | Pass | staff event hub, guarded module, gate without stall, gate search without stall |
| 3.stall-off-only Entry only | staff | 1280×800 | Pass | staff event hub, guarded module, gate without stall, gate search without stall |
| 3.stall-off-only Entry only | manager | 390×844 | Pass | editor after reload, management, staff event hub, guarded module, gate without stall, gate search without stall |
| 3.stall-off-only Entry only | manager | 1280×800 | Pass | editor after reload, management, staff event hub, guarded module, gate without stall, gate search without stall |
| 3.stall-off-only Entry only | owner | 390×844 | Pass | editor after reload, management, staff event hub, guarded module, gate without stall, gate search without stall |
| 3.stall-off-only Entry only | owner | 1280×800 | Pass | editor after reload, management, staff event hub, guarded module, gate without stall, gate search without stall |
| 3.tour Tour details and Tasks link | staff | 390×844 | Pass | event details and tasks |
| 3.tour Tour details and Tasks link | staff | 1280×800 | Pass | event details and tasks |
| 3.tour Tour details and Tasks link | manager | 390×844 | Pass | event details and tasks |
| 3.tour Tour details and Tasks link | manager | 1280×800 | Pass | event details and tasks |
| 3.tour Tour details and Tasks link | owner | 390×844 | Pass | event details and tasks |
| 3.tour Tour details and Tasks link | owner | 1280×800 | Pass | event details and tasks |
| 3.tour-direct-links Guarded staff routes | staff | 390×844 | Pass | guarded entrance, guarded stall |
| 3.tour-direct-links Guarded staff routes | staff | 1280×800 | Pass | guarded entrance, guarded stall |
| 3.tour-direct-links Guarded staff routes | manager | 390×844 | Pass | guarded entrance, guarded stall |
| 3.tour-direct-links Guarded staff routes | manager | 1280×800 | Pass | guarded entrance, guarded stall |
| 3.tour-direct-links Guarded staff routes | owner | 390×844 | Pass | guarded entrance, guarded stall |
| 3.tour-direct-links Guarded staff routes | owner | 1280×800 | Pass | guarded entrance, guarded stall |
