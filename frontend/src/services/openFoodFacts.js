/**
 * Antes, QUALQUER erro (fetch falhou por falta de conexão, resposta não era
 * JSON, produto genuinamente não cadastrado) era engolido no mesmo catch e
 * virava `null` — o chamador (CameraScreen) não tinha como diferenciar "sem
 * internet, tente de novo" de "esse produto não existe no banco". Em modo
 * avião, o usuário era levado a digitar os macros manualmente pra um produto
 * que na verdade existe, só não deu pra consultar.
 *
 * Agora cada caso lança um erro de um tipo diferente, e quem chama decide o
 * que fazer com cada um.
 */
export class BarcodeNetworkError extends Error {}
export class ProductNotFoundError extends Error {}

/**
 * Busca os dados nutricionais de um produto pelo código de barras.
 * @param {string} barcode - O código de barras lido pela câmera.
 */
export async function fetchProductByBarcode(barcode) {
  let response;
  try {
    response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
  } catch (error) {
    throw new BarcodeNetworkError('Não foi possível conectar ao banco de produtos. Verifique sua internet.');
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new BarcodeNetworkError('Resposta inválida do banco de produtos.');
  }

  if (data.status !== 1) {
    throw new ProductNotFoundError('Produto não encontrado no banco de dados.');
  }

  const product = data.product;
  const nutriments = product.nutriments || {};

  // Prioriza o valor da porção (serving), se não existir, pega o valor a cada 100g
  return {
    description: product.product_name || "Produto Desconhecido",
    calories: nutriments["energy-kcal_serving"] || nutriments["energy-kcal_100g"] || 0,
    protein_g: nutriments["proteins_serving"] || nutriments["proteins_100g"] || 0,
    carbs_g: nutriments["carbohydrates_serving"] || nutriments["carbohydrates_100g"] || 0,
    fat_g: nutriments["fat_serving"] || nutriments["fat_100g"] || 0,
  };
}
