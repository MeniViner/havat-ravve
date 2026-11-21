// Hebrew verbs and role words follow the person ("לקחה" / "לקח", "מגיעה" / "מגיע").
// One rule for the whole app: an explicit profile field wins (profile.gender 'f' | 'm', or a registration answer
// fields.gender), otherwise a guess from the first name (common names, then the feminine endings ה / ית).
const FEMALE = new Set(['רחל', 'מיכל', 'אסתר', 'תמר', 'שירן', 'ענבל', 'הדס', 'כרמל', 'מירב', 'סיגל', 'קרן', 'יעל', 'רות', 'מורן', 'אורלי', 'שני', 'נעמי', 'אורנה', 'מרים', 'דבורה', 'שושנה', 'רינת', 'ליאת', 'אביגיל', 'אילת', 'אפרת', 'גלית', 'עדן', 'שקד', 'רונית', 'שלומית', 'פזית', 'אורית', 'יפית', 'נגה', 'תהל', 'שושן', 'ליאור', 'אלה', 'בתיה', 'הילה', 'נעמה', 'שרון', 'שירלי', 'גלי', 'סיון', 'אילנית', 'רוני', 'אור']);
const MALE = new Set(['משה', 'שלמה', 'יהודה', 'אריה', 'אליה', 'ישעיה', 'זכריה', 'יונה', 'טוביה', 'עזריה', 'מתתיה', 'נחמיה', 'ירמיה', 'שמעיה', 'יחיאל', 'נוח', 'נח', 'מתנה', 'נוה', 'אהרון', 'אהרן', 'ברכה', 'עזרא', 'עובדיה', 'אלישע', 'מתניה', 'יוסף']);
type Who = { gender?: string; fields?: Record<string, unknown> } | null | undefined;
const firstOf = (name: string) => ((name || '').trim().split(/\s+/)[0] || '').replace(/[׳'"״]/g, '');

export function isFemale(name: string, who?: Who | string): boolean {
  const raw = typeof who === 'string' ? who : (who?.gender || (who?.fields?.gender as string | undefined) || '');
  const g = String(raw).toLowerCase();
  if (['f', 'female', 'נ', 'נקבה', 'אישה'].includes(g)) return true;
  if (['m', 'male', 'ז', 'זכר', 'גבר'].includes(g)) return false;
  const f = firstOf(name);
  if (FEMALE.has(f)) return true;
  if (MALE.has(f)) return false;
  return /(ה|ית)$/.test(f);
}
/** Pick the masculine or feminine form for this person. */
export const gw = (name: string, male: string, female: string, who?: Who | string) => (isFemale(name, who) ? female : male);
