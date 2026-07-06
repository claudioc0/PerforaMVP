/**
 * Camada de acesso à API do microserviço de nutrição.
 * Nenhum componente de tela deve chamar `fetch` diretamente — tudo passa por aqui,
 * o que facilita trocar de backend ou mockar em testes.
 */

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

    const response = await fetch(`${API_BASE_URL}/meals/analyze`, {
      method: "POST",
      body: formData,
      headers: {
        Accept: "application/json",
        // NÃO defina 'Content-Type' manualmente para multipart/form-data no RN —
        // o fetch adiciona o boundary correto automaticamente.
      },
    });

    return handleResponse(response);
    
  } else if (description) {
    // Fluxo 2: Envio de Texto
    const response = await fetch(`${API_BASE_URL}/meals/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ description }),
    });

    return handleResponse(response);
    
  } else {
    throw new Error("Nenhuma imagem ou texto fornecido.");
  }
}

/**
 * Busca o resumo e histórico de refeições do dia atual.
 * @returns {Promise<{total_calories:number, total_protein_g:number, total_carbs_g:number, total_fat_g:number, meals_count:number, meals:Array}>}
 */
export async function getTodaySummary() {
  const response = await fetch(`${API_BASE_URL}/meals/today`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  return handleResponse(response);
}

export { ApiError };
