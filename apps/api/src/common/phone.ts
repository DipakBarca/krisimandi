// Nepali mobile numbers: 10 digits starting 96, 97 or 98 (NTC, Ncell, Smart).
const LOCAL_MOBILE = /^9[678]\d{8}$/;

/** Returns the number in E.164 form (+977XXXXXXXXXX), or null if it is not a Nepali mobile. */
export function normalizeNepaliMobile(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '').replace(/^\+?977/, '').replace(/^0/, '');
  return LOCAL_MOBILE.test(digits) ? `+977${digits}` : null;
}
