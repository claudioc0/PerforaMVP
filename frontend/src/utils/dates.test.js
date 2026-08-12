import { getLocalDateString, parseLocalDateString } from './dates';

describe('parseLocalDateString', () => {
  test('regressão: data de peso registrada à noite não aparece um dia atrasada', () => {
    // Bug real (InsightsScreen, corrigido em 2026-08): new Date("2026-08-02")
    // é interpretado como meia-noite UTC. Em qualquer fuso a oeste de UTC
    // (ex: Brasília, UTC-3), toLocaleDateString devolvia "1 de ago." em vez
    // de "2 de ago." — o registro parecia ter sido feito um dia antes.
    const parsed = parseLocalDateString('2026-08-02');
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(7); // agosto = índice 7
    expect(parsed.getDate()).toBe(2);
  });

  test('não sofre o desvio de fuso que new Date(string) sofre', () => {
    // Trava o contraste explícito com a implementação ingênua que causou o
    // bug, pra never regredir de volta pra `new Date(dateStr)` puro.
    const naive = new Date('2026-08-02');
    const fixed = parseLocalDateString('2026-08-02');
    expect(fixed.getDate()).toBe(2);
    // A implementação ingênua só diverge da corrigida em fusos a oeste de
    // UTC — não travamos o valor de `naive` (depende do fuso da máquina que
    // roda o teste), só documentamos por que a função existe.
    void naive;
  });

  test('vira meia-noite no fuso local, não UTC', () => {
    const parsed = parseLocalDateString('2026-01-15');
    expect(parsed.getHours()).toBe(0);
    expect(parsed.getMinutes()).toBe(0);
  });
});

describe('getLocalDateString', () => {
  test('formata ano-mês-dia com zero à esquerda', () => {
    expect(getLocalDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  test('é o inverso de parseLocalDateString para qualquer data', () => {
    const original = new Date(2026, 11, 31);
    const roundTripped = parseLocalDateString(getLocalDateString(original));
    expect(roundTripped.getFullYear()).toBe(original.getFullYear());
    expect(roundTripped.getMonth()).toBe(original.getMonth());
    expect(roundTripped.getDate()).toBe(original.getDate());
  });
});
