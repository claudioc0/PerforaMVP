/**
 * Camada de acesso à API do microserviço de nutrição.
 * Nenhum componente de tela deve chamar `fetch` diretamente — tudo passa por aqui,
 * o que facilita trocar de backend ou mockar em testes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
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
  return handleResponse(response); // <-- Faltava processar a resposta
}