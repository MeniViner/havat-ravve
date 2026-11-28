import { now } from './clock';

export const birthYearRequired = 'יש לבחור שנת לידה';
export const isBirthYear = (year: unknown, minimum = 1900): year is number =>
  typeof year === 'number' && Number.isInteger(year) && year >= minimum && year <= now().getFullYear();
