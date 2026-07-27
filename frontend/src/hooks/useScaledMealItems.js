import { useState, useMemo, useCallback } from 'react';
import { scaleMealItems } from '../utils/mealMacros';

/**
 * Estado editável de uma lista de itens de refeição (quantidade por item) +
 * os macros escalados/totais recalculados a cada mudança. Wrapper fino sobre
 * `scaleMealItems` — a conta em si (e os testes dela) vivem em `mealMacros.js`.
 *
 * @param {Array<object>} initialItems - ver shape em `scaleMealItems`.
 */
export function useScaledMealItems(initialItems) {
  const [items, setItems] = useState(initialItems);

  const updateItemQuantity = useCallback((index, text) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, quantity: text } : item)));
  }, []);

  const { scaledItems, totals } = useMemo(() => scaleMealItems(items), [items]);

  return { scaledItems, totals, updateItemQuantity };
}
