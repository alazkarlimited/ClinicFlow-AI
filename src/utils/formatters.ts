import type { LanguageCode } from '../shared/types';

export function formatLocalizedDate(
  dateStr: string,
  lang: LanguageCode,
  options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat(lang === 'ar-EG' ? 'ar-EG' : 'en-US', {
    ...options,
    timeZone: 'Africa/Cairo',
  }).format(dt);
}

export function formatLocalizedTime(hhmm: string, lang: LanguageCode): string {
  const [h, m] = hhmm.split(':').map(Number);
  const dt = new Date(Date.UTC(2026, 0, 1, h, m, 0));
  return new Intl.DateTimeFormat(lang === 'ar-EG' ? 'ar-EG' : 'en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(dt);
}

export function formatLocalizedDateTime(isoStr: string, lang: LanguageCode): string {
  const dt = new Date(isoStr);
  return new Intl.DateTimeFormat(lang === 'ar-EG' ? 'ar-EG' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(dt);
}

export function formatLocalizedNumber(val: number, lang: LanguageCode): string {
  return new Intl.NumberFormat(lang === 'ar-EG' ? 'ar-EG' : 'en-US').format(val);
}
