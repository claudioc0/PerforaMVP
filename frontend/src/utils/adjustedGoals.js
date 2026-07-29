// Ciclagem de carboidrato simples: dia de treino planejado eleva o carboidrato
// (mais combustível pro treino), dia de descanso reduz. A meta base
// (UserGoals) nunca é alterada — isso só recalcula o que é EXIBIDO. Proteína e
// gordura mantêm a meta base; a diferença de calorias é derivada do delta de
// carboidrato (4 kcal por grama), não um número escolhido à parte.
const TRAINING_CARB_MULTIPLIER = 1.2;
const REST_CARB_MULTIPLIER = 0.85;
const KCAL_PER_GRAM_CARB = 4;

/**
 * @param {{goal_calories:number, goal_protein_g:number, goal_carbs_g:number, goal_fat_g:number}} baseGoals
 * @param {boolean|null|undefined} isTrainingDay - null/undefined = sem plano semanal, não ajusta.
 * @returns as metas ajustadas (mesmo shape de baseGoals), ou baseGoals sem mudança se isTrainingDay for null/undefined.
 */
export function getAdjustedGoals(baseGoals, isTrainingDay) {
  if (!baseGoals || isTrainingDay === null || isTrainingDay === undefined) {
    return baseGoals;
  }

  const multiplier = isTrainingDay ? TRAINING_CARB_MULTIPLIER : REST_CARB_MULTIPLIER;
  const baseCarbs = baseGoals.goal_carbs_g || 0;
  const adjustedCarbs = baseCarbs * multiplier;
  const carbDeltaKcal = (adjustedCarbs - baseCarbs) * KCAL_PER_GRAM_CARB;

  return {
    ...baseGoals,
    goal_carbs_g: adjustedCarbs,
    goal_calories: (baseGoals.goal_calories || 0) + carbDeltaKcal,
  };
}
