import { getStreakTier } from './streak';

describe('getStreakTier', () => {
  test('menos de 7 dias é "base"', () => {
    expect(getStreakTier(0)).toBe('base');
    expect(getStreakTier(1)).toBe('base');
    expect(getStreakTier(6)).toBe('base');
  });

  test('7 a 29 dias é "week"', () => {
    expect(getStreakTier(7)).toBe('week');
    expect(getStreakTier(29)).toBe('week');
  });

  test('30 a 99 dias é "month"', () => {
    expect(getStreakTier(30)).toBe('month');
    expect(getStreakTier(99)).toBe('month');
  });

  test('100 dias ou mais é "century"', () => {
    expect(getStreakTier(100)).toBe('century');
    expect(getStreakTier(365)).toBe('century');
  });
});
