/**
 * Antes, fetchProductByBarcode engolia QUALQUER erro (rede caiu, resposta não
 * era JSON, produto genuinamente não cadastrado) no mesmo catch e devolvia
 * `null` sempre — CameraScreen não tinha como diferenciar "sem internet" de
 * "produto não existe". Estes testes fixam que cada caso lança um tipo de
 * erro diferente.
 */
import { fetchProductByBarcode, BarcodeNetworkError, ProductNotFoundError } from './openFoodFacts';

function mockFetchOnce(body) {
  global.fetch = jest.fn().mockResolvedValue({
    json: async () => body,
  });
}

describe('fetchProductByBarcode', () => {
  test('produto encontrado (status 1): devolve os macros priorizando o valor por porção', async () => {
    mockFetchOnce({
      status: 1,
      product: {
        product_name: 'Barra de Proteína',
        nutriments: {
          'energy-kcal_serving': 200,
          'energy-kcal_100g': 400,
          proteins_serving: 20,
          carbohydrates_serving: 15,
          fat_serving: 6,
        },
      },
    });

    const result = await fetchProductByBarcode('789123456');

    expect(result).toEqual({
      description: 'Barra de Proteína',
      calories: 200,
      protein_g: 20,
      carbs_g: 15,
      fat_g: 6,
    });
  });

  test('produto genuinamente não cadastrado (status !== 1): lança ProductNotFoundError', async () => {
    mockFetchOnce({ status: 0 });

    await expect(fetchProductByBarcode('000000000')).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  test('fetch falha (sem conexão): lança BarcodeNetworkError, não ProductNotFoundError', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));

    await expect(fetchProductByBarcode('789123456')).rejects.toBeInstanceOf(BarcodeNetworkError);
  });

  test('resposta não é JSON válido: lança BarcodeNetworkError, não ProductNotFoundError', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => { throw new SyntaxError('Unexpected token'); },
    });

    await expect(fetchProductByBarcode('789123456')).rejects.toBeInstanceOf(BarcodeNetworkError);
  });
});
