import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BackButton from '../components/BackButton';
import { useAppAlert } from '../components/AppAlertProvider';
import { colors } from '../theme/colors';
import { requestNotificationPermission, scheduleDailyReminder, cancelReminder } from '../services/notifications';
import { REMINDERS_SETTINGS_KEY } from '../services/session';

// Horários fixos (sem seletor customizável — fora do escopo de "baixo
// esforço" desta versão), mas guardados como hour/minute pra permitir um
// picker no futuro sem precisar mudar o formato dos dados salvos.
const REMINDER_DEFS = [
  { type: 'meal', icon: 'restaurant', label: 'Registrar refeição', hour: 12, minute: 0, title: 'Hora de registrar sua refeição', body: 'Não esqueça de registrar o que você comeu hoje no Perfora.' },
  { type: 'water', icon: 'water', label: 'Beber água', hour: 15, minute: 0, title: 'Hora de se hidratar', body: 'Que tal um copo d\'água agora?' },
  { type: 'workout', icon: 'barbell', label: 'Treinar', hour: 18, minute: 0, title: 'Hora do treino', body: 'Seu treino de hoje está te esperando.' },
];

const DEFAULT_SETTINGS = REMINDER_DEFS.reduce((acc, { type, hour, minute }) => {
  acc[type] = { enabled: false, hour, minute };
  return acc;
}, {});

export default function RemindersScreen() {
  const showAlert = useAppAlert();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const saved = await AsyncStorage.getItem(REMINDERS_SETTINGS_KEY);
        if (saved) {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
        }
      } catch {
        // Sem configuração salva legível, os lembretes continuam desligados (padrão seguro).
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const persist = async (nextSettings) => {
    setSettings(nextSettings);
    try {
      await AsyncStorage.setItem(REMINDERS_SETTINGS_KEY, JSON.stringify(nextSettings));
    } catch {
      // A troca do toggle na tela já refletiu — persistência é best-effort.
    }
  };

  const handleToggle = async (def, nextEnabled) => {
    if (nextEnabled) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        showAlert(
          'Permissão negada',
          'Ative as notificações do Perfora nas configurações do aparelho para receber lembretes.'
        );
        return;
      }
      await scheduleDailyReminder(def.type, def.hour, def.minute, { title: def.title, body: def.body });
    } else {
      await cancelReminder(def.type);
    }
    await persist({
      ...settings,
      [def.type]: { ...settings[def.type], enabled: nextEnabled },
    });
  };

  if (loading) {
    return <View style={styles.center} />;
  }

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top + 20 }]}>
      <View style={styles.headerRow}>
        <BackButton />
        <Text style={styles.headerTitle}>Lembretes</Text>
      </View>

      <Text style={styles.subtitle}>
        Notificações locais no seu horário de costume — não precisa de internet pra disparar.
      </Text>

      {REMINDER_DEFS.map((def) => (
        <View key={def.type} style={styles.row}>
          <View style={styles.rowIcon}>
            <Ionicons name={def.icon} size={22} color={colors.primary} />
          </View>
          <View style={styles.rowTextContainer}>
            <Text style={styles.rowLabel}>{def.label}</Text>
            <Text style={styles.rowTime}>{String(def.hour).padStart(2, '0')}:{String(def.minute).padStart(2, '0')}</Text>
          </View>
          <Switch
            value={settings[def.type]?.enabled || false}
            onValueChange={(value) => handleToggle(def, value)}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.white}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 60 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  headerTitle: { flex: 1, color: colors.white, fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  subtitle: { color: colors.textSecondary, fontSize: 14, marginBottom: 25, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, padding: 18, marginBottom: 15 },
  rowIcon: { width: 40, alignItems: 'center' },
  rowTextContainer: { flex: 1, marginLeft: 10 },
  rowLabel: { color: colors.white, fontSize: 16, fontWeight: '600' },
  rowTime: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
});
