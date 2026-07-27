/**
 * Testa o wrapper `request()` que ficou por trás de todas as chamadas — ele é
 * o único lugar que monta headers, injeta o token e trata 401 pra 35 funções
 * exportadas deste arquivo. Um bug aqui afeta o app inteiro de uma vez, mas
 * antes da extração não dava pra testar isso sem duplicar a asserção em cada
 * função individualmente.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('../navigation/RootNavigation', () => ({
  navigate: jest.fn(),
}));

// api.js lança um erro na importação se EXPO_PUBLIC_API_URL não estiver
// definida (fail-fast proposital) — precisa estar setada ANTES do primeiro
// require deste módulo neste processo de teste.
process.env.EXPO_PUBLIC_API_URL = 'http://test.local/api';

const AsyncStorage = require('@react-native-async-storage/async-storage');
const { navigate } = require('../navigation/RootNavigation');

// Importado uma única vez (não dentro de cada teste): os mocks acima já estão
// no lugar antes deste require, e reusar a mesma instância evita que um
// jest.resetModules() no meio do arquivo crie uma cópia nova do mock,
// desconectada do que os testes configuram.
const {
  getTodaySummary,
  saveMeal,
  deleteMeal,
  getUserGoals,
  analyzeMeal,
  logWeight,
  loginUser,
} = require('./api');

function mockFetchOnce({ status = 200, body = {}, isJson = true }) {
  global.fetch = jest.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => (isJson ? 'application/json' : 'text/plain') },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  return global.fetch;
}

describe('request() (via as funções exportadas de api.js)', () => {
  beforeEach(() => {
    AsyncStorage.getItem.mockReset();
    AsyncStorage.removeItem.mockReset();
    navigate.mockReset();
  });

  test('GET sem corpo não envia Content-Type', async () => {
    AsyncStorage.getItem.mockResolvedValue(null);
    const fetchMock = mockFetchOnce({ body: { total_calories: 0 } });

    await getTodaySummary('2026-07-27');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://test.local/api/meals/today?date=2026-07-27',
      expect.objectContaining({ method: 'GET' })
    );
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers['Content-Type']).toBeUndefined();
    expect(options.body).toBeUndefined();
  });

  test('POST com corpo envia Content-Type e o corpo serializado em JSON', async () => {
    AsyncStorage.getItem.mockResolvedValue(null);
    const fetchMock = mockFetchOnce({ status: 201, body: { id: 1 } });

    await saveMeal({ description: 'Arroz', calories: 130 });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://test.local/api/meals/save');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({ description: 'Arroz', calories: 130 });
  });

  test('DELETE usa o método correto e a URL com o id', async () => {
    AsyncStorage.getItem.mockResolvedValue(null);
    const fetchMock = mockFetchOnce({ body: { message: 'ok' } });

    await deleteMeal(42);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://test.local/api/meals/42',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  test('anexa Authorization quando há token salvo', async () => {
    AsyncStorage.getItem.mockResolvedValue('meu-token-jwt');
    const fetchMock = mockFetchOnce({ body: {} });

    await getUserGoals();

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer meu-token-jwt');
  });

  test('não envia Authorization quando não há token', async () => {
    AsyncStorage.getItem.mockResolvedValue(null);
    const fetchMock = mockFetchOnce({ body: {} });
    await getUserGoals();

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });

  test('upload de imagem (FormData) não define Content-Type manualmente', async () => {
    // Precisa que o runtime forneça FormData; se ausente, define um stub mínimo
    // só pra este teste (o objetivo é a ausência do header, não o FormData em si).
    if (typeof global.FormData === 'undefined') {
      global.FormData = class {
        append() {}
      };
    }
    AsyncStorage.getItem.mockResolvedValue(null);
    const fetchMock = mockFetchOnce({ body: { items: [] } });

    await analyzeMeal('file:///foto.jpg', null);

    const [, options] = fetchMock.mock.calls[0];
    // O RN/browser precisa definir o boundary do multipart sozinho — se a gente
    // fixar 'Content-Type': 'application/json' aqui, o upload quebra.
    expect(options.headers['Content-Type']).toBeUndefined();
  });

  test('401 limpa o token, redireciona pro Login e lança ApiError', async () => {
    AsyncStorage.getItem.mockResolvedValue('token-expirado');
    mockFetchOnce({ status: 401, body: { error: 'Token expirado' } });
    await expect(getUserGoals()).rejects.toMatchObject({ status: 401 });

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('jwt_token');
    expect(navigate).toHaveBeenCalledWith('Login');
  });

  test('erro do backend (4xx/5xx) propaga a mensagem de "error" do corpo', async () => {
    AsyncStorage.getItem.mockResolvedValue(null);
    mockFetchOnce({ status: 400, body: { error: 'Quantidade inválida' } });

    await expect(logWeight({ weight: -5 })).rejects.toMatchObject({
      status: 400,
      message: 'Quantidade inválida',
    });
  });

  test('login não anexa Authorization mesmo com um token antigo salvo', async () => {
    AsyncStorage.getItem.mockResolvedValue('token-de-outra-sessao');
    const fetchMock = mockFetchOnce({ body: { token: 'novo-token' } });

    await loginUser('a@b.com', 'senha123');

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });
});
