import { getAdjustedGoals } from './adjustedGoals';

const baseGoals = { goal_calories: 2000, goal_protein_g: 150, goal_carbs_g: 200, goal_fat_g: 60 };

describe('getAdjustedGoals', () => {
  test('dia de treino aumenta carboidrato e calorias, mantém proteína/gordura', () => {
    const result = getAdjustedGoals(baseGoals, true);

    expect(result.goal_carbs_g).toBeCloseTo(240); // 200 * 1.2
    expect(result.goal_calories).toBeCloseTo(2160); // 2000 + (240-200)*4
    expect(result.goal_protein_g).toBe(150);
    expect(result.goal_fat_g).toBe(60);
  });

  test('dia de descanso reduz carboidrato e calorias', () => {
    const result = getAdjustedGoals(baseGoals, false);

    expect(result.goal_carbs_g).toBeCloseTo(170); // 200 * 0.85
    expect(result.goal_calories).toBeCloseTo(1880); // 2000 + (170-200)*4
  });

  test('sem plano semanal (isTrainingDay null/undefined) devolve a meta base sem alterar', () => {
    expect(getAdjustedGoals(baseGoals, null)).toBe(baseGoals);
    expect(getAdjustedGoals(baseGoals, undefined)).toBe(baseGoals);
  });

  test('sem metas ainda carregadas devolve o valor original (não quebra)', () => {
    expect(getAdjustedGoals(null, true)).toBe(null);
    expect(getAdjustedGoals(undefined, false)).toBe(undefined);
  });
});
