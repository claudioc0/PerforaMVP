/**
 * expo-notifications é módulo nativo — mockado aqui no limite do pacote
 * (jest.config.js não tem o preset jest-expo de propósito, ver comentário lá).
 * O que importa testar é a lógica própria deste serviço: identificador
 * determinístico por tipo (permite cancelar sem persistir um id extra),
 * cancelar antes de reagendar (evita duplicar), e nunca lançar (degrada
 * pra `false`/best-effort em qualquer falha nativa).
 */
const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockScheduleNotificationAsync = jest.fn();
const mockCancelScheduledNotificationAsync = jest.fn();

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args) => mockRequestPermissionsAsync(...args),
  scheduleNotificationAsync: (...args) => mockScheduleNotificationAsync(...args),
  cancelScheduledNotificationAsync: (...args) => mockCancelScheduledNotificationAsync(...args),
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
}));

const {
  requestNotificationPermission,
  scheduleDailyReminder,
  cancelReminder,
  cancelAllReminders,
} = require('./notifications');

beforeEach(() => {
  mockGetPermissionsAsync.mockReset();
  mockRequestPermissionsAsync.mockReset();
  mockScheduleNotificationAsync.mockReset();
  mockCancelScheduledNotificationAsync.mockReset();
});

describe('requestNotificationPermission', () => {
  test('já concedida: não pede de novo, devolve true', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: true });

    const result = await requestNotificationPermission();

    expect(result).toBe(true);
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });

  test('não concedida: pede e devolve o resultado do pedido', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: false });
    mockRequestPermissionsAsync.mockResolvedValue({ granted: true });

    const result = await requestNotificationPermission();

    expect(result).toBe(true);
    expect(mockRequestPermissionsAsync).toHaveBeenCalled();
  });

  test('falha nativa não lança — degrada pra false', async () => {
    mockGetPermissionsAsync.mockRejectedValue(new Error('native module unavailable'));

    await expect(requestNotificationPermission()).resolves.toBe(false);
  });
});

describe('scheduleDailyReminder', () => {
  test('cancela o identificador anterior antes de agendar de novo (evita duplicar)', async () => {
    mockCancelScheduledNotificationAsync.mockResolvedValue();
    mockScheduleNotificationAsync.mockResolvedValue('some-id');

    await scheduleDailyReminder('meal', 12, 30, { title: 'Oi', body: 'Refeição' });

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('perfora-reminder-meal');
    const cancelOrder = mockCancelScheduledNotificationAsync.mock.invocationCallOrder[0];
    const scheduleOrder = mockScheduleNotificationAsync.mock.invocationCallOrder[0];
    expect(cancelOrder).toBeLessThan(scheduleOrder);
  });

  test('usa identificador determinístico por tipo e o trigger diário no hour/minute pedido', async () => {
    mockCancelScheduledNotificationAsync.mockResolvedValue();
    mockScheduleNotificationAsync.mockResolvedValue('some-id');

    await scheduleDailyReminder('water', 15, 0, { title: 'Água', body: 'Beba água' });

    expect(mockScheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: 'perfora-reminder-water',
      content: { title: 'Água', body: 'Beba água' },
      trigger: { type: 'daily', hour: 15, minute: 0 },
    });
  });

  test('falha nativa não lança — devolve false', async () => {
    mockCancelScheduledNotificationAsync.mockResolvedValue();
    mockScheduleNotificationAsync.mockRejectedValue(new Error('native module unavailable'));

    await expect(scheduleDailyReminder('workout', 18, 0, {})).resolves.toBe(false);
  });
});

describe('cancelReminder / cancelAllReminders', () => {
  test('cancelReminder usa o identificador certo pro tipo', async () => {
    mockCancelScheduledNotificationAsync.mockResolvedValue();

    await cancelReminder('workout');

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('perfora-reminder-workout');
  });

  test('cancelReminder nunca lança, mesmo se já não havia nada agendado', async () => {
    mockCancelScheduledNotificationAsync.mockRejectedValue(new Error('not found'));

    await expect(cancelReminder('meal')).resolves.toBeUndefined();
  });

  test('cancelAllReminders cancela os 3 tipos', async () => {
    mockCancelScheduledNotificationAsync.mockResolvedValue();

    await cancelAllReminders();

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('perfora-reminder-meal');
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('perfora-reminder-water');
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('perfora-reminder-workout');
  });
});
