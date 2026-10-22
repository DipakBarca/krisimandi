/** Calendar date (YYYY-MM-DD) as a UTC midnight Date, matching Postgres DATE columns. */
export const toDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
export const today = () => toDate(new Date().toISOString());
export const HOUR = 60 * 60 * 1000;
