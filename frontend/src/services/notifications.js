import * as Notifications from 'expo-notifications';

// Identificador determinístico por tipo (não um id aleatório) — permite
// cancelar um lembrete específico diretamente, sem precisar persistir um
// id-por-tipo só pra isso.
const REMINDER_IDENTIFIERS = {
  meal: 'perfora-reminder-meal',
  water: 'perfora-reminder-water',
  workout: 'perfora-reminder-workout',
};

const REMINDER_TYPES = Object.keys(REMINDER_IDENTIFIERS);

const REST_TIMER_IDENTIFIER = 'perfora-rest-timer';

/** Nunca lança — degrada pra `false` em qualquer falha (permissão é um "nice
 * to have", uma falha aqui não deveria derrubar a tela de lembretes. */
export async function requestNotificationPermission() {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

export async function scheduleDailyReminder(type, hour, minute, content) {
  try {
    // Cancela o anterior antes de agendar de novo — evita duplicar se o
    // usuário desligar/ligar o mesmo lembrete várias vezes.
    await Notifications.cancelScheduledNotificationAsync(REMINDER_IDENTIFIERS[type]);
    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_IDENTIFIERS[type],
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelReminder(type) {
  try {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_IDENTIFIERS[type]);
  } catch {
    // Best-effort — se já não existia agendado, não há nada a desfazer.
  }
}

export async function cancelAllReminders() {
  await Promise.all(REMINDER_TYPES.map(cancelReminder));
}

/** Agenda um disparo único pro fim do descanso, usado quando o app vai pro
 * background com o timer rodando (o setInterval em JS é suspenso pelo SO
 * nesse estado, então sem isso o usuário nunca saberia que a meta bateu). */
export async function scheduleRestTimerNotification(remainingSeconds) {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return false;

    await Notifications.cancelScheduledNotificationAsync(REST_TIMER_IDENTIFIER);
    await Notifications.scheduleNotificationAsync({
      identifier: REST_TIMER_IDENTIFIER,
      content: { title: 'Descanso finalizado! 💪', body: 'Hora da próxima série.' },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: remainingSeconds,
        repeats: false,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelRestTimerNotification() {
  try {
    await Notifications.cancelScheduledNotificationAsync(REST_TIMER_IDENTIFIER);
  } catch {
    // Best-effort — se já não existia agendado, não há nada a desfazer.
  }
}
