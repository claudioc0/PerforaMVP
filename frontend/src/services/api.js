/**
 * Camada de acesso à API do microserviço de nutrição.
 * Nenhum componente de tela deve chamar `fetch` diretamente — tudo passa por aqui,
 * o que facilita trocar de backend ou mockar em testes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigate } from '../navigation/RootNavigation'; // Importa o helper de navegação

// Configurável via .env (EXPO_PUBLIC_API_URL) — veja .env.example.
// Em desenvolvimento, use o IP da sua máquina na rede local (não use "localhost"
// se estiver testando em um celular físico ou emulador Android).
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.0.10:5000/api";

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function handleResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await response.json() : await response.text();

  // --- INTERCEPTADOR GLOBAL DE ERRO 401 ---
  // Se a resposta for 401 (Não Autorizado), o token é inválido ou expirou.
  // Deslogamos o usuário e o redirecionamos para a tela de Login.
  if (response.status === 401) {
    console.log("API: Recebido erro 401. Deslogando usuário.");
    await AsyncStorage.removeItem('jwt_token'); // Limpa o token inválido
    navigate('Login'); // Redireciona para o login
    // Lança um erro específico para interromper o fluxo e evitar que a tela de origem tente renderizar dados.
    throw new ApiError("Sessão expirada. Por favor, faça o login novamente.", 401);
  }

  if (!response.ok) {
    const message = isJson && body?.error ? body.error : "Erro ao comunicar com o servidor.";
    throw new ApiError(message, response.status);
  }

  return body;
}

/**
 * Cria os cabeçalhos padrão para requisições, incluindo o token JWT se disponível.
 * @param {object} additionalHeaders - Cabeçalhos adicionais, como 'Content-Type'.
 * @returns {Promise<object>}
 */
async function getAuthHeaders(additionalHeaders = {}) {
  const token = await AsyncStorage.getItem('jwt_token'); // Chave onde o token foi salvo no login
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
 * Envia a refeição para análise da IA (suporta tanto foto quanto texto).
 * @param {string} imageUri - URI local da imagem (retornada pela câmera).
 * @param {string} description - Texto descritivo da refeição.
 */
export async function analyzeMeal(imageUri, description) {
  if (imageUri) {
    // Fluxo 1: Envio de Imagem
    const formData = new FormData();

    const filename = imageUri.split("/").pop();
    const match = /\.(\w+)$/.exec(filename ?? "");
    const fileType = match ? `image/${match[1]}` : "image/jpeg";

    formData.append("image", {
      uri: imageUri,
      name: filename ?? "meal.jpg",
      type: fileType,
    });

    const headers = await getAuthHeaders(); // Pega o cabeçalho com o token
    const response = await fetch(`${API_BASE_URL}/meals/analyze`, {
      method: "POST",
      body: formData,
      headers,
    });

    return handleResponse(response);
    
  } else if (description) {
    // Fluxo 2: Envio de Texto
    const response = await fetch(`${API_BASE_URL}/meals/analyze`, {
      method: "POST",
      headers: await getAuthHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ description }),
    });

    return handleResponse(response);
    
  } else {
    throw new Error("Nenhuma imagem ou texto fornecido.");
  }
}

/**
 * Salva a refeição confirmada pelo usuário no banco de dados.
 * @param {object} mealData - Os dados completos da refeição (com macros recalculados e a data).
 * @returns {Promise<object>} A refeição salva.
 */
export async function saveMeal(mealData) {
  const response = await fetch(`${API_BASE_URL}/meals/save`, {
    method: 'POST',
    headers: await getAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(mealData),
  });

  return handleResponse(response);
}

/**
 * Busca o resumo e histórico de refeições do dia atual.
 * @param {string} dateString - Data para a qual buscar o resumo (formato 'YYYY-MM-DD').
 * @returns {Promise<{total_calories:number, total_protein_g:number, total_carbs_g:number, total_fat_g:number, meals_count:number, meals:Array}>}
 */
export async function getTodaySummary(dateString) {
  const endpoint = `${API_BASE_URL}/meals/today`;
  const url = dateString ? `${endpoint}?date=${dateString}` : endpoint;
  const headers = await getAuthHeaders(); // Pega o cabeçalho com o token
  const response = await fetch(url, {
    method: "GET",
    headers,
  });

  return handleResponse(response);
}

/**
 * Busca o resumo nutricional dos últimos 7 dias.
 * @returns {Promise<{days: Array<{date: string, day_name: string, calories: number, protein_g: number}>}>}
 */
export async function getWeeklySummary() {
  const response = await fetch(`${API_BASE_URL}/meals/weekly_summary`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });

  return handleResponse(response);
}

/**
 * Rota de Login: Valida o usuário e retorna o Token JWT.
 */
export async function loginUser(email, password) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return handleResponse(response);
}

/**
 * Rota de Cadastro: Cria um novo usuário no banco de dados.
 */
export async function registerUser(name, email, password) {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
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
  const response = await fetch(`${API_BASE_URL}/user/goals`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });
  return handleResponse(response);
}

/**
 * Atualiza as metas nutricionais do usuário logado.
 * @param {object} goalsData - Objeto com as novas metas.
 * @returns {Promise<object>} A mensagem de sucesso do backend.
 */
export async function updateUserGoals(goalsData) {
  const response = await fetch(`${API_BASE_URL}/user/goals`, {
    method: 'PUT',
    headers: await getAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(goalsData),
  });
  return handleResponse(response);
}

/**
 * Apaga uma refeição específica do banco de dados.
 * @param {string|number} mealId - O ID da refeição a ser apagada.
 * @returns {Promise<object>} A mensagem de sucesso do backend.
 */
export async function deleteMeal(mealId) {
  const response = await fetch(`${API_BASE_URL}/meals/${mealId}`, {
    method: 'DELETE',
    headers: await getAuthHeaders(),
  });
  return handleResponse(response);
}

/**
 * Calcula automaticamente as metas nutricionais baseadas nos dados físicos do usuário.
 * @param {object} physicalData - { weight, height, age, gender, activity_level, goal }
 */
export async function calculateSmartGoals(physicalData) {
  const headers = await getAuthHeaders({
    'Content-Type': 'application/json',
  });
  
  const response = await fetch(`${API_BASE_URL}/user/calculate-goals`, {
    method: "POST",
    headers,
    body: JSON.stringify(physicalData),
  });
  
  return handleResponse(response);
}

/**
 * Atualiza uma refeição existente.
 * @param {string|number} mealId - O ID da refeição a ser atualizada.
 * @param {object} mealData - Objeto com os novos dados da refeição.
 * @returns {Promise<object>} A refeição atualizada.
 */
export async function updateMeal(mealId, mealData) {
  const response = await fetch(`${API_BASE_URL}/meals/${mealId}`, {
    method: 'PUT',
    headers: await getAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(mealData),
  });
  return handleResponse(response);
}

/**
 * Busca alimentos no catálogo (cresce a cada análise de IA feita por qualquer
 * usuário), pra preencher macros automaticamente ao digitar na tela de
 * registro manual. Retorna [] se a busca não tiver pelo menos alguns caracteres.
 * @param {string} query
 */
export async function searchFoods(query) {
  const params = new URLSearchParams({ q: query });
  const response = await fetch(`${API_BASE_URL}/meals/foods/search?${params.toString()}`, {
    method: "GET",
    headers: await getAuthHeaders(),
  });
  return handleResponse(response);
}

/**
 * Funções do Sistema de Favoritos
 */
export async function getFavorites() {
  const authHeader = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/meals/favorites`, {
    method: "GET",
    headers: { Accept: "application/json", ...authHeader },
  });
  return handleResponse(response);
}

export async function addFavorite(mealData) {
  const authHeader = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/meals/favorites`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...authHeader },
    body: JSON.stringify(mealData),
  });
  return handleResponse(response);
}

export async function removeFavorite(favId) {
  const authHeader = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/meals/favorites/${favId}`, {
    method: "DELETE",
    headers: { Accept: "application/json", ...authHeader },
  });
  return handleResponse(response);
}

/**
 * Registra uma nova ingestão de água para o usuário.
 * @param {number} amount - A quantidade de água em ml.
 * @param {string} [date] - Dia (YYYY-MM-DD) no fuso do aparelho a que o registro pertence.
 *   Sem isso o servidor usa o próprio relógio UTC e a água tomada à noite cai no dia seguinte.
 * @returns {Promise<{message: string, total: number}>} A resposta com o total atualizado.
 */
export async function addWater(amount, date) {
  const response = await fetch(`${API_BASE_URL}/user/water/add`, {
    method: 'POST',
    headers: await getAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ amount, date }),
  });
  return handleResponse(response);
}

/**
 * Busca um insight gerado por IA com base nas metas e no consumo do dia.
 * @param {object} goals - As metas do usuário.
 * @param {object} consumed - O total consumido pelo usuário.
 * @returns {Promise<{insight: string}>} A resposta com a frase de insight.
 */
export async function getDailyInsight(goals, consumed) {
  const response = await fetch(`${API_BASE_URL}/meals/daily-insight`, {
    method: 'POST',
    headers: await getAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ goals, consumed }),
  });
  return handleResponse(response);
}

/** 
 * Funções de Evolução Corporal
 */
export async function getWeightHistory() {
  const authHeader = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/user/weight`, {
    method: "GET",
    headers: { Accept: "application/json", ...authHeader },
  });
  return handleResponse(response);
}

export async function logWeight(weightData) {
  const authHeader = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/user/weight`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...authHeader },
    body: JSON.stringify(weightData),
  });
  return handleResponse(response);
}

/**
 * Funções do Módulo de Treinos
 */

/**
 * Busca o histórico de treinos do usuário logado.
 * @returns {Promise<Array>} Lista de treinos, do mais recente pro mais antigo.
 */
export async function listWorkouts() {
  const response = await fetch(`${API_BASE_URL}/workouts`, {
    method: "GET",
    headers: await getAuthHeaders(),
  });
  return handleResponse(response);
}

/**
 * Inicia um novo treino.
 * @param {object} data - { name? }
 */
export async function createWorkout(data = {}) {
  const response = await fetch(`${API_BASE_URL}/workouts`, {
    method: "POST",
    headers: await getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

/**
 * Busca um treino específico, com suas séries já resolvidas (nome/grupo do exercício).
 * @param {string|number} workoutId
 */
export async function getWorkout(workoutId) {
  const response = await fetch(`${API_BASE_URL}/workouts/${workoutId}`, {
    method: "GET",
    headers: await getAuthHeaders(),
  });
  return handleResponse(response);
}

/**
 * Atualiza um treino (nome, notas, ou finaliza a sessão com { finished: true }).
 * @param {string|number} workoutId
 * @param {object} data
 */
export async function updateWorkout(workoutId, data) {
  const response = await fetch(`${API_BASE_URL}/workouts/${workoutId}`, {
    method: "PUT",
    headers: await getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

/**
 * Apaga um treino (e suas séries).
 * @param {string|number} workoutId
 */
export async function deleteWorkout(workoutId) {
  const response = await fetch(`${API_BASE_URL}/workouts/${workoutId}`, {
    method: "DELETE",
    headers: await getAuthHeaders(),
  });
  return handleResponse(response);
}

/**
 * Registra uma série num treino.
 * @param {string|number} workoutId
 * @param {object} setData - { exercise_id, weight_kg, reps, rest_seconds? }
 */
export async function addSetLog(workoutId, setData) {
  const response = await fetch(`${API_BASE_URL}/workouts/${workoutId}/sets`, {
    method: "POST",
    headers: await getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(setData),
  });
  return handleResponse(response);
}

/**
 * Corrige peso/reps de uma série já registrada.
 * @param {string|number} workoutId
 * @param {string|number} setId
 * @param {object} setData
 */
export async function updateSetLog(workoutId, setId, setData) {
  const response = await fetch(`${API_BASE_URL}/workouts/${workoutId}/sets/${setId}`, {
    method: "PUT",
    headers: await getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(setData),
  });
  return handleResponse(response);
}

/**
 * Remove uma série registrada.
 * @param {string|number} workoutId
 * @param {string|number} setId
 */
export async function deleteSetLog(workoutId, setId) {
  const response = await fetch(`${API_BASE_URL}/workouts/${workoutId}/sets/${setId}`, {
    method: "DELETE",
    headers: await getAuthHeaders(),
  });
  return handleResponse(response);
}

/**
 * Busca exercícios no catálogo global, opcionalmente filtrando por texto/grupo muscular.
 * @param {string} [search]
 * @param {string} [muscleGroup]
 */
export async function listExercises(search, muscleGroup) {
  const params = new URLSearchParams();
  if (search) params.append("search", search);
  if (muscleGroup) params.append("muscle_group", muscleGroup);
  const query = params.toString() ? `?${params.toString()}` : "";

  const response = await fetch(`${API_BASE_URL}/workouts/exercises${query}`, {
    method: "GET",
    headers: await getAuthHeaders(),
  });
  return handleResponse(response);
}

/**
 * Busca as divisões de treino pré-cadastradas (Bro Split, ABCD, PPL, Upper/Lower,
 * Full Body), cada uma com seus dias aninhados.
 */
export async function listSplits() {
  const response = await fetch(`${API_BASE_URL}/workouts/splits`, {
    method: "GET",
    headers: await getAuthHeaders(),
  });
  return handleResponse(response);
}

/**
 * Busca os exercícios sugeridos de um dia específico de uma divisão.
 * @param {string|number} dayId
 */
export async function getSplitDayExercises(dayId) {
  const response = await fetch(`${API_BASE_URL}/workouts/splits/days/${dayId}/exercises`, {
    method: "GET",
    headers: await getAuthHeaders(),
  });
  return handleResponse(response);
}

/**
 * Busca o plano semanal de treino do usuário (Segunda a Domingo). Retorna
 * `{ has_plan: false }` se o usuário ainda não definiu um plano.
 */
export async function getWeeklyPlan() {
  const response = await fetch(`${API_BASE_URL}/workouts/weekly-plan`, {
    method: "GET",
    headers: await getAuthHeaders(),
  });
  return handleResponse(response);
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
  const response = await fetch(`${API_BASE_URL}/workouts/weekly-plan`, {
    method: "POST",
    headers: await getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  return handleResponse(response);
}

/**
 * Reatribui manualmente um dia da semana do plano atual: para outro dia da
 * mesma divisão (`splitDayId`), ou para descanso (`splitDayId = null`).
 * @param {number} dayOfWeek - 0 (Segunda) a 6 (Domingo).
 * @param {number|null} splitDayId
 */
export async function updateWeeklyPlanDay(dayOfWeek, splitDayId) {
  const response = await fetch(`${API_BASE_URL}/workouts/weekly-plan/days/${dayOfWeek}`, {
    method: "PUT",
    headers: await getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ split_day_id: splitDayId }),
  });
  return handleResponse(response);
}

/**
 * Apaga o plano semanal atual do usuário.
 */
export async function deleteWeeklyPlan() {
  const response = await fetch(`${API_BASE_URL}/workouts/weekly-plan`, {
    method: "DELETE",
    headers: await getAuthHeaders(),
  });
  return handleResponse(response);
}

/**
 * Cria um exercício customizado no catálogo (deduplicado pelo backend).
 * @param {object} data - { name, muscle_group?, equipment? }
 */
export async function createExercise(data) {
  const response = await fetch(`${API_BASE_URL}/workouts/exercises`, {
    method: "POST",
    headers: await getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

/**
 * Busca o histórico de um exercício (agrupado por treino, mais recente primeiro).
 * Usado pra mostrar "Última vez: Xkg × Y" ao registrar uma série.
 * @param {string|number} exerciseId
 * @param {number} [limit]
 */
export async function getExerciseHistory(exerciseId, limit) {
  const query = limit ? `?limit=${limit}` : "";
  const response = await fetch(`${API_BASE_URL}/workouts/exercises/${exerciseId}/history${query}`, {
    method: "GET",
    headers: await getAuthHeaders(),
  });
  return handleResponse(response);
}

/**
 * Busca a tonelagem, reps e descanso médio dos últimos treinos finalizados,
 * pra comparação de progresso entre sessões.
 * @param {number} [limit]
 */
export async function getWorkoutProgress(limit) {
  const query = limit ? `?limit=${limit}` : "";
  const response = await fetch(`${API_BASE_URL}/workouts/progress${query}`, {
    method: "GET",
    headers: await getAuthHeaders(),
  });
  return handleResponse(response);
}