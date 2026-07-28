/**
 * ProgressScreen e WorkoutHistoryScreen tinham cada uma sua própria função
 * `formatDate`, com formatos diferentes (uma sem ano, outra com) — nada
 * impedia que um ajuste numa fosse esquecido na outra e a data passasse a
 * aparecer de dois jeitos diferentes no mesmo app.
 */

/**
 * @param {string} isoString
 * @param {{ includeYear?: boolean }} [options]
 * @returns {string} Ex: "28 jul." ou "28 jul. de 2026", conforme includeYear.
 */
export function formatShortDate(isoString, { includeYear = false } = {}) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
  });
}
