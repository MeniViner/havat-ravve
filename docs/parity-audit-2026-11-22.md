# Parity audit: the live app (main) against redesign v2, 2026-11-22

Before v2 replaces the app on the official link, every screen of the live app (`origin/main`, `src/app/screens/*`, the team
and guest shells) was read and each capability was looked up in v2. About 70 were missing, partial or changed without being
asked for. All were restored in v2's look, with the live app's wording, on branch `redesign/v2`.

## Restored

- **Tasks:** links to history, recurring tasks and the day summary; yesterday's unticked routine copies hidden again; the
  event field and `?event=` filter; a specific due date (an overdue date is no longer moved on edit); a "באיחור" group; a
  "פנויות" filter; routine "עד HH:MM"; tags on rows and the task header; edit only for a manager or the creator; done
  photo and note after done; reassigning a free task, with only the choices the rules allow; the task log always shown;
  the take toast with undo; the load-error message; nav badges.
- **Shopping:** history link always shown and includes found items; five suggestions per list, in the add form too.
- **Calendar:** "היום" button, the owners and volunteers legend, item kind, managers registering, editing and deleting
  presence for others, any date.
- **Profile and sign-up:** registration answers shown and edited; team invitees answer the registration questions; the
  farm website link; demo link; the install banner in the team shell.
- **Management:** payments (read-only for managers, as the rules allow) and donation amounts for managers; legacy event
  file links and adding a Drive link; past events' scans and counters rebuilt from the tickets; event history by event;
  person notes and history; blocked filter, search in answers, the guest invite role, pending invites; recurring note and
  30-day record; manage-home links and inbox preview and filters; multi-day events; registration label; arrived and
  cancelled filters; payment confirmation by WhatsApp or email with the automatic-email status, for tickets, donations and
  stall accounts; vendor manual confirm, new vendor from an event, vendor export, the saved vendor template; product order
  and sales; the stall accounts list with totals, filters, export and row actions; account history; report figures,
  comparison and print; visit export, history, "לא מתאים"; donation filters, row actions, back to waiting, donor link;
  report figures; activity by person, export, shopping and settings filters; staff list and recent role changes; answered
  counts; a table preview for every export; the places export.
- **Event day:** a scan is saved on the phone when reception is weak; the stall account opens only on the first sale (and
  guests never see empty accounts); staff mark paid, see and remove lines, clear the cart with undo; manager totals; the
  "module off" messages; the event tab for every team member on the event day; counts and a stall link at the gate; recent
  scans for staff; one buyer row per ticket holder.
- **Shell:** team members who order tickets land on their tickets; vendors can open terms, privacy, contact and account
  deletion; blocked guests see the guest blocked page; a demo link for signed-out visitors.

## Decided, not restored

- **Desktop layout** (sidebar, list and side panel, tables): Meni decided on 2026-11-22 that computers show the phone
  column for now. A wide layout can come later.
- **Design changes from the approved screens** stay: the tasks views (by place, by time, mine, plus פנויות), the capture
  bar instead of the inline add line, the farm calendar's week and day views, tapping a shopping row opens it.

## Not restored

- Tapping a person's presence bar in the calendar opens their card, not their presence.

## Checked

`npx tsc` clean; unit suites tasks 26, shopping, farm 20, system, projects, manage, events 18, core and demo; click-through
suites event day 39/39, vendor, broadcast 37/37, delete 75/75. Nothing ran against production.
