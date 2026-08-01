import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import BackButton from '../components/BackButton';
import ExpandableSplitCard from '../components/ExpandableSplitCard';
import { useAppAlert } from '../components/AppAlertProvider';
import { listSplits, createWorkout } from '../services/api';
import { useTheme } from '../theme/ThemeContext';
import { registerNamespace } from '../i18n';
import { ROUTES } from '../navigation/routes';

import pt from '../i18n/locales/pt/chooseSplit.json';
import en from '../i18n/locales/en/chooseSplit.json';
import es from '../i18n/locales/es/chooseSplit.json';

registerNamespace('chooseSplit', { pt, en, es });

export default function ChooseSplitScreen({ navigation }) {
  const showAlert = useAppAlert();
  // paddingTop: 60 fixo não respeitava notch/gesture nav — insets.top é 0 em
  // aparelhos sem notch (mantém o valor de hoje) e cresce sozinho nos que têm.
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useTranslation(['chooseSplit', 'common']);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [splits, setSplits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedSplitId, setExpandedSplitId] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const fetchSplits = async () => {
      try {
        const data = await listSplits();
        setSplits(data);
      } catch {
        showAlert(t('alerts.loadErrorTitle'), t('alerts.loadErrorMessage'));
      } finally {
        setLoading(false);
      }
    };
    fetchSplits();
  }, [showAlert, t]);

  const toggleSplit = (splitId) => {
    setExpandedSplitId((current) => (current === splitId ? null : splitId));
  };

  const handleStart = useCallback(async (workoutData) => {
    setCreating(true);
    try {
      const workout = await createWorkout(workoutData);
      navigation.replace(ROUTES.WORKOUT_SESSION, { workoutId: workout.id });
    } catch {
      showAlert(t('alerts.startErrorTitle'), t('alerts.startErrorMessage'));
    } finally {
      setCreating(false);
    }
  }, [navigation, showAlert, t]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
      <View style={styles.headerRow}>
        <BackButton />
        <Text style={styles.headerTitle}>{t('title')}</Text>
      </View>

      <TouchableOpacity
        style={styles.freestyleCard}
        onPress={() => handleStart({})}
        disabled={creating}
      >
        <Ionicons name="shuffle" size={24} color={colors.onPrimary} style={{ marginRight: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.freestyleTitle}>{t('freestyleTitle')}</Text>
          <Text style={styles.freestyleSubtitle}>{t('freestyleSubtitle')}</Text>
        </View>
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>{t('sectionLabel')}</Text>

      <FlatList
        data={splits}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <ExpandableSplitCard
            split={item}
            expanded={expandedSplitId === item.id}
            onToggle={() => toggleSplit(item.id)}
          >
            {item.days.map((day) => (
              <TouchableOpacity
                key={day.id}
                style={styles.dayRow}
                onPress={() => handleStart({ split_day_id: day.id, name: day.name })}
                disabled={creating}
              >
                <Text style={styles.dayName}>{day.name}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.primary} />
              </TouchableOpacity>
            ))}
          </ExpandableSplitCard>
        )}
        contentContainerStyle={{ paddingBottom: 40 }}
      />

      {creating && (
        <View style={styles.creatingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  headerTitle: { flex: 1, color: colors.white, fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  freestyleCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, borderRadius: 12, padding: 16, marginBottom: 25 },
  freestyleTitle: { color: colors.onPrimary, fontSize: 16, fontWeight: 'bold' },
  freestyleSubtitle: { color: colors.onPrimary, fontSize: 12, marginTop: 2, opacity: 0.8 },
  sectionLabel: { color: colors.textSecondary, fontSize: 14, marginBottom: 12 },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: colors.surfaceAlt },
  dayName: { color: colors.white, fontSize: 15 },
  creatingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
});
