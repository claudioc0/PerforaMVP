import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import BackButton from '../components/BackButton';
import { getWorkoutProgress } from '../services/api';
import { formatShortDate } from '../utils/formatDate';
import { useTheme } from '../theme/ThemeContext';

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  // Antes, falha de rede só mostrava um Alert genérico e a tela ficava presa
  // no spinner (loading nunca virava false direito em alguns casos) ou caía
  // numa lista vazia indistinguível de "sem treinos ainda" — sem botão de
  // tentar de novo, a única saída era sair da tela e voltar.
  const [error, setError] = useState(false);

  const fetchProgress = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await getWorkoutProgress();
      setProgress(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchProgress();
    }, [fetchProgress])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.rootContainer}>
        <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
          <BackButton style={[styles.backButton, { top: insets.top + 20 }]} />
          <Text style={styles.headerTitle}>Progresso</Text>
        </View>
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.textSecondary} style={{ marginBottom: 12 }} />
          <Text style={styles.errorTitle}>Não foi possível carregar seu progresso</Text>
          <Text style={styles.errorSubtitle}>Verifique sua conexão e tente novamente.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchProgress}>
            <Text style={styles.retryButtonText}>Tentar Novamente</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.rootContainer}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <BackButton style={[styles.backButton, { top: insets.top + 20 }]} />
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
            let trendColor = colors.textSecondary;
            let trendLabel = null;

            if (olderWorkout) {
              if (workout.total_tonnage > olderWorkout.total_tonnage) {
                trendIcon = 'trending-up';
                trendColor = colors.primary;
                trendLabel = 'Tonelagem em alta em relação ao treino anterior';
              } else if (workout.total_tonnage < olderWorkout.total_tonnage) {
                trendIcon = 'trending-down';
                trendColor = colors.danger;
                trendLabel = 'Tonelagem em queda em relação ao treino anterior';
              } else {
                trendIcon = 'remove';
                trendColor = colors.textSecondary;
                trendLabel = 'Tonelagem estável em relação ao treino anterior';
              }
            }

            return (
              <View key={workout.workout_id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardDate}>{formatShortDate(workout.started_at)}</Text>
                  {trendIcon && <Ionicons name={trendIcon} size={20} color={trendColor} accessibilityLabel={trendLabel} />}
                </View>
                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue} maxFontSizeMultiplier={1.3}>{workout.total_tonnage.toFixed(0)}kg</Text>
                    <Text style={styles.statLabel} maxFontSizeMultiplier={1.3}>Tonelagem</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue} maxFontSizeMultiplier={1.3}>{workout.total_reps}</Text>
                    <Text style={styles.statLabel} maxFontSizeMultiplier={1.3}>Reps</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue} maxFontSizeMultiplier={1.3}>
                      {workout.avg_rest_seconds !== null ? `${workout.avg_rest_seconds.toFixed(0)}s` : '—'}
                    </Text>
                    <Text style={styles.statLabel} maxFontSizeMultiplier={1.3}>Descanso médio</Text>
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

const createStyles = (colors) => StyleSheet.create({
  rootContainer: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 20 },
  errorTitle: { color: colors.white, fontSize: 17, fontWeight: '600', textAlign: 'center', marginBottom: 6 },
  errorSubtitle: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 20 },
  retryButton: { backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 30, borderRadius: 10 },
  retryButtonText: { color: colors.onPrimary, fontSize: 16, fontWeight: 'bold' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 15, backgroundColor: colors.background },
  backButton: { position: 'absolute', left: 20, top: 60, zIndex: 10 },
  headerTitle: { flex: 1, textAlign: 'center', color: colors.white, fontSize: 22, fontWeight: 'bold' },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, marginBottom: 15 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  cardDate: { color: colors.white, fontSize: 16, fontWeight: '600' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statBox: { alignItems: 'center' },
  statValue: { color: colors.primary, fontSize: 20, fontWeight: 'bold' },
  statLabel: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  emptyText: { color: colors.textSecondary, textAlign: 'center', marginTop: 40, fontSize: 14, paddingHorizontal: 20 },
});
