/**
 * Armazenamento dedicado para os tokens de autenticação (JWT de acesso e
 * refresh token). Usa expo-secure-store — Keychain no iOS, Keystore
 * criptografado no Android — em vez de AsyncStorage: AsyncStorage grava em
 * texto plano num arquivo comum do sandbox do app, legível diretamente num
 * aparelho com root ou lendo o conteúdo de um backup do app.
 *
 * Só os dois tokens de autenticação passam por aqui — dados não sensíveis
 * (ex: cache de insight, preferência de descanso) continuam em AsyncStorage,
 * que é mais rápido e não tem o limite de tamanho do SecureStore.
 */
import * as SecureStore from 'expo-secure-store';

export async function getToken(key) {
  return SecureStore.getItemAsync(key);
}

export async function setToken(key, value) {
  return SecureStore.setItemAsync(key, value);
}

export async function removeToken(key) {
  return SecureStore.deleteItemAsync(key);
}
