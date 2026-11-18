// The managers' calendar entry of a published event. Kept free of React and the DOM so the Rules tests can build it.
// firestore.rules /calendar: date is 10 characters (YYYY-MM-DD), time at most 11 ("HH:mm–HH:mm").
const TZ = 'Asia/Jerusalem';
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const day = (iso: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date(iso));

export function eventCalendarFields(e: { title: string; start: string; end: string }) {
  // The day and the hours are both in farm time, so an event that starts after midnight lands on its own day.
  return { title: e.title, date: day(e.start), time: `${hhmm(e.start)}–${hhmm(e.end)}` };
}
