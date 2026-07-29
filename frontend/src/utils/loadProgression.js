const LOAD_INCREMENT_KG = 2.5;
const REPS_THRESHOLD_FOR_INCREASE = 10;

// Progressão linear simples: bateu a faixa de reps na última série ->
// sugere o menor incremento de anilha padrão; não bateu -> repete o peso.
export function getSuggestedWeight(lastPerformance) {
  if (!lastPerformance || typeof lastPerformance.weight_kg !== 'number' || typeof lastPerformance.reps !== 'number') {
    return null;
  }

  if (lastPerformance.reps >= REPS_THRESHOLD_FOR_INCREASE) {
    return lastPerformance.weight_kg + LOAD_INCREMENT_KG;
  }

  return lastPerformance.weight_kg;
}
