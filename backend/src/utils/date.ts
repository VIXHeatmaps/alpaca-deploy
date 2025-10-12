import { getMarketDateToday } from './marketTime';

export const normalizeDate = (s: string) => (s ? s.replace(/[./]/g, '-') : s);

export const toRFC3339Start = (s: string) => {
  const v = normalizeDate(s || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00Z` : v;
};

export const toRFC3339End = (s: string) => {
  const v = normalizeDate(s || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T23:59:59Z` : v;
};

export const toYMD = (s: string) => (s || '').slice(0, 10);

export const todayYMD = () => getMarketDateToday();
