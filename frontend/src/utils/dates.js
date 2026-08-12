/**
 * Extraído de InsightsScreen.js: eram funções locais, não testáveis
 * isoladamente, no meio do arquivo que teve o bug real de fuso horário
 * (peso aparecendo um dia atrasado — ver dates.test.js). Mesmo raciocínio já
 * aplicado no backend em app/utils/dates.py: "hoje"/datas exibidas ao usuário
 * usam o fuso LOCAL do aparelho, nunca toISOString()/new Date("YYYY-MM-DD")
 * puro, que convertem para UTC.
 */

/**
 * @param {Date} date
 * @returns {string} "YYYY-MM-DD" no fuso local do aparelho.
 */
export function getLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Inverso de getLocalDateString: um "YYYY-MM-DD" puro (sem horário/offset,
 * como o log.date do WeightLog) passado direto pro construtor `new Date()`
 * é interpretado como meia-noite UTC — perto da meia-noite no horário de
 * Brasília (UTC-3) isso já exibia o dia anterior ("1 de ago." num registro
 * feito às 22h do dia 2). Construir a partir de ano/mês/dia mantém a data
 * no fuso local do aparelho, sem conversão nenhuma.
 *
 * @param {string} dateStr "YYYY-MM-DD"
 * @returns {Date}
 */
export function parseLocalDateString(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}
