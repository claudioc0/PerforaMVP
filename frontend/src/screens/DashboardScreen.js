import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useDrawerMenu } from '../navigation/DrawerMenuContext';
import { useAppAlert } from '../components/AppAlertProvider';
import { useUserGoals } from '../contexts/UserContext';
import { getTodaySummary, deleteMeal, addWater, getDailyInsight, addFavorite, saveMeal, getStreak } from '../services/api';
import { getStreakTier } from '../utils/streak';
import { DAILY_INSIGHT_CACHE_KEY } from '../services/session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import LogoMark from '../components/LogoMark';
import MacroSummaryLine from '../components/MacroSummaryLine';
import { colors } from '../theme/colors';
import { ROUTES } from '../navigation/routes';

// --- Funções utilitárias para manipulação de datas ---
// A data enviada pra API é sempre montada a partir dos componentes LOCAIS do aparelho.
// Usar toISOString() aqui converteria pra UTC: no horário de Brasília (UTC-3), tudo que
// fosse registrado a partir das 21h iria parar no dia seguinte — o jantar sumia do "Hoje"
// e era contabilizado no orçamento calórico de amanhã.
const getFormattedDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`; // YYYY-MM-DD no fuso do usuário
};

// Zera o horário pra permitir comparar duas datas apenas pelo dia
const startOfDay = (date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const getDisplayDate = (date) => {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Hoje";
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";

  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

// --- Componente de Barra de Progresso Customizada ---
const ProgressBar = ({ label, consumed = 0, goal = 0, unit = 'g', color = colors.primary }) => {
  const safeGoal = goal > 0 ? goal : 1; 
  const percentage = (consumed / safeGoal) * 100;
  const visualPercentage = Math.min(percentage, 100); 

  const remaining = goal - consumed;
  const hasExceeded = remaining < 0;

  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressLabelRow}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.progressPercentage}>{percentage.toFixed(0)}%</Text>
      </View>
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: `${visualPercentage}%`, backgroundColor: color }]} />
      </View>
      <View style={styles.progressMetaRow}>
        <Text style={styles.progressMetaText}>Consumido: {consumed.toFixed(1)}{unit}</Text>
        {hasExceeded ? (
          <Text style={styles.progressMetaText}>Ultrapassou: {Math.abs(remaining).toFixed(1)}{unit}</Text>
        ) : (
          <Text style={styles.progressMetaText}>Faltam: {remaining.toFixed(1)}{unit}</Text>
        )}
      </View>
    </View>
  );
};

// --- Badge de Sequência (Streak) ---
const StreakBadge = ({ currentStreak }) => {
  if (!currentStreak) return null;
  const tier = getStreakTier(currentStreak);
  return (
    <View style={[styles.streakBadge, styles[`streakBadge_${tier}`]]}>
      <Ionicons name="flame" size={18} color={colors.primary} />
      <Text style={styles.streakText}>
        {currentStreak} {currentStreak === 1 ? 'dia seguido' : 'dias seguidos'}
      </Text>
    </View>
  );
};

export default function DashboardScreen({ navigation }) {
  const { open: openDrawerMenu } = useDrawerMenu();
  const showAlert = useAppAlert();
  const insets = useSafeAreaInsets();
  const { goals, refreshGoals } = useUserGoals();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [userName, setUserName] = useState('');
  const [waterIntake, setWaterIntake] = useState(0);
  const [aiInsight, setAiInsight] = useState(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [yesterdayMeals, setYesterdayMeals] = useState([]);
  const [streak, setStreak] = useState(null);

  const formattedCurrentDate = useMemo(() => getFormattedDate(currentDate), [currentDate]);
  // Compara só o dia: currentDate carrega o horário em que foi criada, então comparar
  // os timestamps direto marcava o próprio dia de hoje como "futuro" o dia inteiro.
  const isFutureDate = useMemo(
    () => startOfDay(currentDate) > startOfDay(new Date()),
    [currentDate]
  );
  // getDisplayDate aloca Date novos (hoje/ontem) e chama toDateString() a cada
  // chamada — antes era invocada 3x por render (2x no JSX + 1x dentro do
  // efeito do insight), inclusive em re-renders que nada tinham a ver com a
  // data (digitar água, carregar insight). Memoizado aqui, só recalcula
  // quando currentDate muda de fato.
  const displayDate = useMemo(() => getDisplayDate(currentDate), [currentDate]);

  const fetchData = useCallback(async () => {
    setLoading(true); 
    setError(null); 
    try {
      const [summaryData] = await Promise.all([
        getTodaySummary(formattedCurrentDate),
        refreshGoals(),
      ]);
      setSummary(summaryData);
      setWaterIntake(summaryData?.total_water_ml || 0);
    } catch (err) {
      if (err.status !== 401) {
        setError("Não foi possível carregar os dados. Verifique sua conexão.");
      }
    } finally {
      setLoading(false);
    }
  }, [formattedCurrentDate, refreshGoals]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // Sempre sobre o ONTEM real do aparelho — não sobre `currentDate - 1`, senão
  // navegar pelas setas de data faria o atalho "repetir de ontem" mudar de
  // significado (ex: em "Ontem", isso buscaria "anteontem", confuso).
  const fetchYesterdayMeals = useCallback(async () => {
    const realYesterday = new Date();
    realYesterday.setDate(realYesterday.getDate() - 1);
    try {
      const data = await getTodaySummary(getFormattedDate(realYesterday));
      setYesterdayMeals(data?.meals || []);
    } catch {
      // Atalho best-effort — sem isso, o usuário ainda registra manualmente.
      setYesterdayMeals([]);
    }
  }, []);

  // Sempre sobre o "hoje" real do aparelho, não sobre `currentDate` — a
  // streak não deveria mudar enquanto o usuário navega pelas setas de data.
  const fetchStreak = useCallback(async () => {
    try {
      const data = await getStreak(getFormattedDate(new Date()));
      setStreak(data);
    } catch {
      // Badge de streak não é funcionalidade core — falha aqui não bloqueia o resto do Dashboard.
      setStreak(null);
    }
  }, []);

  // --- LÓGICA DE CACHE DA IA OTIMIZADA ---
  useEffect(() => {
    const fetchInsight = async () => {
      const CACHE_KEY = DAILY_INSIGHT_CACHE_KEY;
      const isToday = displayDate === "Hoje";

      if (summary && goals && isToday) {
        setLoadingInsight(true);
        setAiInsight(null); 

        const consumed = {
          calories: summary.total_calories,
          protein_g: summary.total_protein_g,
          carbs_g: summary.total_carbs_g,
          fat_g: summary.total_fat_g,
        };

        const nutrientsHash = `${consumed.calories}-${consumed.protein_g}-${consumed.carbs_g}-${consumed.fat_g}`;

        try {
          const cachedInsightJSON = await AsyncStorage.getItem(CACHE_KEY);
          if (cachedInsightJSON) {
            const cachedInsight = JSON.parse(cachedInsightJSON);
            if (cachedInsight.date === formattedCurrentDate && cachedInsight.nutrients_hash === nutrientsHash) {
              setAiInsight(cachedInsight.insight_text);
              setLoadingInsight(false);
              return;
            }
          }

          const insightData = await getDailyInsight(goals, consumed);
          setAiInsight(insightData.insight);

          const newCacheObject = {
            date: formattedCurrentDate,
            nutrients_hash: nutrientsHash,
            insight_text: insightData.insight,
          };
          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(newCacheObject));

        } catch {
          setAiInsight("Mantenha o foco na alta performance! Seu treinador virtual está analisando sua evolução.");
        } finally {
          setLoadingInsight(false);
        }
      }
    };
    fetchInsight();
  }, [summary, goals, displayDate, formattedCurrentDate]);

  const changeDay = (amount) => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + amount);

    // Bloqueia navegar pra frente, comparando apenas o dia (não o horário)
    if (startOfDay(newDate) > startOfDay(new Date())) return;

    setCurrentDate(newDate);
  };

  // useFocusEffect (abaixo) já cobre "buscar ao abrir a tela" — ele roda tanto
  // na montagem inicial quanto toda vez que a tela reganha foco (voltar da
  // Câmera, do registro manual, etc.), e também de novo quando fetchData muda
  // de identidade (troca de dia). Um useEffect(fetchData, [fetchData]) extra
  // aqui rodava JUNTO com o useFocusEffect na abertura — a MESMA busca (que já
  // é um Promise.all de duas chamadas) disparando duas vezes, 4 requests em
  // vez de 2 toda vez que o Dashboard abria.
  useFocusEffect(
    useCallback(() => {
      const loadScreenData = async () => {
        fetchData();
        fetchYesterdayMeals();
        fetchStreak();
        try {
          const userDataString = await AsyncStorage.getItem('user_data');
          if (userDataString) {
            const userData = JSON.parse(userDataString);
            setUserName(userData.name || '');
          }
        } catch {
          // Nome do usuário é só um "nice to have" no cabeçalho — sem cache local
          // legível, a tela continua funcional com a saudação genérica.
        }
      };
      loadScreenData();
    }, [fetchData, fetchYesterdayMeals, fetchStreak])
  );

  const handleDeleteMeal = async (mealId) => {
    showAlert(
      "Excluir Refeição",
      "Tem certeza que deseja apagar este registro?",
      [
        { text: "Não", style: "cancel" },
        {
          text: "Sim",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMeal(mealId);
              fetchData();
            } catch (error) {
              showAlert("Erro ao Excluir", error.message || "Não foi possível apagar a refeição.");
            }
          }
        }
      ]
    );
  };

  const handleAddWater = async (amount) => {
    const previousIntake = waterIntake;
    setWaterIntake(prev => prev + amount);
    try {
      const response = await addWater(amount, formattedCurrentDate);
      setWaterIntake(response.total);
    } catch {
      setWaterIntake(previousIntake);
      showAlert("Erro", "Não foi possível registrar a água. Tente novamente.");
    }
  };

  const handleFavorite = async (meal) => {
    showAlert(
      "Salvar como Favorito",
      `Deseja salvar "${meal.description}" nos seus pratos favoritos?`,
      [
        { text: "Não", style: "cancel" },
        {
          text: "Sim",
          onPress: async () => {
            try {
              const favoriteData = {
                description: meal.description, calories: meal.calories, protein_g: meal.protein_g, carbs_g: meal.carbs_g, fat_g: meal.fat_g
              };
              await addFavorite(favoriteData);
              showAlert("Sucesso", "Refeição salva nos seus favoritos!");
            } catch (error) {
              showAlert("Erro", error.message || "Não foi possível salvar como favorito.");
            }
          },
        },
      ]
    );
  };

  const handleRepeatMeal = (meal) => {
    showAlert(
      "Repetir Refeição",
      `Adicionar "${meal.description}" de ontem ao dia de hoje?`,
      [
        { text: "Não", style: "cancel" },
        {
          text: "Sim",
          onPress: async () => {
            try {
              // Payload no shape completo de Meal (não o de FavoriteMeal, mais
              // pobre) — preserva items/quantity_g quando a refeição de ontem
              // veio de foto/IA, em vez de só clonar a descrição e os totais.
              const payload = {
                description: meal.description,
                calories: meal.calories,
                protein_g: meal.protein_g,
                carbs_g: meal.carbs_g,
                fat_g: meal.fat_g,
                quantity_g: meal.quantity_g,
                items: meal.items,
                source_type: 'repeat_yesterday',
                date: formattedCurrentDate,
              };
              await saveMeal(payload);
              fetchData();
            } catch (error) {
              showAlert("Erro", error.message || "Não foi possível repetir a refeição.");
            }
          },
        },
      ]
    );
  };

  const renderMealItem = ({ item }) => (
    <View style={styles.mealItemContainer}>
      <TouchableOpacity style={{ flex: 1 }} onPress={() => navigation.navigate(ROUTES.ADJUST_QUANTITY, { meal: item })}>
        <View style={styles.mealItem}>
          <View style={styles.mealHeader}>
            <Text style={styles.mealDesc}>{item.description}</Text>
            {item.confidence > 0 && (
              <View style={styles.confidenceBadge}>
                <Text style={styles.confidenceText}>{(item.confidence * 100).toFixed(0)}% IA</Text>
              </View>
            )}
          </View>
          <MacroSummaryLine
            calories={item.calories}
            proteinG={item.protein_g}
            carbsG={item.carbs_g}
            fatG={item.fat_g}
            style={styles.mealMacros}
          />
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => handleFavorite(item)}
        style={styles.actionButton}
        accessibilityRole="button"
        accessibilityLabel="Salvar como favorito"
      >
        <Ionicons name="star" size={20} color={colors.primary} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleDeleteMeal(item.id)} style={styles.deleteButton}>
        <Text style={styles.deleteButtonText}>Excluir</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error && !loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchData}>
          <Text style={styles.retryButtonText}>Tentar Novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.rootContainer}>
      {/* Um único FlatList raiz (não um ScrollView com outro FlatList
          scrollEnabled=false dentro) — aninhar assim anula a virtualização:
          TODA linha da lista interna monta de uma vez, independente do que
          está visível na tela. Com um histórico grande de refeições, a
          abertura da tela travava por um instante. Tudo que antes ficava
          "acima" da lista de refeições agora é o ListHeaderComponent. */}
      <FlatList
        style={[styles.container, { paddingTop: insets.top + 20 }]}
        data={summary?.meals || []}
        keyExtractor={(item) => item.id.toString()}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        renderItem={renderMealItem}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <View style={styles.headerRow}>
                <View style={styles.brandRow}>
                  <LogoMark size={22} />
                  <Text style={styles.greeting}>Olá, {userName}</Text>
                </View>
                <TouchableOpacity
                  style={styles.menuButton}
                  onPress={openDrawerMenu}
                  accessibilityRole="button"
                  accessibilityLabel="Abrir menu"
                >
                  <Ionicons name="menu" size={28} color={colors.white} />
                </TouchableOpacity>
              </View>
              <View style={styles.dateSelector}>
                <TouchableOpacity
                  onPress={() => changeDay(-1)}
                  style={styles.arrowButton}
                  accessibilityRole="button"
                  accessibilityLabel="Dia anterior"
                >
                  <Ionicons name="chevron-back" size={24} color={colors.white} />
                </TouchableOpacity>
                <Text style={styles.title}>{displayDate}</Text>
                <TouchableOpacity
                  onPress={() => changeDay(1)}
                  style={[styles.arrowButton, isFutureDate && styles.disabledArrow] }
                  disabled={isFutureDate}
                  accessibilityRole="button"
                  accessibilityLabel="Próximo dia"
                >
                  <Ionicons name="chevron-forward" size={24} color={colors.white} />
                </TouchableOpacity>
              </View>
              <Text style={styles.subtitle}>Seu desempenho hoje</Text>
            </View>

            <StreakBadge currentStreak={streak?.current_streak} />

            {/* Card de Insight da IA */}
            {(loadingInsight || aiInsight) && (
              <View style={styles.insightCard}>
                <View style={styles.insightHeader}>
                  <Ionicons name="flash" size={20} color={colors.primary} style={styles.insightIcon} />
                  <Text style={styles.insightTitle}>Insight do Treinador</Text>
                </View>
                {loadingInsight ? (
                  <View style={styles.insightLoadingContainer}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.insightLoadingText}>Analisando seu desempenho...</Text>
                  </View>
                ) : (
                  <Text style={styles.insightText}>{aiInsight}</Text>
                )}
              </View>
            )}

            {/* Seção de Progresso */}
            <View style={styles.progressSection}>
              <ProgressBar label="Calorias" consumed={summary?.total_calories} goal={goals?.goal_calories} unit="kcal" />
              <ProgressBar label="Proteínas" consumed={summary?.total_protein_g} goal={goals?.goal_protein_g} />
              <ProgressBar label="Carboidratos" consumed={summary?.total_carbs_g} goal={goals?.goal_carbs_g} />
              <ProgressBar label="Gorduras" consumed={summary?.total_fat_g} goal={goals?.goal_fat_g} />
            </View>

            {/* Seção de Hidratação */}
            <View style={styles.progressSection}>
              <ProgressBar label="Hidratação" consumed={waterIntake} goal={2500} unit="ml" color={colors.info} />
              <View style={styles.waterButtonsContainer}>
                <TouchableOpacity style={styles.waterButton} onPress={() => handleAddWater(250)}>
                  <Text style={styles.waterButtonText}>+250 ml</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.waterButton} onPress={() => handleAddWater(500)}>
                  <Text style={styles.waterButtonText}>+500 ml</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Repetir refeição de ontem — só faz sentido olhando pro "Hoje" de
                verdade, não pra qualquer dia passado que o usuário esteja navegando. */}
            {displayDate === 'Hoje' && yesterdayMeals.length > 0 && (
              <View style={styles.repeatSection}>
                <Text style={styles.repeatSectionTitle}>Repetir de ontem</Text>
                <View style={styles.repeatChipsRow}>
                  {yesterdayMeals.map((meal) => (
                    <TouchableOpacity
                      key={meal.id}
                      style={styles.repeatChip}
                      onPress={() => handleRepeatMeal(meal)}
                      accessibilityRole="button"
                      accessibilityLabel={`Repetir "${meal.description}" de ontem`}
                    >
                      <Ionicons name="refresh" size={14} color={colors.primary} style={{ marginRight: 6 }} />
                      <Text style={styles.repeatChipText} numberOfLines={1}>{meal.description}</Text>
                      <Text style={styles.repeatChipCalories}>{meal.calories.toFixed(0)} kcal</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <Text style={styles.listTitle}>Refeições de {displayDate}</Text>
          </>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>Nenhuma refeição registrada. Puxe para atualizar.</Text>}
        contentContainerStyle={{ paddingBottom: 210 }}
      />

      {/* FABs */}
      <View style={styles.fabContainer}>
        <TouchableOpacity
          style={styles.fabSecondary}
          onPress={() => navigation.navigate(ROUTES.MANUAL_ENTRY, { targetDate: formattedCurrentDate })}
          accessibilityRole="button"
          accessibilityLabel="Adicionar refeição manualmente"
        >
          <Ionicons name="create" size={22} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate(ROUTES.CAMERA, { targetDate: formattedCurrentDate })}
          accessibilityRole="button"
          accessibilityLabel="Adicionar refeição com foto"
        >
          <Ionicons name="camera" size={28} color={colors.background} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 20 },
  container: { flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 60 },
  header: { marginBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  menuButton: { padding: 4 },
  greeting: { color: colors.white, fontSize: 24, fontWeight: 'bold', marginLeft: 8 },
  dateSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 10 },
  arrowButton: { padding: 10 },
  arrowText: { color: colors.white, fontSize: 24, fontWeight: 'bold' },
  disabledArrow: { opacity: 0.3 },
  title: { color: colors.white, fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  subtitle: { color: colors.textSecondary, fontSize: 16, marginTop: 4 },
  streakBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.surfaceAlt, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16, marginBottom: 20 },
  streakBadge_base: {},
  streakBadge_week: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  streakBadge_month: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.primary, shadowColor: colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 6, elevation: 4 },
  streakBadge_century: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.dangerAlt, shadowColor: colors.dangerAlt, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 6, elevation: 4 },
  streakText: { color: colors.white, fontSize: 14, fontWeight: '600', marginLeft: 8 },
  progressSection: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, marginBottom: 25 },
  insightCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, marginBottom: 25, borderWidth: 1, borderColor: 'rgba(0, 255, 102, 0.2)' },
  insightHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  insightIcon: { marginRight: 10 },
  insightTitle: { color: colors.white, fontSize: 16, fontWeight: 'bold' },
  insightText: { color: colors.textFaintAlt2, fontSize: 15, fontStyle: 'italic', lineHeight: 22 },
  insightLoadingContainer: { flexDirection: 'row', alignItems: 'center' },
  insightLoadingText: { color: colors.textSecondary, marginLeft: 10, fontSize: 14 },
  progressContainer: { marginBottom: 15 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { color: colors.white, fontSize: 16, fontWeight: '500' },
  progressPercentage: { color: colors.white, fontSize: 15, fontFamily: 'Orbitron_700Bold' },
  progressBarTrack: { height: 10, backgroundColor: colors.border, borderRadius: 5, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 5 },
  progressMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  progressMetaText: { color: colors.textSecondary, fontSize: 12 },
  waterButtonsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 15 },
  waterButton: { borderColor: colors.info, borderWidth: 1, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 25 },
  waterButtonText: { color: colors.info, fontSize: 14, fontWeight: '600' },
  listTitle: { color: colors.white, fontSize: 18, marginBottom: 15, fontWeight: '600' },
  repeatSection: { marginBottom: 20 },
  repeatSectionTitle: { color: colors.textSecondary, fontSize: 14, marginBottom: 10, fontWeight: '500' },
  repeatChipsRow: { flexDirection: 'row', flexWrap: 'wrap' },
  repeatChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.primary, paddingVertical: 8, paddingHorizontal: 14, marginRight: 10, marginBottom: 10, maxWidth: '100%' },
  repeatChipText: { color: colors.white, fontSize: 13, fontWeight: '500', textTransform: 'capitalize', maxWidth: 140 },
  repeatChipCalories: { color: colors.textSecondary, fontSize: 12, marginLeft: 8 },
  mealItemContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  mealItem: { flex: 1, backgroundColor: colors.surface, padding: 15, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: colors.primary },
  actionButton: { padding: 10, marginLeft: 10 },
  deleteButton: { padding: 10, marginLeft: 5 },
  deleteButtonText: { color: colors.danger, fontSize: 14, fontWeight: '500' },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  mealDesc: { color: colors.white, fontSize: 16, fontWeight: '500', flex: 1, marginRight: 10, textTransform: 'capitalize' },
  confidenceBadge: { backgroundColor: 'rgba(0, 255, 102, 0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: colors.primary },
  confidenceText: { color: colors.primary, fontSize: 10, fontWeight: 'bold' },
  mealMacros: { color: colors.textSecondary, fontSize: 13 },
  emptyText: { color: colors.textSecondary, textAlign: 'center', marginTop: 30, fontSize: 14 },
  fabContainer: { position: 'absolute', bottom: 30, right: 20, alignItems: 'center' },
  fab: { backgroundColor: colors.primary, width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },
  fabSecondary: { backgroundColor: colors.border, width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 15, elevation: 6 },
  errorText: { color: colors.danger, fontSize: 16, textAlign: 'center', marginBottom: 20 },
  retryButton: { backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 30, borderRadius: 10, },
  retryButtonText: { color: colors.background, fontSize: 16, fontWeight: 'bold' }
});