/**
 * Regressão: logout (forçado por 401, ou o botão "Sair") só limpava os
 * tokens — o nome do usuário anterior (user_data) e o insight de IA em
 * cache (DAILY_INSIGHT_CACHE_KEY) continuavam visíveis na tela até a
 * próxima chamada sobrescrever. clearLocalSession() precisa limpar TUDO
 * que é específico do usuário, não só a autenticação.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  removeItem: jest.fn(),
}));

jest.mock('./secureTokenStorage', () => ({
  removeToken: jest.fn(),
}));

const AsyncStorage = require('@react-native-async-storage/async-storage');
const { removeToken } = require('./secureTokenStorage');
const { clearLocalSession, DAILY_INSIGHT_CACHE_KEY } = require('./session');

describe('clearLocalSession', () => {
  beforeEach(() => {
    AsyncStorage.removeItem.mockReset();
    removeToken.mockReset();
  });

  test('remove os dois tokens de autenticação', async () => {
    await clearLocalSession();

    expect(removeToken).toHaveBeenCalledWith('jwt_token');
    expect(removeToken).toHaveBeenCalledWith('refresh_token');
  });

  test('remove os dados do usuário anterior (nome/email exibidos na tela)', async () => {
    await clearLocalSession();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('user_data');
  });

  test('remove o insight de IA em cache', async () => {
    await clearLocalSession();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(DAILY_INSIGHT_CACHE_KEY);
  });
});
