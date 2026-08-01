import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import BackButton from '../components/BackButton';
import ExpandableSplitCard from '../components/ExpandableSplitCard';
import { useAppAlert } from '../components/AppAlertProvider';
import { listSplits, createWeeklyPlan } from '../services/api';
import { useTheme } from '../theme/ThemeContext';

export default function WeeklyPlanSetupScreen({ navigation }) {
  const showAlert = useAppAlert();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [splits, setSplits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedSplitId, setExpandedSplitId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Quantos dias por semana treinar e qual treino cai em cada um deles
  // (a partir de Segunda). Só existem enquanto uma divisão está expandida.
  const [trainingDaysCount, setTrainingDaysCount] = useState(0);
  const [slotAssignments, setSlotAssignments] = useState([]);

  useEffect(() => {
    const fetchSplits = async () => {
      try {
        const data = await listSplits();
        setSplits(data);
      } catch {
        showAlert('Erro', 'Não foi possível carregar as divisões de treino.');
      } finally {
        setLoading(false);
      }
    };
    fetchSplits();
  }, [showAlert]);

  const toggleSplit = (split) => {
    if (expandedSplitId === split.id) {
      setExpandedSplitId(null);
      return;
    }
    setExpandedSplitId(split.id);
    setTrainingDaysCount(split.days.length);
    setSlotAssignments(split.days.map((d) => d.id));
  };

  const adjustTrainingDays = (split, delta) => {
    const next = Math.min(7, Math.max(1, trainingDaysCount + delta));
    if (next === trainingDaysCount) return;

    const nextSlots = [];
    for (let i = 0; i < next; i++) {
      nextSlots.push(i < slotAssignments.length ? slotAssignments[i] : split.days[i % split.days.length].id);
    }
    setTrainingDaysCount(next);
    setSlotAssignments(nextSlots);
  };

  const openSlotPicker = (split, index) => {
    const options = split.days.map((d) => ({
      text: d.name,
      onPress: () => {
        setSlotAssignments((prev) => {
          const next = [...prev];
          next[index] = d.id;
          return next;
        });
      },
    }));
    options.push({ text: 'Cancelar', style: 'cancel' });
    showAlert(`Dia ${index + 1}`, 'Qual treino cai nesse dia?', options);
  };

  const handleUseSplit = useCallback(async (split, splitDayIds) => {
    setSaving(true);
    try {
      await createWeeklyPlan(split.id, splitDayIds);
      navigation.goBack();
    } catch {
      showAlert('Erro', 'Não foi possível definir o plano semanal.');
    } finally {
      setSaving(false);
    }
  }, [navigation, showAlert]);

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
        <Text style={styles.headerTitle}>Plano Semanal</Text>
      </View>
      <Text style={styles.sectionLabel}>
        Escolha uma divisão. Por padrão, cada treino ocupa um dia a partir de Segunda e o resto vira
        descanso — mas você pode ajustar quantos dias treina por semana e repetir os treinos que quiser.
      </Text>

      <FlatList
        data={splits}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => {
          const isExpanded = expandedSplitId === item.id;
          const isDefault = trainingDaysCount === item.days.length;

          return (
            <ExpandableSplitCard
              split={item}
              expanded={isExpanded}
              onToggle={() => toggleSplit(item)}
              contentStyle={styles.daysContainer}
            >
              <View style={styles.stepperRow}>
                <Text style={styles.stepperLabel}>Dias de treino por semana</Text>
                <View style={styles.stepperControls}>
                  <TouchableOpacity
                    onPress={() => adjustTrainingDays(item, -1)}
                    accessibilityRole="button"
                    accessibilityLabel="Diminuir dias de treino por semana"
                  >
                    <Ionicons name="remove-circle-outline" size={22} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <Text style={styles.stepperValue}>{trainingDaysCount}</Text>
                  <TouchableOpacity
                    onPress={() => adjustTrainingDays(item, 1)}
                    accessibilityRole="button"
                    accessibilityLabel="Aumentar dias de treino por semana"
                  >
                    <Ionicons name="add-circle-outline" size={22} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.slotsHint}>
                {isDefault
                  ? 'Padrão: um treino de cada, na ordem da divisão.'
                  : 'Toque num dia pra escolher qual treino repetir nele.'}
              </Text>

              {slotAssignments.map((splitDayId, index) => {
                const day = item.days.find((d) => d.id === splitDayId);
                return (
                  <TouchableOpacity key={index} style={styles.slotRow} onPress={() => openSlotPicker(item, index)}>
                    <Text style={styles.slotLabel}>Dia {index + 1}</Text>
                    <View style={styles.slotValueRow}>
                      <Text style={styles.slotValue}>{day ? day.name : '—'}</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                    </View>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={styles.useSplitButton}
                onPress={() => handleUseSplit(item, slotAssignments)}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.useSplitText}>Usar esta divisão</Text>}
              </TouchableOpacity>
            </ExpandableSplitCard>
          );
        }}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  headerTitle: { flex: 1, color: colors.white, fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  sectionLabel: { color: colors.textSecondary, fontSize: 13, marginBottom: 18, lineHeight: 18 },
  daysContainer: { padding: 16 },
  stepperRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  stepperLabel: { color: colors.white, fontSize: 14, fontWeight: '600' },
  stepperControls: { flexDirection: 'row', alignItems: 'center' },
  stepperValue: { color: colors.primary, fontSize: 16, fontWeight: 'bold', marginHorizontal: 10, minWidth: 20, textAlign: 'center' },
  slotsHint: { color: colors.textSecondary, fontSize: 12, marginBottom: 10 },
  slotRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.surfaceAlt },
  slotLabel: { color: colors.textSecondary, fontSize: 13 },
  slotValueRow: { flexDirection: 'row', alignItems: 'center' },
  slotValue: { color: colors.white, fontSize: 14, fontWeight: '600', marginRight: 6 },
  useSplitButton: { backgroundColor: colors.primary, padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 14 },
  useSplitText: { color: colors.onPrimary, fontSize: 15, fontWeight: 'bold' },
});
