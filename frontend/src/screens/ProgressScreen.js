import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import BackButton from '../components/BackButton';
import { useAppAlert } from '../components/AppAlertProvider';
import { getWorkoutProgress } from '../services/api';
import { formatShortDate } from '../utils/formatDate';

export default function ProgressScreen() {
  const showAlert = useAppAlert();
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      const fetchProgress = async () => {
        setLoading(true);
        try {
          const data = await getWorkoutProgress();
          setProgress(data);
        } catch (error) {
          showAlert('Erro', 'Não foi possível carregar seu progresso.');
        } finally {
          setLoading(false);
        }
      };
      fetchProgress();
    }, [])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00FF66" />
      </View>
    );
  }

  return (
    <View style={styles.rootContainer}>
      <View style={styles.header}>
        <BackButton style={styles.backButton} />
        <Text style={styles.headerTitle}>Progresso</Text>
      </View>

      <ScrollView style={styles.container}>
        {progress.length === 0 ? (
          <Text style={styles.emptyText}>
            Nenhum treino finalizado ainda. Complete um treino pra começar a acompanhar sua evolução.
          </Text>
        ) : (
          progress.map((workout, index) => {
            const olderWorkout = progress[index + 1];
            let trendIcon = null;
            let trendColor = '#888';

            if (olderWorkout) {
              if (workout.total_tonnage > olderWorkout.total_tonnage) {
                trendIcon = 'trending-up';
                trendColor = '#00FF66';
              } else if (workout.total_tonnage < olderWorkout.total_tonnage) {
                trendIcon = 'trending-down';
                trendColor = '#FF6B6B';
              } else {
                trendIcon = 'remove';
                trendColor = '#888';
              }
            }

            return (
              <View key={workout.workout_id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardDate}>{formatShortDate(workout.started_at)}</Text>
                  {trendIcon && <Ionicons name={trendIcon} size={20} color={trendColor} />}
                </View>
                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{workout.total_tonnage.toFixed(0)}kg</Text>
                    <Text style={styles.statLabel}>Tonelagem</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{workout.total_reps}</Text>
                    <Text style={styles.statLabel}>Reps</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>
                      {workout.avg_rest_seconds !== null ? `${workout.avg_rest_seconds.toFixed(0)}s` : '—'}
                    </Text>
                    <Text style={styles.statLabel}>Descanso médio</Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: { flex: 1, backgroundColor: '#121212' },
  container: { flex: 1, padding: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 15, backgroundColor: '#121212' },
  backButton: { position: 'absolute', left: 20, top: 60, zIndex: 10 },
  headerTitle: { flex: 1, textAlign: 'center', color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  card: { backgroundColor: '#1E1E1E', borderRadius: 16, padding: 20, marginBottom: 15 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  cardDate: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statBox: { alignItems: 'center' },
  statValue: { color: '#00FF66', fontSize: 20, fontWeight: 'bold' },
  statLabel: { color: '#888', fontSize: 12, marginTop: 4 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 40, fontSize: 14, paddingHorizontal: 20 },
});
