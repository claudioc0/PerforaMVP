import AsyncStorage from '@react-native-async-storage/async-storage';
import { removeToken } from './secureTokenStorage';
import { cancelAllReminders } from './notifications';

// Mesma chave usada por DashboardScreen.js pro cache do insight diário —
// centralizada aqui porque também precisa ser limpa no logout, independente
// de qual tela a criou.
export const DAILY_INSIGHT_CACHE_KEY = '@perfora_daily_insight';

// Mesma ideia pra config de lembretes (RemindersScreen.js) — outro usuário
// logando no mesmo aparelho não deveria herdar os lembretes do anterior.
export const REMINDERS_SETTINGS_KEY = '@perfora_reminders_settings';

/**
 * Limpa TUDO que é específico do usuário que estava logado, não só os
 * tokens de autenticação. Sem isso, o nome do usuário anterior (user_data)
 * e o insight de IA em cache continuavam visíveis na tela até a próxima
 * chamada sobrescrever — mesmo depois de um logout (forçado por sessão
 * expirada, ou pelo botão "Sair").
 */
export async function clearLocalSession() {
  await Promise.all([
    removeToken('jwt_token'),
    removeToken('refresh_token'),
    AsyncStorage.removeItem('user_data'),
    AsyncStorage.removeItem(DAILY_INSIGHT_CACHE_KEY),
    AsyncStorage.removeItem(REMINDERS_SETTINGS_KEY),
    cancelAllReminders(),
  ]);
}
