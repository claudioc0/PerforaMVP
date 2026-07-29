/**
 * Nível visual do badge de streak, pra dar um "marco" perceptível em
 * intervalos redondos sem introduzir cor nova (só reforça o que já existe
 * em colors.js via borda/sombra mais forte a cada nível).
 * @param {number} streak
 * @returns {'base'|'week'|'month'|'century'}
 */
export function getStreakTier(streak) {
  if (streak >= 100) return 'century';
  if (streak >= 30) return 'month';
  if (streak >= 7) return 'week';
  return 'base';
}
