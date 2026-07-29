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

// expo-notifications é módulo nativo — sem o preset jest-expo (deliberadamente
// ausente, ver jest.config.js), importá-lo direto quebra o Jest. Mockado no
// limite do serviço, igual secureTokenStorage/AsyncStorage acima.
jest.mock('./notifications', () => ({
  cancelAllReminders: jest.fn(),
}));

const AsyncStorage = require('@react-native-async-storage/async-storage');
const { removeToken } = require('./secureTokenStorage');
const { cancelAllReminders } = require('./notifications');
const { clearLocalSession, DAILY_INSIGHT_CACHE_KEY, REMINDERS_SETTINGS_KEY } = require('./session');

describe('clearLocalSession', () => {
  beforeEach(() => {
    AsyncStorage.removeItem.mockReset();
    removeToken.mockReset();
    cancelAllReminders.mockReset();
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

  test('remove a configuração de lembretes e cancela os agendados — outro usuário no mesmo aparelho não deveria herdar os lembretes do anterior', async () => {
    await clearLocalSession();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(REMINDERS_SETTINGS_KEY);
    expect(cancelAllReminders).toHaveBeenCalled();
  });
});
