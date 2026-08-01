import { getSuggestedWeight } from './loadProgression';

describe('getSuggestedWeight', () => {
  test('reps >= 10 sugere +2.5kg', () => {
    expect(getSuggestedWeight({ weight_kg: 40, reps: 10 })).toBeCloseTo(42.5);
    expect(getSuggestedWeight({ weight_kg: 60, reps: 12 })).toBeCloseTo(62.5);
  });

  test('reps < 10 sugere repetir o mesmo peso', () => {
    expect(getSuggestedWeight({ weight_kg: 40, reps: 9 })).toBe(40);
    expect(getSuggestedWeight({ weight_kg: 40, reps: 1 })).toBe(40);
  });

  test('sem lastPerformance devolve null', () => {
    expect(getSuggestedWeight(null)).toBe(null);
    expect(getSuggestedWeight(undefined)).toBe(null);
  });

  test('lastPerformance com campos ausentes/inválidos devolve null', () => {
    expect(getSuggestedWeight({})).toBe(null);
    expect(getSuggestedWeight({ weight_kg: 40 })).toBe(null);
    expect(getSuggestedWeight({ reps: 10 })).toBe(null);
  });
});
