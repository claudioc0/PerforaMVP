/**
 * Regressão: o JWT (e o refresh token) precisam passar pelo SecureStore
 * (Keychain/Keystore criptografado), não pelo AsyncStorage (texto plano,
 * legível num aparelho com root ou lendo o backup do app). Este teste trava
 * que o wrapper realmente delega pro SecureStore, não silenciosamente pra
 * outra coisa.
 */
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const SecureStore = require('expo-secure-store');
const { getToken, setToken, removeToken } = require('./secureTokenStorage');

describe('secureTokenStorage', () => {
  beforeEach(() => {
    SecureStore.getItemAsync.mockReset();
    SecureStore.setItemAsync.mockReset();
    SecureStore.deleteItemAsync.mockReset();
  });

  test('getToken delega para SecureStore.getItemAsync e devolve o valor', async () => {
    SecureStore.getItemAsync.mockResolvedValue('valor-salvo');

    const result = await getToken('jwt_token');

    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('jwt_token');
    expect(result).toBe('valor-salvo');
  });

  test('setToken delega para SecureStore.setItemAsync', async () => {
    await setToken('jwt_token', 'novo-valor');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('jwt_token', 'novo-valor');
  });

  test('removeToken delega para SecureStore.deleteItemAsync', async () => {
    await removeToken('jwt_token');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('jwt_token');
  });
});
