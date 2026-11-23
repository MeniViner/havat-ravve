// The actions of the redesigned app (v2), one module per area. Each module calls def() from ../writes, which appends to
// WRITE_DEFS; catalog.ts imports this file after ../writes so the catalog and the router see every operation.
// Area modules are added below as they are written.
import './farm'; // presence, team calendar
import './broadcast'; // broadcasts, personal notifications
import './manage'; // deletes, payment follow-ups, registration questions
import './tasks'; // take / release, photos, shopping for a task, missing items, shopping trips
import './projects'; // manager projects and their steps
import './events'; // events: closing, products, files, staffing, guests and payments
import './eventday'; // the gate, paying on site, the cash count
import './vendors'; // stall owners: pool, invitations, access, event-day requests
export {};
