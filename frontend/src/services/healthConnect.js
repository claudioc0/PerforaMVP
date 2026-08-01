import {
  initialize,
  getSdkStatus,
  requestPermission,
  getGrantedPermissions,
  aggregateRecord,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

const REQUIRED_PERMISSIONS = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'HeartRate' },
];

// initialize() precisa rodar antes de qualquer outra chamada do SDK, mas só
// uma vez por sessão do app — cacheado aqui pra não reinicializar a cada tela.
let initialized = false;

async function ensureInitialized() {
  if (initialized) return true;
  try {
    initialized = await initialize();
    return initialized;
  } catch {
    return false;
  }
}

function hasAllRequiredPermissions(granted) {
  return REQUIRED_PERMISSIONS.every((required) =>
    granted.some((g) => g.recordType === required.recordType && g.accessType === required.accessType)
  );
}

/** Nunca lança — degrada pra `false` em qualquer falha (dispositivo sem
 * Health Connect instalado, SDK indisponível, etc). */
export async function isHealthConnectAvailable() {
  try {
    const status = await getSdkStatus();
    return status === SdkAvailabilityStatus.SDK_AVAILABLE;
  } catch {
    return false;
  }
}

/** Reflete o estado real de permissão do SO em vez de uma flag local — se o
 * usuário revogar o acesso nas configurações, o card volta a pedir conexão
 * sem precisar de nenhuma sincronização extra. */
export async function hasHealthPermissions() {
  try {
    if (!(await ensureInitialized())) return false;
    const granted = await getGrantedPermissions();
    return hasAllRequiredPermissions(granted);
  } catch {
    return false;
  }
}

export async function requestHealthPermissions() {
  try {
    if (!(await ensureInitialized())) return false;
    const granted = await requestPermission(REQUIRED_PERMISSIONS);
    return hasAllRequiredPermissions(granted);
  } catch {
    return false;
  }
}

function dayBoundsIso(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

/** Passos/calorias ativas/FC média do dia informado (hoje ou qualquer dia
 * passado — o Health Connect já guarda o histórico, então não há por que
 * limitar essa consulta a "hoje"). Cada campo é buscado e degradado de forma
 * independente pra `null` — negar uma permissão específica (ex: FC) não deve
 * zerar os outros campos que o usuário concedeu. */
export async function getActivityForDate(date) {
  const timeRangeFilter = { operator: 'between', ...dayBoundsIso(date) };
  const activity = { steps: null, activeCalories: null, avgHeartRateBpm: null };

  try {
    const steps = await aggregateRecord({ recordType: 'Steps', timeRangeFilter });
    activity.steps = steps?.COUNT_TOTAL ?? null;
  } catch {
    // sem dado disponível pra esse campo — mantém null
  }

  try {
    const calories = await aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter });
    activity.activeCalories = calories?.ACTIVE_CALORIES_TOTAL?.inKilocalories ?? null;
  } catch {
    // sem dado disponível pra esse campo — mantém null
  }

  try {
    const heartRate = await aggregateRecord({ recordType: 'HeartRate', timeRangeFilter });
    activity.avgHeartRateBpm = heartRate?.BPM_AVG ?? null;
  } catch {
    // sem dado disponível pra esse campo — mantém null
  }

  return activity;
}
