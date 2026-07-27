/**
 * Regra de três que escala os macros de um item de refeição pela quantidade
 * real consumida, a partir de valores "base" (por 100g).
 *
 * Extraído porque MealConfirmationScreen e AdjustQuantityScreen faziam essa
 * mesma conta de forma independente — uma com nomes de campo diferentes da
 * outra — sem nenhum teste cobrindo. É exatamente o tipo de cálculo que
 * corrompe o histórico nutricional do usuário silenciosamente se um ajuste de
 * arredondamento for feito numa cópia e esquecido na outra.
 */

/**
 * @param {Array<{
 *   description: string,
 *   baseCalories: number,
 *   baseProtein_g: number,
 *   baseCarbs_g: number,
 *   baseFat_g: number,
 *   quantity: string|number,
 * }>} items
 * @returns {{
 *   scaledItems: Array<object>,
 *   totals: {calories: number, protein_g: number, carbs_g: number, fat_g: number},
 * }}
 */
export function scaleMealItems(items) {
  const scaledItems = items.map((item) => {
    const numQuantity = parseFloat(item.quantity) || 0;
    const ratio = numQuantity / 100;
    return {
      ...item,
      numQuantity,
      scaledCalories: item.baseCalories * ratio,
      scaledProtein_g: item.baseProtein_g * ratio,
      scaledCarbs_g: item.baseCarbs_g * ratio,
      scaledFat_g: item.baseFat_g * ratio,
    };
  });

  const totals = scaledItems.reduce(
    (acc, item) => ({
      calories: acc.calories + item.scaledCalories,
      protein_g: acc.protein_g + item.scaledProtein_g,
      carbs_g: acc.carbs_g + item.scaledCarbs_g,
      fat_g: acc.fat_g + item.scaledFat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );

  return { scaledItems, totals };
}

/**
 * Deriva os macros "base" (por 100g) de um item já salvo — o backend guarda o
 * total pra `quantity_g` gramas, não o valor por 100g, então pra reabrir uma
 * refeição existente e permitir ajustar a quantidade é preciso reverter a
 * conta primeiro: base = valor salvo / (quantidade salva / 100).
 *
 * Matematicamente equivalente ao caminho antigo da refeição "legado" (sem
 * detalhamento por item), que fazia `ratio = novaQtd / qtdSalva` direto —
 * `scaleMealItems` aplicado sobre o resultado desta função chega no mesmo
 * valor (base * 100/qtdSalva, depois * novaQtd/100 = valor * novaQtd/qtdSalva).
 *
 * @param {{description: string, quantity_g: number, calories: number, protein_g: number, carbs_g: number, fat_g: number}} savedItem
 */
export function deriveBaseFromSavedItem(savedItem) {
  const savedQuantity = savedItem.quantity_g > 0 ? savedItem.quantity_g : 100;
  const ratio = 100 / savedQuantity;
  return {
    description: savedItem.description,
    baseCalories: savedItem.calories * ratio,
    baseProtein_g: savedItem.protein_g * ratio,
    baseCarbs_g: savedItem.carbs_g * ratio,
    baseFat_g: savedItem.fat_g * ratio,
    quantity: String(savedQuantity),
  };
}
