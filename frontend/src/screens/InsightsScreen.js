import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TextInput, TouchableOpacity, Image, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getWeeklySummary, getWeightHistory, logWeight, getProgressPhotos, getAuthenticatedImageSource, getReportDownloadUrl } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import BackButton from '../components/BackButton';
import { useAppAlert } from '../components/AppAlertProvider';
import { useUserGoals } from '../contexts/UserContext';
import { formatShortDate } from '../utils/formatDate';
import { useTheme } from '../theme/ThemeContext';
import { ROUTES } from '../navigation/routes';

// A janela de 7 dias do resumo semanal é ancorada em "hoje" no fuso LOCAL do
// aparelho, não em toISOString() (que converte pra UTC): perto da meia-noite
// no horário de Brasília (UTC-3), toISOString() já estaria no dia seguinte.
function getLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// --- Componente de Gráfico de Barras Customizado ---
// `styles`/`colors` vêm do componente pai (useTheme() já resolvido lá).
const WeeklyBarChart = ({ data, goal, label, styles, colors }) => {
  if (!data || data.length === 0 || !goal) {
    return <View style={[styles.chartContainer, styles.chartPlaceholder]}><Text style={styles.placeholderText}>Dados insuficientes para exibir o gráfico.</Text></View>;
  }
  const safeGoal = goal > 0 ? goal : 1;

  return (
    <View>
      <Text style={styles.chartLabel}>{label}</Text>
      <View style={styles.chartContainer}>
        {data.map((day, index) => {
          const percentage = day.calories > 0 ? (day.calories / safeGoal) * 100 : 0;
          const barHeight = Math.min(percentage, 100); // Limita a altura visual em 100%
          const hasExceeded = percentage > 100;

          return (
            <View key={index} style={styles.barWrapper}>
              <View style={[styles.bar, { height: `${barHeight}%`, backgroundColor: hasExceeded ? colors.danger : colors.primary }]} />
              <Text style={styles.dayLabel}>{day.day_name ? day.day_name.charAt(0) : ''}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

export default function InsightsScreen({ navigation }) {
  const showAlert = useAppAlert();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { goals, refreshGoals } = useUserGoals();
  const [weeklyData, setWeeklyData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para Evolução Corporal
  const [weightHistory, setWeightHistory] = useState([]);
  const [currentWeightInput, setCurrentWeightInput] = useState('');
  const [loggingWeight, setLoggingWeight] = useState(false);

  const [exportingFormat, setExportingFormat] = useState(null);

  // O download em si é feito pelo navegador do sistema (Linking.openURL) —
  // não dá pra saber quando ele termina, só que abriu. O estado de loading
  // aqui cobre só o tempo de montar a URL (ler o token salvo).
  const handleExportReport = async (format) => {
    setExportingFormat(format);
    try {
      const url = await getReportDownloadUrl(format);
      await Linking.openURL(url);
    } catch {
      showAlert('Erro', 'Não foi possível abrir o download do relatório.');
    } finally {
      setExportingFormat(null);
    }
  };

  // Só a miniatura mais recente — a timeline completa/comparação vive em
  // ProgressPhotosScreen, este card é só um atalho de entrada.
  const [latestPhoto, setLatestPhoto] = useState(null);

  useFocusEffect(
    useCallback(() => {
      const fetchData = async () => {
        setLoading(true);
        try {
          const [summaryData, , weightHistoryData, photos] = await Promise.all([
            // Proteção adicionada caso o backend retorne erro na rota semanal
            getWeeklySummary(getLocalDateString(new Date())).catch(() => ({ days: [] })),
            refreshGoals(),
            getWeightHistory().catch(() => []),
            getProgressPhotos().catch(() => []),
          ]);
          setWeeklyData(summaryData.days || []);
          setWeightHistory(weightHistoryData || []);

          const mostRecent = photos?.[photos.length - 1];
          if (mostRecent) {
            const source = await getAuthenticatedImageSource(mostRecent.image_url);
            setLatestPhoto({ ...mostRecent, source });
          } else {
            setLatestPhoto(null);
          }
        } catch {
          showAlert("Erro", "Não foi possível carregar os insights. Tente novamente.");
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    }, [refreshGoals, showAlert])
  );

  const weeklyAverages = useMemo(() => {
    if (!weeklyData || weeklyData.length === 0) {
      return { avgCalories: 0, avgProtein: 0 };
    }
    const totalCalories = weeklyData.reduce((sum, day) => sum + day.calories, 0);
    const totalProtein = weeklyData.reduce((sum, day) => sum + day.protein_g, 0);
    const daysWithData = weeklyData.filter(day => day.calories > 0).length || 1;

    return {
      avgCalories: totalCalories / daysWithData,
      avgProtein: totalProtein / daysWithData,
    };
  }, [weeklyData]);

  const handleLogWeight = async () => {
    // CORREÇÃO 1: Trata a vírgula brasileira antes de converter para float
    const normalizedInput = currentWeightInput.replace(',', '.');
    const weight = parseFloat(normalizedInput);
    
    if (isNaN(weight) || weight <= 0) {
      showAlert("Erro", "Por favor, insira um peso válido.");
      return;
    }

    setLoggingWeight(true);
    try {
      await logWeight({ weight });
      showAlert("Sucesso", "Peso registrado!");
      setCurrentWeightInput('');
      const updatedHistory = await getWeightHistory();
      setWeightHistory(updatedHistory);
    } catch (error) {
      showAlert("Erro", error.message || "Não foi possível registrar o peso.");
    } finally {
      setLoggingWeight(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.rootContainer}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <BackButton style={[styles.backButton, { top: insets.top + 20 }]} />
        <Text style={styles.headerTitle}>Seus Insights</Text>
      </View>

      <ScrollView style={styles.container}>
        <View style={styles.card}>
          <WeeklyBarChart data={weeklyData} goal={goals?.goal_calories} label="Consumo de Calorias (vs. Meta)" styles={styles} colors={colors} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Média da Semana</Text>
          <View style={styles.avgContainer}>
            <View style={styles.avgBox}>
              <Text style={styles.avgValue} maxFontSizeMultiplier={1.3}>{weeklyAverages.avgCalories.toFixed(0)}</Text>
              <Text style={styles.avgLabel} maxFontSizeMultiplier={1.3}>Média de Kcal / dia</Text>
            </View>
            <View style={styles.avgBox}>
              <Text style={styles.avgValue} maxFontSizeMultiplier={1.3}>{weeklyAverages.avgProtein.toFixed(1)}g</Text>
              <Text style={styles.avgLabel} maxFontSizeMultiplier={1.3}>Média de Proteína / dia</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Evolução Corporal</Text>

          <View style={styles.weightInputContainer}>
            <TextInput
              style={styles.weightInput}
              placeholder="Peso de hoje (kg)"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={currentWeightInput}
              onChangeText={setCurrentWeightInput}
            />
            <TouchableOpacity
              style={[styles.logWeightButton, loggingWeight && styles.disabledButton]}
              onPress={handleLogWeight}
              disabled={loggingWeight}
            >
              {loggingWeight ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.logWeightButtonText}>Registrar</Text>
              )}
            </TouchableOpacity>
          </View>

          {weightHistory.length > 0 ? (
            <View style={styles.weightHistoryContainer}>
              <Text style={styles.weightHistoryLabel}>Últimos Registros:</Text>
              <View style={styles.weightTagsContainer}>
                {weightHistory.slice(-5).reverse().map((log, index, arr) => {
                  // CORREÇÃO 2: Pega o log cronologicamente anterior (index + 1)
                  const olderLog = arr[index + 1];
                  let trendIcon = null;
                  let indicatorColor = colors.border;
                  let trendLabel = null;

                  if (olderLog) {
                    if (log.weight < olderLog.weight) {
                      trendIcon = 'trending-down';
                      indicatorColor = colors.primary; // Perdeu peso (Verde)
                      trendLabel = 'Peso caiu em relação ao registro anterior';
                    } else if (log.weight > olderLog.weight) {
                      trendIcon = 'trending-up';
                      indicatorColor = colors.danger; // Ganhou peso (Vermelho)
                      trendLabel = 'Peso subiu em relação ao registro anterior';
                    } else {
                      trendIcon = 'remove'; // Manteve
                      indicatorColor = colors.textSecondary;
                      trendLabel = 'Peso estável em relação ao registro anterior';
                    }
                  }

                  return (
                    <View key={log.id} style={[styles.weightTag, { borderColor: indicatorColor }]}>
                      <Text style={styles.weightTagText}>
                        {new Date(log.date).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}: {log.weight.toFixed(1)}kg
                      </Text>
                      {trendIcon && (
                        <Ionicons name={trendIcon} size={14} color={indicatorColor} style={styles.weightTagIcon} accessibilityLabel={trendLabel} />
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            <Text style={styles.emptyText}>Nenhum registro de peso ainda.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Fotos de Progresso</Text>
          {latestPhoto ? (
            <View style={styles.photoPreviewRow}>
              <Image source={latestPhoto.source} style={styles.photoThumb} />
              <View style={styles.photoPreviewInfo}>
                <Text style={styles.photoPreviewDate}>
                  Última foto: {formatShortDate(latestPhoto.taken_at, { includeYear: true })}
                </Text>
                <TouchableOpacity
                  style={styles.photoTimelineButton}
                  onPress={() => navigation.navigate(ROUTES.PROGRESS_PHOTOS)}
                >
                  <Text style={styles.photoTimelineButtonText}>Ver Timeline</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View>
              <Text style={styles.emptyText}>Nenhuma foto de progresso ainda.</Text>
              <TouchableOpacity
                style={styles.photoTimelineButton}
                onPress={() => navigation.navigate(ROUTES.PROGRESS_PHOTOS)}
              >
                <Text style={styles.photoTimelineButtonText}>Tirar Primeira Foto</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Exportar Relatório</Text>
          <Text style={styles.exportDescription}>
            Baixe um resumo do seu progresso (calorias, peso e treinos) pra levar ao seu nutricionista ou personal.
          </Text>
          <View style={styles.exportButtonsRow}>
            <TouchableOpacity
              style={[styles.exportButton, exportingFormat === 'pdf' && styles.disabledButton]}
              onPress={() => handleExportReport('pdf')}
              disabled={exportingFormat !== null}
            >
              {exportingFormat === 'pdf' ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.exportButtonText}>PDF</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.exportButton, exportingFormat === 'csv' && styles.disabledButton]}
              onPress={() => handleExportReport('csv')}
              disabled={exportingFormat !== null}
            >
              {exportingFormat === 'csv' ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.exportButtonText}>CSV</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  rootContainer: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 15, backgroundColor: colors.background },
  backButton: { position: 'absolute', left: 20, top: 60, zIndex: 10 },
  headerTitle: { flex: 1, textAlign: 'center', color: colors.white, fontSize: 22, fontWeight: 'bold' },
  
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, marginBottom: 20 },
  cardTitle: { color: colors.white, fontSize: 18, fontWeight: '600', marginBottom: 20 },

  chartLabel: { color: colors.textSecondary, fontSize: 14, marginBottom: 15, textAlign: 'center' },
  chartContainer: { height: 200, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 5 },
  chartPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  placeholderText: { color: colors.textMuted },
  barWrapper: { flex: 1, alignItems: 'center' },
  bar: { width: '60%', borderRadius: 4 },
  dayLabel: { color: colors.textSecondary, fontSize: 12, marginTop: 8 },

  avgContainer: { flexDirection: 'row', justifyContent: 'space-around' },
  avgBox: { alignItems: 'center' },
  avgValue: { color: colors.white, fontSize: 26, fontWeight: 'bold' },
  avgLabel: { color: colors.textSecondary, fontSize: 14, marginTop: 5 },
  
  weightInputContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, marginTop: 10 },
  weightInput: { flex: 1, backgroundColor: colors.border, color: colors.white, padding: 15, borderRadius: 8, fontSize: 16, marginRight: 10 },
  logWeightButton: { backgroundColor: colors.primary, padding: 15, borderRadius: 10, justifyContent: 'center' },
  logWeightButtonText: { color: colors.onPrimary, fontWeight: 'bold', fontSize: 16 },
  disabledButton: { opacity: 0.7 },
  
  weightHistoryContainer: { marginTop: 10 },
  weightHistoryLabel: { color: colors.textFaint, fontSize: 14, marginBottom: 10 },
  weightTagsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
  weightTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderRadius: 15, paddingVertical: 8, paddingHorizontal: 12, marginRight: 8, marginBottom: 8 },
  weightTagText: { color: colors.white, fontSize: 13 },
  weightTagIcon: { marginLeft: 4 },
  emptyText: { color: colors.textSecondary, textAlign: 'center', marginTop: 10, fontSize: 14 },

  photoPreviewRow: { flexDirection: 'row', alignItems: 'center' },
  photoThumb: { width: 70, height: 93, borderRadius: 10, backgroundColor: colors.background, marginRight: 15 },
  photoPreviewInfo: { flex: 1, justifyContent: 'center' },
  photoPreviewDate: { color: colors.textSecondary, fontSize: 14, marginBottom: 10 },
  photoTimelineButton: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, alignSelf: 'flex-start' },
  photoTimelineButtonText: { color: colors.onPrimary, fontWeight: 'bold', fontSize: 14 },

  exportDescription: { color: colors.textSecondary, fontSize: 14, marginBottom: 15 },
  exportButtonsRow: { flexDirection: 'row', gap: 10 },
  exportButton: { flex: 1, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  exportButtonText: { color: colors.onPrimary, fontWeight: 'bold', fontSize: 15 },
});