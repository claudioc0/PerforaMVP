import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import BackButton from '../components/BackButton';
import { useAppAlert } from '../components/AppAlertProvider';
import {
  listWorkouts,
  createWorkout,
  getWeeklyPlan,
  getSplitDayExercises,
  updateWeeklyPlanDay,
  deleteWeeklyPlan,
} from '../services/api';
import { formatShortDate } from '../utils/formatDate';

// JS: 0=Domingo...6=Sábado. Plano: 0=Segunda...6=Domingo.
function todayPlanIndex() {
  return (new Date().getDay() + 6) % 7;
}

export default function WorkoutHistoryScreen({ navigation }) {
  const showAlert = useAppAlert();
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [weeklyPlan, setWeeklyPlan] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [expandedDay, setExpandedDay] = useState(null);
  const [dayExercises, setDayExercises] = useState({});
  const [loadingDayExercises, setLoadingDayExercises] = useState(false);
  const [startingDay, setStartingDay] = useState(false);

  // Antes, uma falha aqui só mostrava um Alert e deixava `workouts` vazio —
  // indistinguível de "usuário sem treinos ainda", e sem jeito de tentar de
  // novo sem sair e voltar pra tela.
  const [workoutsError, setWorkoutsError] = useState(false);

  const fetchWorkouts = useCallback(async () => {
    setWorkoutsError(false);
    try {
      const data = await listWorkouts();
      setWorkouts(data);
    } catch (error) {
      setWorkoutsError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWeeklyPlan = useCallback(async () => {
    try {
      const data = await getWeeklyPlan();
      setWeeklyPlan(data);
    } catch (error) {
      // Plano semanal é um complemento — sem ele, o fluxo de treino avulso continua funcionando.
    } finally {
      setLoadingPlan(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchWorkouts();
      fetchWeeklyPlan();
      setExpandedDay(null);
    }, [fetchWorkouts, fetchWeeklyPlan])
  );

  const toggleDay = async (day) => {
    if (expandedDay === day.day_of_week) {
      setExpandedDay(null);
      return;
    }
    setExpandedDay(day.day_of_week);

    if (day.split_day_id && !dayExercises[day.split_day_id]) {
      setLoadingDayExercises(true);
      try {
        const exercises = await getSplitDayExercises(day.split_day_id);
        setDayExercises((prev) => ({ ...prev, [day.split_day_id]: exercises }));
      } catch (error) {
        // Sem a lista de sugestões, o usuário ainda pode iniciar o treino e escolher exercícios na hora.
      } finally {
        setLoadingDayExercises(false);
      }
    }
  };

  const handleStartDay = async (day) => {
    setStartingDay(true);
    try {
      const workout = await createWorkout({ split_day_id: day.split_day_id, name: day.split_day_name });
      navigation.navigate('WorkoutSession', { workoutId: workout.id });
    } catch (error) {
      showAlert('Erro', 'Não foi possível iniciar o treino.');
    } finally {
      setStartingDay(false);
    }
  };

  const handleReassignDay = (day) => {
    const options = weeklyPlan.split_days
      .filter((sd) => sd.id !== day.split_day_id)
      .map((sd) => ({
        text: sd.name,
        onPress: () => saveReassign(day.day_of_week, sd.id),
      }));

    if (day.split_day_id !== null) {
      options.push({ text: 'Descanso', onPress: () => saveReassign(day.day_of_week, null) });
    }
    options.push({ text: 'Cancelar', style: 'cancel' });

    showAlert('Trocar dia', `O que ${day.day_label.toLowerCase()} deve ser?`, options);
  };

  const saveReassign = async (dayOfWeek, splitDayId) => {
    try {
      const updated = await updateWeeklyPlanDay(dayOfWeek, splitDayId);
      setWeeklyPlan(updated);

      if (splitDayId && !dayExercises[splitDayId]) {
        setLoadingDayExercises(true);
        try {
          const exercises = await getSplitDayExercises(splitDayId);
          setDayExercises((prev) => ({ ...prev, [splitDayId]: exercises }));
        } catch (error) {
          // Sem a lista de sugestões, o usuário ainda pode iniciar o treino e escolher exercícios na hora.
        } finally {
          setLoadingDayExercises(false);
        }
      }
    } catch (error) {
      showAlert('Erro', 'Não foi possível atualizar esse dia.');
    }
  };

  const handlePlanOptions = () => {
    showAlert('Plano Semanal', undefined, [
      { text: 'Trocar divisão', onPress: () => navigation.navigate('WeeklyPlanSetup') },
      {
        text: 'Excluir plano',
        style: 'destructive',
        onPress: () => {
          showAlert('Excluir Plano Semanal', 'Tem certeza? Seus treinos já registrados não são afetados.', [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Excluir',
              style: 'destructive',
              onPress: async () => {
                try {
                  await deleteWeeklyPlan();
                  setWeeklyPlan({ has_plan: false });
                  setExpandedDay(null);
                } catch (error) {
                  showAlert('Erro', 'Não foi possível excluir o plano semanal.');
                }
              },
            },
          ]);
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const renderWeeklySection = () => {
    if (loadingPlan) {
      return (
        <View style={styles.weeklySection}>
          <ActivityIndicator color="#00FF66" />
        </View>
      );
    }

    if (!weeklyPlan || !weeklyPlan.has_plan) {
      return (
        <View style={styles.weeklySection}>
          <Text style={styles.weeklyTitle}>Sua Semana</Text>
          <TouchableOpacity style={styles.definePlanCard} onPress={() => navigation.navigate('WeeklyPlanSetup')}>
            <Ionicons name="calendar-outline" size={22} color="#00FF66" style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.definePlanTitle}>Defina seu plano semanal</Text>
              <Text style={styles.definePlanSubtitle}>Escolha uma divisão e organize seus treinos de Segunda a Domingo</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#888" />
          </TouchableOpacity>
        </View>
      );
    }

    const todayIndex = todayPlanIndex();
    const expanded = weeklyPlan.days.find((d) => d.day_of_week === expandedDay);

    return (
      <View style={styles.weeklySection}>
        <View style={styles.weeklyHeaderRow}>
          <Text style={styles.weeklyTitle}>Sua Semana</Text>
          <Text style={styles.weeklySplitName}>{weeklyPlan.split_name}</Text>
          <TouchableOpacity onPress={handlePlanOptions} style={{ padding: 4 }}>
            <Ionicons name="ellipsis-horizontal" size={20} color="#888" />
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
          {weeklyPlan.days.map((day) => {
            const isToday = day.day_of_week === todayIndex;
            const isRest = !day.split_day_id;
            const isSelected = expandedDay === day.day_of_week;
            return (
              <TouchableOpacity
                key={day.day_of_week}
                style={[
                  styles.dayChip,
                  isToday && styles.dayChipToday,
                  isSelected && styles.dayChipSelected,
                ]}
                onPress={() => toggleDay(day)}
              >
                <Text style={[styles.dayChipLabel, isToday && styles.dayChipLabelToday]}>
                  {day.day_label.slice(0, 3)}
                </Text>
                <Text style={[styles.dayChipValue, isRest && styles.dayChipValueRest]} numberOfLines={1}>
                  {isRest ? 'Descanso' : day.split_day_name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {expanded && (
          <View style={styles.dayDetailCard}>
            <View style={styles.dayDetailHeader}>
              <Text style={styles.dayDetailTitle}>
                {expanded.day_label}{expanded.day_of_week === todayIndex ? ' · Hoje' : ''}
              </Text>
              <TouchableOpacity onPress={() => handleReassignDay(expanded)}>
                <Ionicons name="pencil" size={16} color="#888" />
              </TouchableOpacity>
            </View>

            {expanded.split_day_id ? (
              <>
                {loadingDayExercises && !dayExercises[expanded.split_day_id] ? (
                  <ActivityIndicator color="#00FF66" style={{ marginVertical: 10 }} />
                ) : (
                  (dayExercises[expanded.split_day_id] || []).map((ex) => (
                    <Text key={ex.exercise_id} style={styles.dayDetailExercise}>• {ex.name}</Text>
                  ))
                )}
                <TouchableOpacity style={styles.startDayButton} onPress={() => handleStartDay(expanded)} disabled={startingDay}>
                  {startingDay ? <ActivityIndicator color="#121212" /> : <Text style={styles.startDayText}>Iniciar Treino</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.restSuggestionText}>{weeklyPlan.active_rest_suggestion}</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('WorkoutSession', { workoutId: item.id })}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.split_day_name || item.name || 'Treino'}</Text>
        {item.is_finished ? (
          <View style={styles.badgeDone}><Text style={styles.badgeDoneText}>Finalizado</Text></View>
        ) : (
          <View style={styles.badgeActive}><Text style={styles.badgeActiveText}>Em andamento</Text></View>
        )}
      </View>
      <Text style={styles.cardDate}>{formatShortDate(item.started_at, { includeYear: true })}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <BackButton />
        <Text style={styles.headerTitle}>Treinos</Text>
      </View>

      {renderWeeklySection()}

      {loading ? (
        <ActivityIndicator size="large" color="#00FF66" style={{ marginTop: 40 }} />
      ) : workoutsError ? (
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline-outline" size={36} color="#888" style={{ marginBottom: 10 }} />
          <Text style={styles.errorTitle}>Não foi possível carregar seu histórico</Text>
          <Text style={styles.errorSubtitle}>Verifique sua conexão e tente novamente.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchWorkouts}>
            <Text style={styles.retryButtonText}>Tentar Novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={workouts}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 120 }}
          ListEmptyComponent={<Text style={styles.emptyText}>Nenhum treino registrado ainda. Toque no + para começar.</Text>}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('ChooseSplit')}
      >
        <Ionicons name="add" size={32} color="#121212" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  card: { backgroundColor: '#1E1E1E', borderRadius: 12, padding: 16, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#00FF66' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  cardDate: { color: '#888', fontSize: 13 },
  badgeDone: { backgroundColor: 'rgba(136,136,136,0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeDoneText: { color: '#888', fontSize: 11, fontWeight: 'bold' },
  badgeActive: { backgroundColor: 'rgba(0,255,102,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#00FF66' },
  badgeActiveText: { color: '#00FF66', fontSize: 11, fontWeight: 'bold' },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 30, fontSize: 14 },
  errorContainer: { alignItems: 'center', marginTop: 40, paddingHorizontal: 20 },
  errorTitle: { color: '#FFF', fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 6 },
  errorSubtitle: { color: '#888', fontSize: 13, textAlign: 'center', marginBottom: 18 },
  retryButton: { backgroundColor: '#00FF66', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 10 },
  retryButtonText: { color: '#121212', fontSize: 15, fontWeight: 'bold' },
  fab: { position: 'absolute', bottom: 30, right: 20, backgroundColor: '#00FF66', width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', shadowColor: '#00FF66', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },

  weeklySection: { marginBottom: 18 },
  weeklyHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  weeklyTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  weeklySplitName: { flex: 1, color: '#888', fontSize: 12, marginLeft: 8 },
  definePlanCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E1E1E', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#333' },
  definePlanTitle: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  definePlanSubtitle: { color: '#888', fontSize: 12, marginTop: 2 },
  dayRow: { paddingRight: 4 },
  dayChip: { backgroundColor: '#1E1E1E', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginRight: 8, minWidth: 72, borderWidth: 1, borderColor: '#2A2A2A', alignItems: 'center' },
  dayChipToday: { borderColor: '#00FF66' },
  dayChipSelected: { backgroundColor: '#2A2A2A' },
  dayChipLabel: { color: '#888', fontSize: 11, fontWeight: 'bold', marginBottom: 4, textTransform: 'uppercase' },
  dayChipLabelToday: { color: '#00FF66' },
  dayChipValue: { color: '#FFF', fontSize: 12, fontWeight: '600', maxWidth: 70 },
  dayChipValueRest: { color: '#666' },
  dayDetailCard: { backgroundColor: '#1E1E1E', borderRadius: 12, padding: 16, marginTop: 10 },
  dayDetailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  dayDetailTitle: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  dayDetailExercise: { color: '#CCC', fontSize: 13, marginBottom: 4 },
  restSuggestionText: { color: '#AAA', fontSize: 13, lineHeight: 19 },
  startDayButton: { backgroundColor: '#00FF66', padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  startDayText: { color: '#121212', fontSize: 14, fontWeight: 'bold' },
});
