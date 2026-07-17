/**
 * Camada de acesso à API do microserviço de nutrição.
 * Nenhum componente de tela deve chamar `fetch` diretamente — tudo passa por aqui,
 * o que facilita trocar de backend ou mockar em testes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigate } from '../navigation/RootNavigation'; // Importa o helper de navegação
// Em desenvolvimento, use o IP da sua máquina na rede local (não use "localhost"
// se estiver testando em um celular físico ou emulador Android).
// Exemplo: "http://192.168.0.10:5000"
const API_BASE_URL = "http://192.168.0.10:5000/api";

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