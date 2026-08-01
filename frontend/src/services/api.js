/**
 * Camada de acesso à API do microserviço de nutrição.
 * Nenhum componente de tela deve chamar `fetch` diretamente — tudo passa por aqui,
 * o que facilita trocar de backend ou mockar em testes.
 */

import { getToken, setToken } from './secureTokenStorage';
import { clearLocalSession } from './session';
import { resetToLogin } from '../navigation/RootNavigation'; // Importa o helper de navegação

// Configurável via .env (EXPO_PUBLIC_API_URL) — veja .env.example.
// Em desenvolvimento, use o IP da sua máquina na rede local (não use "localhost"
// se estiver testando em um celular físico ou emulador Android).
//
// EXPO_PUBLIC_API_URL é embutida no bundle em tempo de build — se faltar num
// build feito pelo EAS (preview/production), o app antes caía silenciosamente
// num IP de rede local hardcoded: sem erro nenhum, só spinner infinito na mão
// do usuário. Falhar alto aqui, na primeira tela que chamar a API, é preferível:
// o erro aparece imediatamente ao abrir o app, com o nome exato da variável que
// falta, em vez de horas depois como "o app não funciona" sem pista nenhuma.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error(
    "EXPO_PUBLIC_API_URL não foi definida. Rodando localmente: copie .env.example " +
    "para .env e ajuste o IP. Buildando com EAS: declare EXPO_PUBLIC_API_URL no " +
    "perfil correspondente em eas.json (veja o bloco \"env\" de cada perfil)."
  );
}

class ApiError extends Error {
  // `data` é o corpo JSON já parseado da resposta (quando houver) — permite
  // um caller distinguir motivos diferentes de um mesmo status HTTP (ex: 429
  // por rate limit transitório vs. 429 por cota diária de IA esgotada, via
  // `data.reason`) sem precisar adivinhar pelo texto da mensagem.
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

// Nenhuma chamada tinha timeout — numa rede instável, um fetch que nunca
// resolve (nem sucesso nem erro) deixava a tela travada num spinner infinito
// pra sempre (ex: "Mapeando nutrientes..." no upload de foto). E toda falha
// de rede batia no mesmo `catch` genérico das telas, indistinguível de "o
// servidor respondeu com erro" — sem isso, uma tela não consegue
// diferenciar "sem internet, tente de novo" de "não há dados". `status: 0`
// (nenhum código HTTP real usa isso) é o sinal que as telas podem checar pra
// saber que é queda de conexão/timeout, não erro de negócio.
const DEFAULT_TIMEOUT_MS = 30000;
// Upload de foto + análise por IA no backend genuinamente demora mais que uma
// chamada comum (inclui as tentativas de retry do próprio Gemini).
const ANALYZE_MEAL_TIMEOUT_MS = 60000;

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new ApiError('A conexão demorou demais para responder. Verifique sua internet e tente novamente.', 0);
    }
    // React Native lança um TypeError genérico ("Network request failed") quando
    // não há conexão nenhuma — é o único sinal confiável disponível sem adicionar
    // uma dependência nativa nova (netinfo) só pra isso.
    if (error instanceof TypeError) {
      throw new ApiError('Sem conexão com a internet. Verifique sua rede e tente novamente.', 0);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function handleResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message = isJson && body?.error ? body.error : "Erro ao comunicar com o servidor.";
    throw new ApiError(message, response.status, isJson ? body : undefined);
  }

  return body;
}

// --- RENOVAÇÃO DE ACCESS TOKEN (refresh) ---
// Sem isso, um access token expirado (validade de 1h — ver JWT_ACCESS_TOKEN_EXPIRES
// no backend) ejetava o usuário na hora pro Login, mesmo no meio de uma série de
// treino em andamento, perdendo o formulário preenchido. Agora `request()` tenta
// renovar com o refresh token (validade de 7 dias) e refaz a chamada original de
// forma transparente antes de desistir.
let refreshPromise = null;

async function refreshAccessToken() {
  // Duas chamadas que expiram "ao mesmo tempo" (ex: um Promise.all com duas
  // requisições) cairiam aqui juntas — sem isso, cada uma disparava sua
  // própria renovação concorrente. Dedup: só a primeira chamada renova de
  // verdade; a segunda espera a MESMA promise em vez de tentar de novo.
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = await getToken('refresh_token');
      if (!refreshToken) {
        throw new Error('Sem refresh token salvo.');
      }

      const response = await fetchWithTimeout(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${refreshToken}`, Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error('Refresh token inválido ou expirado.');
      }

      const data = await response.json();
      await setToken('jwt_token', data.token);
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// --- LOGOUT FORÇADO (sessão irrecuperável) ---
let forceLogoutPromise = null;

async function forceLogout() {
  // Mesmo raciocínio do dedup acima: se várias chamadas concorrentes falham
  // a renovação ao mesmo tempo, cada uma chamando resetToLogin() por conta
  // própria disparava várias navegações de reset ao mesmo tempo.
  if (!forceLogoutPromise) {
    forceLogoutPromise = (async () => {
      await clearLocalSession();
      resetToLogin();
    })().finally(() => {
      forceLogoutPromise = null;
    });
  }
  return forceLogoutPromise;
}

/**
 * Cria os cabeçalhos padrão para requisições, incluindo o token JWT se disponível.
 * @param {object} additionalHeaders - Cabeçalhos adicionais, como 'Content-Type'.
 * @returns {Promise<object>}
 */
async function getAuthHeaders(additionalHeaders = {}) {
  const token = await getToken('jwt_token'); // Chave onde o token foi salvo no login
  const headers = {
    Accept: 'application/json',
    ...additionalHeaders,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Wrapper único por trás de toda chamada autenticada à API — antes, cada função
 * deste arquivo repetia o mesmo bloco de `fetch` + cabeçalhos + `handleResponse`
 * (35 vezes). Centralizar aqui é o que torna viável adicionar no futuro, num
 * único lugar, coisas como timeout ou retry no lado do cliente.
 *
 * @param {string} path - Caminho relativo, ex: '/meals/today?date=...'.
 * @param {object} [options]
 * @param {'GET'|'POST'|'PUT'|'DELETE'} [options.method]
 * @param {object|FormData} [options.body] - Objeto (vira JSON) ou FormData (upload de imagem).
 * @param {boolean} [options.isFormData] - true para upload de arquivo (não define Content-Type).
 * @param {object} [options.headers] - Cabeçalhos extras/sobrescritos.
 */
async function request(path, { method = 'GET', body, isFormData = false, headers: extraHeaders = {}, timeoutMs = DEFAULT_TIMEOUT_MS, _isRetry = false } = {}) {
  const hasJsonBody = body !== undefined && !isFormData;
  const headers = await getAuthHeaders({
    ...(hasJsonBody ? { 'Content-Type': 'application/json' } : {}),
    ...extraHeaders,
  });

  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: isFormData ? body : hasJsonBody ? JSON.stringify(body) : undefined,
  }, timeoutMs);

  if (response.status === 401) {
    if (_isRetry) {
      // Já tentamos renovar e refizemos a chamada — se AINDA assim voltou
      // 401, não há mais o que fazer além de forçar o logout.
      await forceLogout();
      throw new ApiError("Sessão expirada. Por favor, faça o login novamente.", 401);
    }

    try {
      await refreshAccessToken();
    } catch {
      await forceLogout();
      throw new ApiError("Sessão expirada. Por favor, faça o login novamente.", 401);
    }

    // Refaz a MESMA chamada uma vez, de forma transparente pro código que
    // chamou — quem estava salvando uma série de treino nem percebe que o
    // token foi renovado no meio do caminho.
    return request(path, { method, body, isFormData, headers: extraHeaders, timeoutMs, _isRetry: true });
  }

  return handleResponse(response);
}

/**
 * Envia a refeição para análise da IA (suporta tanto foto quanto texto).
 * @param {string} imageUri - URI local da imagem (retornada pela câmera).
 * @param {string} description - Texto descritivo da refeição.
 */
export async function analyzeMeal(imageUri, description) {
  if (imageUri) {
    const formData = new FormData();
    const filename = imageUri.split("/").pop();
    const match = /\.(\w+)$/.exec(filename ?? "");
    const fileType = match ? `image/${match[1]}` : "image/jpeg";

    formData.append("image", {
      uri: imageUri,
      name: filename ?? "meal.jpg",
      type: fileType,
    });

    return request("/meals/analyze", { method: "POST", body: formData, isFormData: true, timeoutMs: ANALYZE_MEAL_TIMEOUT_MS });
  } else if (description) {
    return request("/meals/analyze", { method: "POST", body: { description }, timeoutMs: ANALYZE_MEAL_TIMEOUT_MS });
  } else {
    throw new Error("Nenhuma imagem ou texto fornecido.");
  }
}

/**
 * Fotografa um rótulo/tabela nutricional e devolve um produto único (mesmo
 * shape de fetchProductByBarcode) — pro caso de produtos fora do
 * OpenFoodFacts, sem código de barras legível.
 * @param {string} imageUri - URI local da foto do rótulo.
 * @returns {Promise<{description:string, calories:number, protein_g:number, carbs_g:number, fat_g:number}>}
 */
export async function analyzeLabel(imageUri) {
  const formData = new FormData();
  const filename = imageUri.split("/").pop();
  const match = /\.(\w+)$/.exec(filename ?? "");
  const fileType = match ? `image/${match[1]}` : "image/jpeg";

  formData.append("image", {
    uri: imageUri,
    name: filename ?? "rotulo.jpg",
    type: fileType,
  });

  return request("/meals/analyze-label", { method: "POST", body: formData, isFormData: true, timeoutMs: ANALYZE_MEAL_TIMEOUT_MS });
}

/**
 * Salva a refeição confirmada pelo usuário no banco de dados.
 * @param {object} mealData - Os dados completos da refeição (com macros recalculados e a data).
 * @returns {Promise<object>} A refeição salva.
 */
export async function saveMeal(mealData) {
  return request("/meals/save", { method: "POST", body: mealData });
}

/**
 * Busca o resumo e histórico de refeições do dia atual.
 * @param {string} dateString - Data para a qual buscar o resumo (formato 'YYYY-MM-DD').
 * @returns {Promise<{total_calories:number, total_protein_g:number, total_carbs_g:number, total_fat_g:number, meals_count:number, meals:Array}>}
 */
export async function getTodaySummary(dateString) {
  const path = dateString ? `/meals/today?date=${dateString}` : "/meals/today";
  return request(path);
}

/**
 * Busca o resumo nutricional dos últimos 7 dias.
 * @param {string} [todayString] - "Hoje" no fuso do aparelho (YYYY-MM-DD). Sem
 *   isso a janela de 7 dias é calculada a partir do relógio UTC do servidor,
 *   que perto da meia-noite local pode discordar do dia que o aparelho considera "hoje".
 * @returns {Promise<{days: Array<{date: string, day_name: string, calories: number, protein_g: number}>}>}
 */
export async function getWeeklySummary(todayString) {
  const path = todayString ? `/meals/weekly_summary?today=${todayString}` : "/meals/weekly_summary";
  return request(path);
}

/**
 * Busca a sequência (streak) atual do usuário: dias consecutivos com refeição
 * ou treino registrado.
 * @param {string} [todayString] - "Hoje" no fuso do aparelho (YYYY-MM-DD).
 * @returns {Promise<{current_streak: number, active_today: boolean}>}
 */
export async function getStreak(todayString) {
  const path = todayString ? `/user/streak?today=${todayString}` : "/user/streak";
  return request(path);
}

/**
 * Rota de Login: Valida o usuário e retorna o Token JWT.
 *
 * Não passa por `request()` de propósito: não há token ainda, então não faz
 * sentido tentar anexar um Authorization (e um token antigo esquecido no
 * armazenamento local nunca deve ser enviado numa tentativa de login nova).
 */
export async function loginUser(email, password) {
  const response = await fetchWithTimeout(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return handleResponse(response);
}

/**
 * Rota de Logout: revoga o access token da sessão atual e, se fornecido, o
 * refresh token correspondente — sem enviar o refresh_token, o backend só
 * revoga o access token (o refresh token de 7 dias continuaria válido).
 * @param {string} [refreshToken]
 */
export async function logoutUser(refreshToken) {
  return request("/auth/logout", {
    method: "POST",
    body: refreshToken ? { refresh_token: refreshToken } : {},
  });
}

/**
 * Rota de Cadastro: Cria um novo usuário no banco de dados.
 */
export async function registerUser(name, email, password) {
  const response = await fetchWithTimeout(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ name, email, password })
  });
  return handleResponse(response);
}

/**
 * Busca as metas nutricionais do usuário logado.
 * @returns {Promise<{goal_calories: number, goal_protein_g: number, goal_carbs_g: number, goal_fat_g: number}>}
 */
export async function getUserGoals() {
  return request("/user/goals");
}

/**
 * Atualiza as metas nutricionais do usuário logado.
 * @param {object} goalsData - Objeto com as novas metas.
 * @returns {Promise<object>} A mensagem de sucesso do backend.
 */
export async function updateUserGoals(goalsData) {
  return request("/user/goals", { method: "PUT", body: goalsData });
}

/**
 * Apaga uma refeição específica do banco de dados.
 * @param {string|number} mealId - O ID da refeição a ser apagada.
 * @returns {Promise<object>} A mensagem de sucesso do backend.
 */
export async function deleteMeal(mealId) {
  return request(`/meals/${mealId}`, { method: "DELETE" });
}

/**
 * Calcula automaticamente as metas nutricionais baseadas nos dados físicos do usuário.
 * @param {object} physicalData - { weight, height, age, gender, activity_level, goal }
 */
export async function calculateSmartGoals(physicalData) {
  return request("/user/calculate-goals", { method: "POST", body: physicalData });
}

/**
 * Atualiza uma refeição existente.
 * @param {string|number} mealId - O ID da refeição a ser atualizada.
 * @param {object} mealData - Objeto com os novos dados da refeição.
 * @returns {Promise<object>} A refeição atualizada.
 */
export async function updateMeal(mealId, mealData) {
  return request(`/meals/${mealId}`, { method: "PUT", body: mealData });
}

/**
 * Busca alimentos no catálogo (cresce a cada análise de IA feita por qualquer
 * usuário), pra preencher macros automaticamente ao digitar na tela de
 * registro manual. Retorna [] se a busca não tiver pelo menos alguns caracteres.
 * @param {string} query
 */
export async function searchFoods(query) {
  const params = new URLSearchParams({ q: query });
  return request(`/meals/foods/search?${params.toString()}`);
}

/**
 * Funções do Sistema de Favoritos
 */
/**
 * Busca os favoritos do usuário (mais recente primeiro).
 *
 * O backend agora pagina essa lista (nunca devolve a tabela inteira de uma
 * vez) — pedimos o teto máximo por página pra manter o comportamento atual
 * (tela mostra tudo) enquanto a lista de favoritos de ninguém passar de 100.
 * Se algum dia isso mudar, use `data.has_more`/`data.total` (vem na resposta
 * crua) pra decidir se vale adicionar "carregar mais" aqui.
 * @returns {Promise<Array>}
 */
export async function getFavorites() {
  const data = await request("/meals/favorites?per_page=100");
  return data.items ?? data;
}

export async function addFavorite(mealData) {
  return request("/meals/favorites", { method: "POST", body: mealData });
}

export async function removeFavorite(favId) {
  return request(`/meals/favorites/${favId}`, { method: "DELETE" });
}

/**
 * Registra uma nova ingestão de água para o usuário.
 * @param {number} amount - A quantidade de água em ml.
 * @param {string} [date] - Dia (YYYY-MM-DD) no fuso do aparelho a que o registro pertence.
 *   Sem isso o servidor usa o próprio relógio UTC e a água tomada à noite cai no dia seguinte.
 * @returns {Promise<{message: string, total: number}>} A resposta com o total atualizado.
 */
export async function addWater(amount, date) {
  return request("/user/water/add", { method: "POST", body: { amount, date } });
}

/**
 * Busca um insight gerado por IA com base nas metas e no consumo do dia.
 * @param {object} goals - As metas do usuário.
 * @param {object} consumed - O total consumido pelo usuário.
 * @returns {Promise<{insight: string}>} A resposta com a frase de insight.
 */
export async function getDailyInsight(goals, consumed, language) {
  return request("/meals/daily-insight", { method: "POST", body: { goals, consumed, language } });
}

/**
 * Funções de Evolução Corporal
 */
/**
 * Busca o histórico de pesagens (mais antiga → mais nova, pro gráfico).
 *
 * Paginado no backend — ver comentário de `getFavorites` sobre o per_page=100.
 * @returns {Promise<Array>}
 */
export async function getWeightHistory() {
  const data = await request("/user/weight?per_page=100");
  return data.items ?? data;
}

export async function logWeight(weightData) {
  return request("/user/weight", { method: "POST", body: weightData });
}

/**
 * Fotos de progresso — mesma cadência de peso (uma por dia). Upload real,
 * arquivo fica guardado no backend (não só no aparelho).
 */
export async function getProgressPhotos() {
  const data = await request("/user/progress-photos?per_page=100");
  return data.items ?? data;
}

export async function addProgressPhoto(imageUri) {
  const formData = new FormData();
  const filename = imageUri.split("/").pop();
  const match = /\.(\w+)$/.exec(filename ?? "");
  const fileType = match ? `image/${match[1]}` : "image/jpeg";

  formData.append("image", {
    uri: imageUri,
    name: filename ?? "progresso.jpg",
    type: fileType,
  });

  return request("/user/progress-photos", { method: "POST", body: formData, isFormData: true });
}

export async function deleteProgressPhoto(photoId) {
  return request(`/user/progress-photos/${photoId}`, { method: "DELETE" });
}

/**
 * Monta um `source` autenticado pro componente <Image> do React Native —
 * a foto de progresso é conteúdo privado, servida só mediante o JWT do
 * próprio dono (rota .../image em user_routes.py), então a URL sozinha não
 * basta como um arquivo público serviria.
 * @param {string} imageUrl - o `image_url` relativo devolvido por ProgressPhoto.to_dict().
 */
export async function getAuthenticatedImageSource(imageUrl) {
  const token = await getToken('jwt_token');
  return {
    uri: `${API_BASE_URL}${imageUrl}`,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  };
}

/**
 * Monta a URL de download do relatório (PDF/CSV) com o JWT na própria query
 * string (?jwt=...) — diferente de toda outra chamada desta API, que manda
 * o token via header. Necessário porque essa URL é aberta com `Linking.openURL`
 * (navegador do sistema faz o download), que não tem como mandar um header
 * Authorization customizado. A rota GET /user/report é a única que aceita
 * essa forma de autenticação (ver backend/app/routes/user_routes.py).
 * @param {'pdf'|'csv'} format
 */
export async function getReportDownloadUrl(format) {
  const token = await getToken('jwt_token');
  return `${API_BASE_URL}/user/report?format=${format}&jwt=${token}`;
}

/**
 * Funções do Módulo de Treinos
 */

/**
 * Busca o histórico de treinos do usuário logado.
 *
 * Paginado no backend — ver comentário de `getFavorites` sobre o per_page=100.
 * @returns {Promise<Array>} Lista de treinos, do mais recente pro mais antigo.
 */
export async function listWorkouts() {
  const data = await request("/workouts?per_page=100");
  return data.items ?? data;
}

/**
 * Inicia um novo treino.
 * @param {object} data - { name? }
 */
export async function createWorkout(data = {}) {
  return request("/workouts", { method: "POST", body: data });
}

/**
 * Busca um treino específico, com suas séries já resolvidas (nome/grupo do exercício).
 * @param {string|number} workoutId
 */
export async function getWorkout(workoutId) {
  return request(`/workouts/${workoutId}`);
}

/**
 * Atualiza um treino (nome, notas, ou finaliza a sessão com { finished: true }).
 * @param {string|number} workoutId
 * @param {object} data
 */
export async function updateWorkout(workoutId, data) {
  return request(`/workouts/${workoutId}`, { method: "PUT", body: data });
}

/**
 * Apaga um treino (e suas séries).
 * @param {string|number} workoutId
 */
export async function deleteWorkout(workoutId) {
  return request(`/workouts/${workoutId}`, { method: "DELETE" });
}

/**
 * Registra uma série num treino.
 * @param {string|number} workoutId
 * @param {object} setData - { exercise_id, weight_kg, reps, rest_seconds? }
 */
export async function addSetLog(workoutId, setData) {
  return request(`/workouts/${workoutId}/sets`, { method: "POST", body: setData });
}

/**
 * Corrige peso/reps de uma série já registrada.
 * @param {string|number} workoutId
 * @param {string|number} setId
 * @param {object} setData
 */
export async function updateSetLog(workoutId, setId, setData) {
  return request(`/workouts/${workoutId}/sets/${setId}`, { method: "PUT", body: setData });
}

/**
 * Remove uma série registrada.
 * @param {string|number} workoutId
 * @param {string|number} setId
 */
export async function deleteSetLog(workoutId, setId) {
  return request(`/workouts/${workoutId}/sets/${setId}`, { method: "DELETE" });
}

/**
 * Busca exercícios no catálogo global, opcionalmente filtrando por texto/grupo muscular.
 *
 * Paginado no backend — ver comentário de `getFavorites` sobre o per_page=100.
 * @param {string} [search]
 * @param {string} [muscleGroup]
 */
export async function listExercises(search, muscleGroup) {
  const params = new URLSearchParams({ per_page: "100" });
  if (search) params.append("search", search);
  if (muscleGroup) params.append("muscle_group", muscleGroup);
  const data = await request(`/workouts/exercises?${params.toString()}`);
  return data.items ?? data;
}

/**
 * Busca as divisões de treino pré-cadastradas (Bro Split, ABCD, PPL, Upper/Lower,
 * Full Body), cada uma com seus dias aninhados.
 */
export async function listSplits() {
  return request("/workouts/splits");
}

/**
 * Busca os exercícios sugeridos de um dia específico de uma divisão.
 * @param {string|number} dayId
 */
export async function getSplitDayExercises(dayId) {
  return request(`/workouts/splits/days/${dayId}/exercises`);
}

/**
 * Busca o plano semanal de treino do usuário (Segunda a Domingo). Retorna
 * `{ has_plan: false }` se o usuário ainda não definiu um plano.
 */
export async function getWeeklyPlan() {
  return request("/workouts/weekly-plan");
}

/**
 * Cria (ou substitui) o plano semanal do usuário a partir de uma divisão.
 *
 * Sem `splitDayIds`, usa a escala padrão: cada dia da divisão ocupa um dia da
 * semana a partir de Segunda, na ordem cadastrada, e os dias restantes viram
 * descanso. Com `splitDayIds` (1 a 7 IDs de dias da própria divisão, podendo
 * repetir), define explicitamente o treino de cada dia a partir de Segunda —
 * usado quando o usuário treina mais (ou menos) dias por semana do que a
 * divisão tem originalmente.
 * @param {string|number} splitId
 * @param {Array<number>} [splitDayIds]
 */
export async function createWeeklyPlan(splitId, splitDayIds) {
  const body = splitDayIds ? { split_id: splitId, split_day_ids: splitDayIds } : { split_id: splitId };
  return request("/workouts/weekly-plan", { method: "POST", body });
}

/**
 * Reatribui manualmente um dia da semana do plano atual: para outro dia da
 * mesma divisão (`splitDayId`), ou para descanso (`splitDayId = null`).
 * @param {number} dayOfWeek - 0 (Segunda) a 6 (Domingo).
 * @param {number|null} splitDayId
 */
export async function updateWeeklyPlanDay(dayOfWeek, splitDayId) {
  return request(`/workouts/weekly-plan/days/${dayOfWeek}`, {
    method: "PUT",
    body: { split_day_id: splitDayId },
  });
}

/**
 * Apaga o plano semanal atual do usuário.
 */
export async function deleteWeeklyPlan() {
  return request("/workouts/weekly-plan", { method: "DELETE" });
}

/**
 * Cria um exercício customizado no catálogo (deduplicado pelo backend).
 * @param {object} data - { name, muscle_group?, equipment? }
 */
export async function createExercise(data) {
  return request("/workouts/exercises", { method: "POST", body: data });
}

/**
 * Busca o histórico de um exercício (agrupado por treino, mais recente primeiro).
 * Usado pra mostrar "Última vez: Xkg × Y" ao registrar uma série.
 * @param {string|number} exerciseId
 * @param {number} [limit]
 */
export async function getExerciseHistory(exerciseId, limit) {
  const query = limit ? `?limit=${limit}` : "";
  return request(`/workouts/exercises/${exerciseId}/history${query}`);
}

/**
 * Busca a tonelagem, reps e descanso médio dos últimos treinos finalizados,
 * pra comparação de progresso entre sessões.
 * @param {number} [limit]
 */
export async function getWorkoutProgress(limit) {
  const query = limit ? `?limit=${limit}` : "";
  return request(`/workouts/progress${query}`);
}
