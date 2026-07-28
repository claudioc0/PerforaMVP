import { formatShortDate } from './formatDate';

describe('formatShortDate', () => {
  test('sem includeYear, formata só dia e mês (comportamento antigo do ProgressScreen)', () => {
    const result = formatShortDate('2026-07-28T10:00:00.000Z');
    expect(result).not.toMatch(/2026/);
    expect(result).toMatch(/\d{2}/);
  });

  test('com includeYear, inclui o ano (comportamento antigo do WorkoutHistoryScreen)', () => {
    const result = formatShortDate('2026-07-28T10:00:00.000Z', { includeYear: true });
    expect(result).toMatch(/2026/);
  });

  test('string vazia ou nula devolve string vazia, sem quebrar', () => {
    expect(formatShortDate('')).toBe('');
    expect(formatShortDate(null)).toBe('');
    expect(formatShortDate(undefined)).toBe('');
  });
});
