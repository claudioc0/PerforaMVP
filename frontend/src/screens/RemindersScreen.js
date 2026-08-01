import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import BackButton from '../components/BackButton';
import { useAppAlert } from '../components/AppAlertProvider';
import { useTheme } from '../theme/ThemeContext';
import { registerNamespace } from '../i18n';
import { requestNotificationPermission, scheduleDailyReminder, cancelReminder } from '../services/notifications';
import { REMINDERS_SETTINGS_KEY } from '../services/session';

import pt from '../i18n/locales/pt/reminders.json';
import en from '../i18n/locales/en/reminders.json';
import es from '../i18n/locales/es/reminders.json';

registerNamespace('reminders', { pt, en, es });

// Horários de fábrica — usados só na primeira vez (nada salvo em
// AsyncStorage ainda) e como conteúdo fixo da notificação (título/corpo).
// hour/minute daqui em diante moram em `settings[type]`, a fonte de
// verdade real, editável pelo usuário via o seletor de horário.
const REMINDER_DEFS = [
  { type: 'meal', icon: 'restaurant', hour: 12, minute: 0 },
  { type: 'water', icon: 'water', hour: 15, minute: 0 },
  { type: 'workout', icon: 'barbell', hour: 18, minute: 0 },
];

const DEFAULT_SETTINGS = REMINDER_DEFS.reduce((acc, { type, hour, minute }) => {
  acc[type] = { enabled: false, hour, minute };
  return acc;
}, {});

export default function RemindersScreen() {
  const showAlert = useAppAlert();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useTranslation('reminders');
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  // type do lembrete com o seletor de horário nativo aberto no momento, ou null.
  const [pickerFor, setPickerFor] = useState(null);

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
      // A troca já refletiu na tela — persistência é best-effort.
    }
  };

  const handleToggle = async (def, nextEnabled) => {
    // Lê o horário JÁ CUSTOMIZADO (settings), não o de fábrica (def) — sem
    // isso, ligar o lembrete sempre reagendava pro horário padrão, ignorando
    // qualquer ajuste feito no seletor.
    const current = settings[def.type];
    if (nextEnabled) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        showAlert(t('permissionDeniedTitle'), t('permissionDeniedMessage'));
        return;
      }
      await scheduleDailyReminder(def.type, current.hour, current.minute, {
        title: t(`types.${def.type}.title`),
        body: t(`types.${def.type}.body`),
      });
    } else {
      await cancelReminder(def.type);
    }
    await persist({
      ...settings,
      [def.type]: { ...current, enabled: nextEnabled },
    });
  };

  const handleTimeChange = async (def, event, selectedDate) => {
    setPickerFor(null);
    if (event.type === 'dismissed' || !selectedDate) return;

    const hour = selectedDate.getHours();
    const minute = selectedDate.getMinutes();
    const current = settings[def.type];
    const nextSettings = { ...settings, [def.type]: { ...current, hour, minute } };

    // Já está ligado: reagenda na hora com o novo horário. Se estiver
    // desligado, só guarda o valor — passa a valer quando o usuário ligar.
    if (current.enabled) {
      await scheduleDailyReminder(def.type, hour, minute, {
        title: t(`types.${def.type}.title`),
        body: t(`types.${def.type}.body`),
      });
    }
    await persist(nextSettings);
  };

  if (loading) {
    return <View style={styles.center} />;
  }

  const pickerDef = REMINDER_DEFS.find((def) => def.type === pickerFor);

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top + 20 }]}>
      <View style={styles.headerRow}>
        <BackButton />
        <Text style={styles.headerTitle}>{t('title')}</Text>
      </View>

      <Text style={styles.subtitle}>{t('subtitle')}</Text>

      {REMINDER_DEFS.map((def) => (
        <View key={def.type} style={styles.row}>
          <View style={styles.rowIcon}>
            <Ionicons name={def.icon} size={22} color={colors.primary} />
          </View>
          <View style={styles.rowTextContainer}>
            <Text style={styles.rowLabel}>{t(`types.${def.type}.label`)}</Text>
            <TouchableOpacity
              onPress={() => setPickerFor(def.type)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('editTimeHint')}
            >
              <Text style={styles.rowTime}>
                {String(settings[def.type].hour).padStart(2, '0')}:{String(settings[def.type].minute).padStart(2, '0')}
                {'  '}
                <Ionicons name="pencil" size={12} color={colors.textSecondary} />
              </Text>
            </TouchableOpacity>
          </View>
          <Switch
            value={settings[def.type]?.enabled || false}
            onValueChange={(value) => handleToggle(def, value)}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.white}
          />
        </View>
      ))}

      {pickerDef && (
        <DateTimePicker
          value={new Date(2000, 0, 1, settings[pickerDef.type].hour, settings[pickerDef.type].minute)}
          mode="time"
          is24Hour
          // Android sempre abre como diálogo nativo próprio, mesmo com
          // display="default" — só precisa desmontar depois do evento
          // (feito em handleTimeChange). iOS ficaria inline sem isso, mas
          // o app ainda não builda pra iOS nesta rodada.
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, selectedDate) => handleTimeChange(pickerDef, event, selectedDate)}
        />
      )}
    </ScrollView>
  );
}

const createStyles = (colors) => StyleSheet.create({
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
