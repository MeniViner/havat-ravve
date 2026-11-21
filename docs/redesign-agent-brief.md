# Brief for area agents (redesign v2)

You implement one area of the redesigned Havat Raveh team app (Hebrew, RTL, mobile). Volunteers and managers aged 40 to 70 use it outdoors, one-handed. The owner approved every designed screen one by one: **the designs are the specification**. A screen that looks roughly right but is wired differently is a failure.

## Inputs (read them; they are outside your worktree)

`DESIGN=/Users/meni/dev/personal projects/havat-ravve/.claude/worktrees/havat-raveh-mobile-redesign-e1a359/havat-raveh-redesign`

- `$DESIGN/design/html/<id>.html`: one file per screen, 390px wide, all styles inline. **Source of truth** for layout, sizes, colours, icons and Hebrew copy. Read every file of your screens fully.
- `$DESIGN/design/png/<id>.png`: 2x screenshots. Look at each of yours.
- `$DESIGN/design/SCREENS.md` (your rows: what each control does), `FLOWS.md` (roles, nav, the 12 connections), `TOKENS.md`.
- `$DESIGN/spec/BACKEND.md` (capabilities and free-tier constraints), `$DESIGN/demo/DEMO.md`, `$DESIGN/demo/demo-data.json` (seed values).
- In the repo: `src/app/v2/kit/KIT.md` (the component kit: use it), `src/app/v2/ctx.ts`, `src/app/v2/core.tsx` (toasts, external links, `useV2`), `src/app/v2/format.ts` (Hebrew dates: use it), `src/app/v2/routes.tsx` (your routes and which show the bottom nav), `src/app/db.ts` (`useList`, `useDoc`, `write`, `transact`, `ConflictError`), `src/app/store.ts`, `src/app/data.ts`, `src/app/types.ts`, `src/app/clock.ts`, `src/app/demo/data.ts` (core seed and ids), `src/app/demo/seed/types.ts` (`put`, `patch`, `drop`), `docs/redesign-plan.md`, `docs/demo-coverage.md`.
- Old screens in `src/app/screens/*.tsx` hold working logic (transactions, photo compression, activity logging, WhatsApp templates). Read them for logic; never import them, never copy their look.

## What you own (edit only these)

- `src/app/v2/screens/<area>/**` (keep the exported component names of the placeholder file; you may add more files and a `<area>.css` with classes prefixed `<area>-`)
- `src/app/v2/data/<area>.ts` (data hooks and actions for your area)
- `src/app/demo/seed/<area>.ts` (demo rows your screens need, per scenario)
- `docs/redesign-data/<area>.md` (your data model: collections, fields, defaults for old docs, who reads and writes, rules needed, indexes, rules test cases)

Do **not** edit shared files (`types.ts`, `db.ts`, `store.ts`, `data.ts`, `routes.tsx`, `core.tsx`, `App.tsx`, the kit, `firestore.rules`, other areas). If you need a change there, work around it locally (local types in your data file are fine) and list the request in your report. Do not touch the guest screens, `/admin`, `android/`, the public site.

## Rules of implementation

- Use kit components for everything they cover. Match the HTML exactly: spacing, sizes, weights, colours, radii, icons, copy. Where the kit lacks something, build it in your folder with design tokens (`var(--action)` etc.), never hard-coded hex values for token colours.
- Hebrew copy verbatim from the HTML. No emoji. No invented screens or copy. A missing state (loading, error, validation): follow the tone of the nearest designed screen, and list it in your report.
- Data through `src/app/db.ts` only (`useList`, `useDoc`, `write.*`, `transact`), never `firebase/firestore` directly. This makes the same screen work on demo data and on Firestore. Every "now" through `src/app/clock.ts` (`nowIso`, `nowMs`, `todayKey`); every date text through `src/app/v2/format.ts`.
- New fields are optional with defaults; never rename or drop an existing field. Images: compress in the browser (`compressPhoto` in `store.ts`) and keep each document well under 1 MiB. No Storage, no Cloud Functions.
- Writes must work offline (no screen waits for the server). Conflicts (take, assign, scan) go through `transact`; on `ConflictError` call `useToast().refused()` (X1).
- WhatsApp, phone, maps, mail: `useExternal()` / `useExternalLink()` from `core.tsx` (in demo they show "בהדגמה לא נשלח").
- **Frame.** Every screen renders inside `AppScreen` from `core.tsx` (a wrapper over kit `Screen`; same `variant`, `gap`, `auto` props). The shell injects the demo strip, offline strip, toasts and bottom nav through it, so screens never render those themselves. Root screens pass `capture={<CaptureBar .../>}` and render `RootHead` (kit RootHeader wired to unread count, avatar, search, bell, profile) first in the body. Detail and form screens pass `bar={<BottomBar>...</BottomBar>}` (a bar replaces the nav, as in the designs); `noNav` hides the nav on a tab route when the design has none. Full-bleed gate pages (E2-E5) use kit `GateCamera`/`GateResult` directly, without AppScreen. Toasts: `useToast().show({text, actions})` and `refused()`; they appear first in the bottom area automatically.
- Logging: follow the old screens' `logActivity` calls so history and timelines keep working.

## Demo

Demo must show each of your screens with its designed content under the persona and scenario in `docs/demo-coverage.md` (correct rows that are wrong and report the corrections). Add the rows your screens need in your seed slice (`put(seed, 'path', rows)`), using the ids in `demo/data.ts` and `demo-data.json`; vary by scenario where the design does. Writes in demo must behave like the real thing and persist (they do automatically through `db.ts`).

## Verify (required before you finish)

1. `npx tsc --noEmit -p .` clean for your files.
2. Run the dev server on your port: `PORT=<your port> node scripts/dev.mjs` (in the background).
3. `node scripts/visual-check.mjs <your ids> --base=http://localhost:<port> --design="$DESIGN/design" --out=.build/vc-<area>` and look at every `.pair.jpg` yourself (Read the image). Fix and re-run until layout, spacing, sizes, colours, icons and text match. Only real photos and live values may differ.
4. Click through every control your screens have (Playwright script in `.build/`), as each relevant persona: it must do what SCREENS.md says, and writes must persist after reload.
5. Commit on your branch in small described steps (message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). Do not push, do not deploy, never touch production.

## Report (under 80 lines)

Branch; files; per screen: done / differences left (with the diff score); requests for shared files; your data model summary (collections and fields); demo-coverage corrections; states you added that the design did not have; anything you could not do.
