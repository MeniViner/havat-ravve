# Owners' console on a computer: progress

- **Stage 0, plan:** done (`console-desktop-plan.md`).
- **Stage 1, shell and shared parts:** done. `src/console/desk/` (parts, sizes, icons, sidebar, address), the demo split by
  group in `src/console/demo/` with a clock that stands at the designs' moment, the contract for the new server data in
  `source.ts`, `scripts/console-check.mjs` (each screen beside its design).
- **Server routes:** done, with tests. Not deployed: until `wrangler deploy` the parts that need them stay hidden.
- **Stage 2, screens:** done, all sixteen, on a computer and (content only) on a phone.
- **Stage 3, widths:** done: 1024, 1280, 1440, 1920, a tablet and a phone.
- **Stage 4, visual check and owner walk:** results in `console-desktop-check/README.md` and
  `console-desktop-check/walk/README.md`.

## Server deploy this needs (Meni's OK)

`wrangler deploy` in `api/` brings: the regular request time, the week and events in Monitor and the daily summary, the
rounds strip in Jobs, sent mail and the daily count in Queue, reasons and history in Switches and the switch for messages
to registrants, requests per key, last entry of people, undo of an import, fields and short history in Data, the ten
slowest requests, a year of visits, earlier events in Money, and who/which way/which job in the security log.
No index, rules or secret changes.
