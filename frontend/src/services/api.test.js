/**
 * Testa o wrapper `request()` que ficou por trás de todas as chamadas — ele é
 * o único lugar que monta headers, injeta o token e trata 401 pra 35 funções
 * exportadas deste arquivo. Um bug aqui afeta o app inteiro de uma vez, mas
 * antes da extração não dava pra testar isso sem duplicar a asserção em cada
 * função individualmente.
 */

jest.mock('./secureTokenStorage', () => ({
  getToken: jest.fn(),
  setToken: jest.fn(),
  removeToken: jest.fn(),
}));

jest.mock('./session', () => ({
  clearLocalSession: jest.fn(),
}));

jest.mock('../navigation/RootNavigation', () => ({
  resetToLogin: jest.fn(),
}));

// api.js lança um erro na importação se EXPO_PUBLIC_API_URL não estiver
// definida (fail-fast proposital) — precisa estar setada ANTES do primeiro
// require deste módulo neste processo de teste.
process.env.EXPO_PUBLIC_API_URL = 'http://test.local/api';

const { getToken, setToken } = require('./secureTokenStorage');
const { clearLocalSession } = require('./session');
const { resetToLogin } = require('../navigation/RootNavigation');

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
  logoutUser,
  getFavorites,
  getWeightHistory,
  listWorkouts,
  listExercises,
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

/**
 * Como mockFetchOnce, mas devolve uma resposta DIFERENTE a cada chamada
 * sucessiva (na ordem em que fetch() é invocado) — necessário pra testar o
 * fluxo de refresh, que faz 3 chamadas sequenciais e distintas (a original,
 * o /auth/refresh, e a chamada refeita).
 */
function mockFetchSequence(responses) {
  let callIndex = 0;
  global.fetch = jest.fn(() => {
    const config = responses[Math.min(callIndex, responses.length - 1)];
    callIndex += 1;
    const { status = 200, body = {}, isJson = true } = config;
    return Promise.resolve({
      status,
      ok: status >= 200 && status < 300,
      headers: { get: () => (isJson ? 'application/json' : 'text/plain') },
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    });
  });
  return global.fetch;
}

describe('request() (via as funções exportadas de api.js)', () => {
  beforeEach(() => {
    getToken.mockReset();
    resetToLogin.mockReset();
  });

  test('GET sem corpo não envia Content-Type', async () => {
    getToken.mockResolvedValue(null);
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
    getToken.mockResolvedValue(null);
    const fetchMock = mockFetchOnce({ status: 201, body: { id: 1 } });

    await saveMeal({ description: 'Arroz', calories: 130 });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://test.local/api/meals/save');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({ description: 'Arroz', calories: 130 });
  });

  test('DELETE usa o método correto e a URL com o id', async () => {
    getToken.mockResolvedValue(null);
    const fetchMock = mockFetchOnce({ body: { message: 'ok' } });

    await deleteMeal(42);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://test.local/api/meals/42',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  test('anexa Authorization quando há token salvo', async () => {
    getToken.mockResolvedValue('meu-token-jwt');
    const fetchMock = mockFetchOnce({ body: {} });

    await getUserGoals();

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer meu-token-jwt');
  });

  test('não envia Authorization quando não há token', async () => {
    getToken.mockResolvedValue(null);
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
    getToken.mockResolvedValue(null);
    const fetchMock = mockFetchOnce({ body: { items: [] } });

    await analyzeMeal('file:///foto.jpg', null);

    const [, options] = fetchMock.mock.calls[0];
    // O RN/browser precisa definir o boundary do multipart sozinho — se a gente
    // fixar 'Content-Type': 'application/json' aqui, o upload quebra.
    expect(options.headers['Content-Type']).toBeUndefined();
  });

  test('erro do backend (4xx/5xx) propaga a mensagem de "error" do corpo', async () => {
    getToken.mockResolvedValue(null);
    mockFetchOnce({ status: 400, body: { error: 'Quantidade inválida' } });

    await expect(logWeight({ weight: -5 })).rejects.toMatchObject({
      status: 400,
      message: 'Quantidade inválida',
    });
  });

  test('logout envia o refresh_token no corpo quando fornecido', async () => {
    getToken.mockResolvedValue('access-token-atual');
    const fetchMock = mockFetchOnce({ body: { message: 'ok' } });

    await logoutUser('refresh-token-salvo');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://test.local/api/auth/logout');
    expect(options.method).toBe('POST');
    // O access token vai no header (é o que autentica a rota /logout).
    expect(options.headers.Authorization).toBe('Bearer access-token-atual');
    expect(JSON.parse(options.body)).toEqual({ refresh_token: 'refresh-token-salvo' });
  });

  test('logout sem refresh_token não quebra e não envia o campo', async () => {
    getToken.mockResolvedValue('access-token-atual');
    const fetchMock = mockFetchOnce({ body: { message: 'ok' } });

    await logoutUser(undefined);

    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({});
  });

  test('login não anexa Authorization mesmo com um token antigo salvo', async () => {
    getToken.mockResolvedValue('token-de-outra-sessao');
    const fetchMock = mockFetchOnce({ body: { token: 'novo-token' } });

    await loginUser('a@b.com', 'senha123');

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });
});

describe('renovação de access token (refresh) em request()', () => {
  // Antes, um 401 (access token expirado, validade de 1h) forçava logout na
  // hora — inclusive no meio de uma série de treino em andamento, perdendo
  // o formulário. Agora request() tenta renovar com o refresh token
  // (validade de 7 dias) e refaz a MESMA chamada uma vez, de forma
  // transparente, antes de desistir.
  beforeEach(() => {
    getToken.mockReset();
    setToken.mockReset();
    resetToLogin.mockReset();
    clearLocalSession.mockReset();
  });

  test('401 na chamada original: renova com o refresh token e refaz a chamada sem quebrar pro chamador', async () => {
    getToken.mockImplementation((key) => {
      if (key === 'jwt_token') return Promise.resolve('token-expirado');
      if (key === 'refresh_token') return Promise.resolve('refresh-valido');
      return Promise.resolve(null);
    });
    const fetchMock = mockFetchSequence([
      { status: 401, body: { error: 'Token expirado' } }, // chamada original
      { status: 200, body: { token: 'token-novo' } },      // POST /auth/refresh
      { status: 200, body: { goal_calories: 2000 } },      // chamada refeita
    ]);

    const result = await getUserGoals();

    expect(result).toEqual({ goal_calories: 2000 });
    expect(setToken).toHaveBeenCalledWith('jwt_token', 'token-novo');
    expect(resetToLogin).not.toHaveBeenCalled();
    expect(clearLocalSession).not.toHaveBeenCalled();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [refreshUrl, refreshOptions] = fetchMock.mock.calls[1];
    expect(refreshUrl).toBe('http://test.local/api/auth/refresh');
    expect(refreshOptions.headers.Authorization).toBe('Bearer refresh-valido');
  });

  test('refresh falha (refresh token expirado/inválido): força logout e lança ApiError', async () => {
    getToken.mockImplementation((key) => {
      if (key === 'jwt_token') return Promise.resolve('token-expirado');
      if (key === 'refresh_token') return Promise.resolve('refresh-tambem-expirado');
      return Promise.resolve(null);
    });
    mockFetchSequence([
      { status: 401, body: { error: 'Token expirado' } },
      { status: 401, body: { error: 'Refresh token expirado' } },
    ]);

    await expect(getUserGoals()).rejects.toMatchObject({ status: 401 });

    expect(clearLocalSession).toHaveBeenCalledTimes(1);
    expect(resetToLogin).toHaveBeenCalledTimes(1);
  });

  test('sem refresh token salvo: força logout direto, sem tentar /auth/refresh', async () => {
    getToken.mockImplementation((key) => {
      if (key === 'jwt_token') return Promise.resolve('token-expirado');
      if (key === 'refresh_token') return Promise.resolve(null);
      return Promise.resolve(null);
    });
    const fetchMock = mockFetchSequence([{ status: 401, body: {} }]);

    await expect(getUserGoals()).rejects.toMatchObject({ status: 401 });

    expect(fetchMock).toHaveBeenCalledTimes(1); // nunca chegou a chamar /auth/refresh
    expect(clearLocalSession).toHaveBeenCalledTimes(1);
    expect(resetToLogin).toHaveBeenCalledTimes(1);
  });

  test('chamada refeita ainda com 401 (token novo rejeitado): força logout sem tentar de novo', async () => {
    getToken.mockImplementation((key) => {
      if (key === 'jwt_token') return Promise.resolve('token-expirado');
      if (key === 'refresh_token') return Promise.resolve('refresh-valido');
      return Promise.resolve(null);
    });
    const fetchMock = mockFetchSequence([
      { status: 401, body: {} }, // chamada original
      { status: 200, body: { token: 'token-novo' } }, // /auth/refresh "funciona"
      { status: 401, body: {} }, // chamada refeita AINDA 401
    ]);

    await expect(getUserGoals()).rejects.toMatchObject({ status: 401 });

    expect(fetchMock).toHaveBeenCalledTimes(3); // não tenta renovar de novo
    expect(resetToLogin).toHaveBeenCalledTimes(1);
  });

  test('duas chamadas que expiram juntas disparam só um refresh e só um logout se falhar', async () => {
    // Reproduz o cenário original: um Promise.all com duas chamadas cujo
    // access token expira ao mesmo tempo. Sem dedup, cada uma dispararia
    // sua própria renovação e, se falhasse, seu próprio logout — duas
    // navegações de reset ao mesmo tempo.
    getToken.mockImplementation((key) => {
      if (key === 'jwt_token') return Promise.resolve('token-expirado');
      if (key === 'refresh_token') return Promise.resolve('refresh-tambem-expirado');
      return Promise.resolve(null);
    });
    // As duas chamadas originais E a chamada de /auth/refresh devolvem 401 —
    // como todas as respostas configuradas são iguais, o teste não depende
    // da ordem exata de interleaving entre as duas chamadas concorrentes.
    mockFetchOnce({ status: 401, body: {} });

    const results = await Promise.allSettled([getUserGoals(), getTodaySummary('2026-07-27')]);

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
    expect(clearLocalSession).toHaveBeenCalledTimes(1);
    expect(resetToLogin).toHaveBeenCalledTimes(1);
  });
});

describe('funções de listagem paginadas (backend agora devolve {items, page, ...})', () => {
  // O backend passou a paginar essas 4 listagens (antes devolviam a tabela
  // inteira do usuário sempre) — as funções abaixo pedem o teto máximo por
  // página e desembrulham `items`, pra manter o comportamento de "mostra
  // tudo" que as telas já têm, sem precisar mexer em cada tela agora.
  beforeEach(() => {
    getToken.mockResolvedValue(null);
  });

  test('getFavorites pede per_page=100 e desembrulha items', async () => {
    const fetchMock = mockFetchOnce({
      body: { items: [{ id: 1 }, { id: 2 }], page: 1, per_page: 100, total: 2, has_more: false },
    });

    const result = await getFavorites();

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://test.local/api/meals/favorites?per_page=100');
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
  });

  test('getWeightHistory pede per_page=100 e desembrulha items', async () => {
    const fetchMock = mockFetchOnce({
      body: { items: [{ id: 1, weight: 80 }], page: 1, per_page: 100, total: 1, has_more: false },
    });

    const result = await getWeightHistory();

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://test.local/api/user/weight?per_page=100');
    expect(result).toEqual([{ id: 1, weight: 80 }]);
  });

  test('listWorkouts pede per_page=100 e desembrulha items', async () => {
    const fetchMock = mockFetchOnce({
      body: { items: [{ id: 1 }], page: 1, per_page: 100, total: 1, has_more: false },
    });

    const result = await listWorkouts();

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://test.local/api/workouts?per_page=100');
    expect(result).toEqual([{ id: 1 }]);
  });

  test('listExercises inclui per_page=100 junto com search/muscle_group e desembrulha items', async () => {
    const fetchMock = mockFetchOnce({
      body: { items: [{ id: 1, name: 'Supino' }], page: 1, per_page: 100, total: 1, has_more: false },
    });

    const result = await listExercises('supino', 'peito');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://test.local/api/workouts/exercises?per_page=100&search=supino&muscle_group=peito');
    expect(result).toEqual([{ id: 1, name: 'Supino' }]);
  });

  test('sem `items` na resposta (ex: backend antigo durante deploy), devolve o corpo como veio', async () => {
    mockFetchOnce({ body: [{ id: 1 }] });

    const result = await getFavorites();

    expect(result).toEqual([{ id: 1 }]);
  });
});
