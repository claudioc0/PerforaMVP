import { scaleMealItems, deriveBaseFromSavedItem } from './mealMacros';

describe('scaleMealItems', () => {
  test('escala macros proporcionalmente à quantidade informada', () => {
    const items = [
      {
        description: 'Frango Grelhado',
        baseCalories: 165,
        baseProtein_g: 31,
        baseCarbs_g: 0,
        baseFat_g: 3.6,
        quantity: '200',
      },
    ];

    const { scaledItems } = scaleMealItems(items);

    expect(scaledItems[0].scaledCalories).toBeCloseTo(330);
    expect(scaledItems[0].scaledProtein_g).toBeCloseTo(62);
    expect(scaledItems[0].scaledCarbs_g).toBeCloseTo(0);
    expect(scaledItems[0].scaledFat_g).toBeCloseTo(7.2);
  });

  test('quantidade igual a 100g devolve exatamente os valores base', () => {
    const items = [
      { description: 'Arroz', baseCalories: 130, baseProtein_g: 2.7, baseCarbs_g: 28, baseFat_g: 0.3, quantity: '100' },
    ];

    const { scaledItems } = scaleMealItems(items);

    expect(scaledItems[0].scaledCalories).toBeCloseTo(130);
    expect(scaledItems[0].scaledProtein_g).toBeCloseTo(2.7);
    expect(scaledItems[0].scaledCarbs_g).toBeCloseTo(28);
    expect(scaledItems[0].scaledFat_g).toBeCloseTo(0.3);
  });

  test('soma os totais de todos os itens da refeição', () => {
    const items = [
      { description: 'Frango', baseCalories: 165, baseProtein_g: 31, baseCarbs_g: 0, baseFat_g: 3.6, quantity: '200' },
      { description: 'Batata Doce', baseCalories: 86, baseProtein_g: 1.6, baseCarbs_g: 20, baseFat_g: 0.1, quantity: '100' },
    ];

    const { totals } = scaleMealItems(items);

    // 330 (frango a 200g) + 86 (batata a 100g)
    expect(totals.calories).toBeCloseTo(416);
    expect(totals.protein_g).toBeCloseTo(63.6);
    expect(totals.carbs_g).toBeCloseTo(20);
    expect(totals.fat_g).toBeCloseTo(7.3);
  });

  test('quantidade vazia ou não numérica vira zero, não NaN', () => {
    const items = [
      { description: 'Item', baseCalories: 100, baseProtein_g: 10, baseCarbs_g: 10, baseFat_g: 5, quantity: '' },
      { description: 'Item 2', baseCalories: 100, baseProtein_g: 10, baseCarbs_g: 10, baseFat_g: 5, quantity: 'abc' },
    ];

    const { scaledItems, totals } = scaleMealItems(items);

    expect(scaledItems[0].numQuantity).toBe(0);
    expect(scaledItems[0].scaledCalories).toBe(0);
    expect(scaledItems[1].numQuantity).toBe(0);
    expect(Number.isNaN(totals.calories)).toBe(false);
    expect(totals.calories).toBe(0);
  });

  test('preserva a descrição e outros campos do item original', () => {
    const items = [
      { description: 'Ovo Cozido', baseCalories: 155, baseProtein_g: 13, baseCarbs_g: 1.1, baseFat_g: 11, quantity: '50' },
    ];

    const { scaledItems } = scaleMealItems(items);

    expect(scaledItems[0].description).toBe('Ovo Cozido');
    expect(scaledItems[0].quantity).toBe('50');
    expect(scaledItems[0].numQuantity).toBe(50);
  });

  test('lista vazia devolve totais zerados sem quebrar', () => {
    const { scaledItems, totals } = scaleMealItems([]);

    expect(scaledItems).toEqual([]);
    expect(totals).toEqual({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  });
});

describe('deriveBaseFromSavedItem', () => {
  test('reverte para o valor por 100g a partir de uma refeição salva', () => {
    // 200g de frango salvos como 330 kcal totais -> base = 165 kcal/100g
    const base = deriveBaseFromSavedItem({
      description: 'Frango Grelhado',
      quantity_g: 200,
      calories: 330,
      protein_g: 62,
      carbs_g: 0,
      fat_g: 7.2,
    });

    expect(base.baseCalories).toBeCloseTo(165);
    expect(base.baseProtein_g).toBeCloseTo(31);
    expect(base.baseCarbs_g).toBeCloseTo(0);
    expect(base.baseFat_g).toBeCloseTo(3.6);
    expect(base.quantity).toBe('200');
  });

  test('quantity_g igual a 100 devolve os próprios valores salvos como base', () => {
    const base = deriveBaseFromSavedItem({
      description: 'Arroz', quantity_g: 100, calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3,
    });

    expect(base.baseCalories).toBeCloseTo(130);
    expect(base.quantity).toBe('100');
  });

  test('quantity_g ausente ou zero cai pro padrão de 100g (nunca divide por zero)', () => {
    const semQuantidade = deriveBaseFromSavedItem({
      description: 'Item Antigo', quantity_g: 0, calories: 200, protein_g: 20, carbs_g: 20, fat_g: 10,
    });
    expect(semQuantidade.quantity).toBe('100');
    expect(semQuantidade.baseCalories).toBeCloseTo(200);
    expect(Number.isFinite(semQuantidade.baseCalories)).toBe(true);

    const indefinida = deriveBaseFromSavedItem({
      description: 'Item Antigo', calories: 200, protein_g: 20, carbs_g: 20, fat_g: 10,
    });
    expect(indefinida.quantity).toBe('100');
  });
});

describe('equivalência com a fórmula legada de refeição sem detalhamento por item', () => {
  // AdjustQuantityScreen, antes da extração, tinha um caminho separado pra
  // refeições sem "items": ratio = novaQtd / qtdSalva, aplicado direto sobre o
  // valor salvo. Estes testes provam que deriveBaseFromSavedItem + scaleMealItems
  // chegam exatamente no mesmo resultado, então a unificação não mudou o
  // comportamento pra nenhum usuário com refeições antigas desse formato.
  function formulaLegada(valorSalvo, qtdSalva, novaQtd) {
    const ratio = novaQtd / qtdSalva;
    return valorSalvo * ratio;
  }

  test.each([
    { valorSalvo: 300, qtdSalva: 150, novaQtd: 300 },
    { valorSalvo: 450, qtdSalva: 300, novaQtd: 150 },
    { valorSalvo: 82.5, qtdSalva: 50, novaQtd: 75 },
    { valorSalvo: 600, qtdSalva: 100, novaQtd: 0 },
  ])('valorSalvo=$valorSalvo qtdSalva=$qtdSalva novaQtd=$novaQtd', ({ valorSalvo, qtdSalva, novaQtd }) => {
    const base = deriveBaseFromSavedItem({
      description: 'Refeição Legada', quantity_g: qtdSalva, calories: valorSalvo, protein_g: 0, carbs_g: 0, fat_g: 0,
    });
    const { totals } = scaleMealItems([{ ...base, quantity: String(novaQtd) }]);

    expect(totals.calories).toBeCloseTo(formulaLegada(valorSalvo, qtdSalva, novaQtd));
  });
});

describe('cenário de ponta a ponta (o mesmo prato passando pelas duas telas)', () => {
  test('confirmar a refeição, depois reabrir pra ajustar, preserva os macros', () => {
    // MealConfirmationScreen: a IA devolve valores por 100g + peso estimado.
    const itemDaIA = {
      description: 'Frango Grelhado',
      baseCalories: 165,
      baseProtein_g: 31,
      baseCarbs_g: 0,
      baseFat_g: 3.6,
      quantity: '200', // peso estimado pela IA
    };
    const { totals: totalConfirmado, scaledItems: itensConfirmados } = scaleMealItems([itemDaIA]);
    expect(totalConfirmado.calories).toBeCloseTo(330);

    // Isso é o que seria enviado e salvo no backend (quantity_g + macros totais).
    const itemSalvo = {
      description: itensConfirmados[0].description,
      quantity_g: itensConfirmados[0].numQuantity,
      calories: itensConfirmados[0].scaledCalories,
      protein_g: itensConfirmados[0].scaledProtein_g,
      carbs_g: itensConfirmados[0].scaledCarbs_g,
      fat_g: itensConfirmados[0].scaledFat_g,
    };

    // AdjustQuantityScreen: reabre a refeição já salva, sem alterar a quantidade.
    const baseDerivada = deriveBaseFromSavedItem(itemSalvo);
    const { totals: totalReaberto } = scaleMealItems([baseDerivada]);

    expect(totalReaberto.calories).toBeCloseTo(totalConfirmado.calories);
    expect(totalReaberto.protein_g).toBeCloseTo(totalConfirmado.protein_g);
    expect(totalReaberto.fat_g).toBeCloseTo(totalConfirmado.fat_g);
  });
});
