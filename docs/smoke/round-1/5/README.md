# Stage 5 guest experience

Screenshots are kept outside the repository in `havat-ravve-feedback-round-1-smoke-screenshots-6a8584c.zip`.

Chrome passed all 70 current-stage checks at 390×844 and 1280×800 with zero console warnings, errors, browser dialogs, or off-origin requests. The 126 screenshots were captured at those viewport sizes.

Both typechecks, the build and staged distribution parity, the core and demo suites, Firestore rules, and all 258 Worker assertions passed. The rules tests included a manager recording confirmation for a full 20-ticket order.

- The new registration and Account flows both use the configured questions. A separate browser run with local Auth and Firestore verified a required answer in the saved guest profile. The same run verified that the `/admin` link appears while the CMS grant is active and disappears after revocation.
- Browser checks intercepted 24 WhatsApp and email draft actions and validated their destinations and text. Managers explicitly record who sent the confirmation and when. The existing donation receipt record remains separate.
- The local built app registered its service worker and Chrome found the manifest installable in a fresh normal profile. The browser checks simulated Android/Chrome and iPhone installation signals. Physical-device installation remains unverified.
- The demo holds a guest's previous-visit cutoff while they browse. Ordinary event edits preserve publication time. Creating a published event or publishing it again records a fresh timestamp in the app and Worker.

The same preview passed all 284 earlier checks. These replays include the five Stage 0 defects with the corrected expectations. [Stage 1](../1/README.md) · [Stage 2](../2/README.md) · [Stage 3](../3/README.md) · [Stage 4](../4/README.md)

| Design review | Result | Evidence |
| --- | --- | --- |
| 5.2 Automatic payment confirmation email | Pass | [Email design](../../../receipts-email-design.md) |
| 5.5 Background push options | Pass | [Push design](../../../push-design.md) |

| Check | Persona | Viewport | Result | Screenshot |
| --- | --- | --- | --- | --- |
| 5.1.edit-account Edit registration answers from Account | guest | 390×844 | Pass | existing profile edit |
| 5.1.edit-account Edit registration answers from Account | guest | 1280×800 | Pass | existing profile edit |
| 5.1.new-registration New profile with required and optional questions | new | 390×844 | Pass | configured registration form, new profile persisted |
| 5.1.new-registration New profile with required and optional questions | new | 1280×800 | Pass | configured registration form, new profile persisted |
| 5.2.free-order Free registration | guest | 390×844 | Pass | free tour ticket |
| 5.2.free-order Free registration | guest | 1280×800 | Pass | free tour ticket |
| 5.2.guest-donation Guest payment confirmation choice on a donation | guest | 390×844 | Pass | prefilled payment confirmation choice, donation payment screen |
| 5.2.guest-donation Guest payment confirmation choice on a donation | guest | 1280×800 | Pass | prefilled payment confirmation choice, donation payment screen |
| 5.2.guest-order Guest payment confirmation choice on a ticket order | guest | 390×844 | Pass | prefilled payment confirmation choice, priced ticket created |
| 5.2.guest-order Guest payment confirmation choice on a ticket order | guest | 1280×800 | Pass | prefilled payment confirmation choice, priced ticket created |
| 5.2.guest-stall Guest payment confirmation choice on a stall account | guest | 390×844 | Pass | prefilled payment confirmation choice, stall claimed |
| 5.2.guest-stall Guest payment confirmation choice on a stall account | guest | 1280×800 | Pass | prefilled payment confirmation choice, stall claimed |
| 5.2.manager-donation Manager donation draft links and sent audit | manager | 390×844 | Pass | two drafts and guest preference, manual sent audit |
| 5.2.manager-donation Manager donation draft links and sent audit | manager | 1280×800 | Pass | two drafts and guest preference, manual sent audit |
| 5.2.manager-donation Manager donation draft links and sent audit | owner | 390×844 | Pass | two drafts and guest preference, manual sent audit |
| 5.2.manager-donation Manager donation draft links and sent audit | owner | 1280×800 | Pass | two drafts and guest preference, manual sent audit |
| 5.2.manager-order Manager ticket order draft links and sent audit | manager | 390×844 | Pass | two drafts and guest preference, manual sent audit |
| 5.2.manager-order Manager ticket order draft links and sent audit | manager | 1280×800 | Pass | two drafts and guest preference, manual sent audit |
| 5.2.manager-order Manager ticket order draft links and sent audit | owner | 390×844 | Pass | two drafts and guest preference, manual sent audit |
| 5.2.manager-order Manager ticket order draft links and sent audit | owner | 1280×800 | Pass | two drafts and guest preference, manual sent audit |
| 5.2.manager-stall Manager stall account draft links and sent audit | manager | 390×844 | Pass | two drafts and guest preference, manual sent audit |
| 5.2.manager-stall Manager stall account draft links and sent audit | manager | 1280×800 | Pass | two drafts and guest preference, manual sent audit |
| 5.2.manager-stall Manager stall account draft links and sent audit | owner | 390×844 | Pass | two drafts and guest preference, manual sent audit |
| 5.2.manager-stall Manager stall account draft links and sent audit | owner | 1280×800 | Pass | two drafts and guest preference, manual sent audit |
| 5.2.reuse-and-edit Reuse choice across payments and edit it from Account | guest | 390×844 | Pass | prefilled payment confirmation choice, profile channel change |
| 5.2.reuse-and-edit Reuse choice across payments and edit it from Account | guest | 1280×800 | Pass | prefilled payment confirmation choice, profile channel change |
| 5.3.contact-request Contact form, manager inbox and reply actions | staff | 390×844 | Pass | signed in contact form, contact submitted, manager queue and reply, manager handled contact |
| 5.3.contact-request Contact form, manager inbox and reply actions | staff | 1280×800 | Pass | signed in contact form, contact submitted, manager queue and reply, manager handled contact |
| 5.3.contact-request Contact form, manager inbox and reply actions | guest | 390×844 | Pass | signed in contact form, contact submitted, manager queue and reply, manager handled contact |
| 5.3.contact-request Contact form, manager inbox and reply actions | guest | 1280×800 | Pass | signed in contact form, contact submitted, manager queue and reply, manager handled contact |
| 5.3.official-contact Official contact settings and missing numbers | manager | 390×844 | Pass | blocked number from settings, signed in contact number from settings, blocked without whatsapp, blocked without contact number |
| 5.3.official-contact Official contact settings and missing numbers | manager | 1280×800 | Pass | blocked number from settings, signed in contact number from settings, blocked without whatsapp, blocked without contact number |
| 5.3.official-contact Official contact settings and missing numbers | owner | 390×844 | Pass | blocked number from settings, signed in contact number from settings, blocked without whatsapp, blocked without contact number |
| 5.3.official-contact Official contact settings and missing numbers | owner | 1280×800 | Pass | blocked number from settings, signed in contact number from settings, blocked without whatsapp, blocked without contact number |
| 5.3.signed-in-contact-access Contact form requires an eligible account | anon | 390×844 | Pass | signed in contact required |
| 5.3.signed-in-contact-access Contact form requires an eligible account | anon | 1280×800 | Pass | signed in contact required |
| 5.3.signed-in-contact-access Contact form requires an eligible account | blocked | 390×844 | Pass | signed in contact required |
| 5.3.signed-in-contact-access Contact form requires an eligible account | blocked | 1280×800 | Pass | signed in contact required |
| 5.4.appinstalled Suppress invitation after installation | guest | 390×844 | Pass | installed suppression |
| 5.4.appinstalled Suppress invitation after installation | guest | 1280×800 | Pass | installed suppression |
| 5.4.built-manifest Built manifest, icons and service worker | guest | 390×844 | Pass | built app manifest and worker |
| 5.4.built-manifest Built manifest, icons and service worker | guest | 1280×800 | Pass | built app manifest and worker |
| 5.4.chrome-first-visit Chrome first screen and captured install prompt | guest | 390×844 | Pass | first screen, captured chrome prompt |
| 5.4.chrome-first-visit Chrome first screen and captured install prompt | guest | 1280×800 | Pass | first screen, captured chrome prompt |
| 5.4.chrome-native-dismissal Dismissal through the browser prompt | guest | 390×844 | Pass | dismissed native prompt |
| 5.4.chrome-native-dismissal Dismissal through the browser prompt | guest | 1280×800 | Pass | dismissed native prompt |
| 5.4.dismissal-two-weeks Banner dismissal, persistence and expiry | guest | 390×844 | Pass | still dismissed day 14, shown after day 14 |
| 5.4.dismissal-two-weeks Banner dismissal, persistence and expiry | guest | 1280×800 | Pass | still dismissed day 14, shown after day 14 |
| 5.4.ios-first-visit First screen and Safari install instructions | guest | 390×844 | Pass | first screen, safari instructions |
| 5.4.ios-first-visit First screen and Safari install instructions | guest | 1280×800 | Pass | first screen, safari instructions |
| 5.4.standalone-chrome Suppress invitation in Chrome standalone | guest | 390×844 | Pass | installed display mode |
| 5.4.standalone-chrome Suppress invitation in Chrome standalone | guest | 1280×800 | Pass | installed display mode |
| 5.4.standalone-ios Suppress invitation in iOS standalone | guest | 390×844 | Pass | installed safari |
| 5.4.standalone-ios Suppress invitation in iOS standalone | guest | 1280×800 | Pass | installed safari |
| 5.5.newly-published-badge New publication badge and previous visit | guest | 390×844 | Pass | prior visit, newly published event, next visit already seen |
| 5.5.newly-published-badge New publication badge and previous visit | guest | 1280×800 | Pass | prior visit, newly published event, next visit already seen |
| 5.6.cms-editor-link CMS link visibility by persona | staff | 390×844 | Pass | cms link absent |
| 5.6.cms-editor-link CMS link visibility by persona | staff | 1280×800 | Pass | cms link absent |
| 5.6.cms-editor-link CMS link visibility by persona | manager | 390×844 | Pass | cms link absent |
| 5.6.cms-editor-link CMS link visibility by persona | manager | 1280×800 | Pass | cms link absent |
| 5.6.cms-editor-link CMS link visibility by persona | owner | 390×844 | Pass | entitled public site editor |
| 5.6.cms-editor-link CMS link visibility by persona | owner | 1280×800 | Pass | entitled public site editor |
| 5.6.cms-editor-link CMS link visibility by persona | guest | 390×844 | Pass | cms link absent |
| 5.6.cms-editor-link CMS link visibility by persona | guest | 1280×800 | Pass | cms link absent |
| 5.6.cms-editor-link CMS link visibility by persona | anon | 390×844 | Pass | cms link absent |
| 5.6.cms-editor-link CMS link visibility by persona | anon | 1280×800 | Pass | cms link absent |
| 5.6.cms-editor-link CMS link visibility by persona | blocked | 390×844 | Pass | cms link absent |
| 5.6.cms-editor-link CMS link visibility by persona | blocked | 1280×800 | Pass | cms link absent |
| 5.6.cms-grant-states CMS invitation and revocation | manager | 390×844 | Pass | invited editor link |
| 5.6.cms-grant-states CMS invitation and revocation | manager | 1280×800 | Pass | invited editor link |
