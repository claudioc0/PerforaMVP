/**
 * Busca os dados nutricionais de um produto pelo código de barras.
 * @param {string} barcode - O código de barras lido pela câmera.
 */
export async function fetchProductByBarcode(barcode) {
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const data = await response.json();

    if (data.status !== 1) {
      throw new Error("Produto não encontrado no banco de dados.");
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
  } catch (error) {
    console.error("Erro no Open Food Facts:", error);
    return null;
  }
}