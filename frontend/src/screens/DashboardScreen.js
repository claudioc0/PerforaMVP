import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useDrawerMenu } from '../navigation/DrawerMenuContext';
import { useAppAlert } from '../components/AppAlertProvider';
import { getTodaySummary, getUserGoals, deleteMeal, addWater, getDailyInsight, addFavorite } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import LogoMark from '../components/LogoMark';

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
const ProgressBar = ({ label, consumed = 0, goal = 0, unit = 'g', color = '#00FF66' }) => {
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

export default function DashboardScreen({ navigation }) {
  const { open: openDrawerMenu } = useDrawerMenu();
  const showAlert = useAppAlert();
  const [summary, setSummary] = useState(null);
  const [goals, setGoals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [userName, setUserName] = useState('');
  const [waterIntake, setWaterIntake] = useState(0);
  const [aiInsight, setAiInsight] = useState(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  const formattedCurrentDate = useMemo(() => getFormattedDate(currentDate), [currentDate]);
  // Compara só o dia: currentDate carrega o horário em que foi criada, então comparar
  // os timestamps direto marcava o próprio dia de hoje como "futuro" o dia inteiro.
  const isFutureDate = useMemo(
    () => startOfDay(currentDate) > startOfDay(new Date()),
    [currentDate]
  );

  const fetchData = useCallback(async () => {
    setLoading(true); 
    setError(null); 
    try {
      const [summaryData, goalsData] = await Promise.all([
        getTodaySummary(formattedCurrentDate),
        getUserGoals()
      ]);
      setSummary(summaryData);
      setGoals(goalsData);
      setWaterIntake(summaryData?.total_water_ml || 0); 
    } catch (err) {
      console.error("Erro ao buscar resumo:", err);
      if (err.status !== 401) {
        setError("Não foi possível carregar os dados. Verifique sua conexão.");
      }
    } finally {
      setLoading(false);
    }
  }, [formattedCurrentDate]); 

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // --- LÓGICA DE CACHE DA IA OTIMIZADA ---
  useEffect(() => {
    const fetchInsight = async () => {
      const CACHE_KEY = '@perfora_daily_insight';
      const isToday = getDisplayDate(currentDate) === "Hoje";

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
              console.log("⚡ Insight carregado do Cache Local");
              setAiInsight(cachedInsight.insight_text); 
              setLoadingInsight(false);
              return; 
            }
          }

          console.log("🧠 Buscando Insight na API do Gemini...");
          const insightData = await getDailyInsight(goals, consumed);
          setAiInsight(insightData.insight);

          const newCacheObject = {
            date: formattedCurrentDate,
            nutrients_hash: nutrientsHash,
            insight_text: insightData.insight,
          };
          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(newCacheObject));

        } catch (error) {
          console.error("Erro ao buscar insight da IA:", error);
          // FALLBACK ADICIONADO AQUI:
          setAiInsight("Mantenha o foco na alta performance! Seu treinador virtual está analisando sua evolução.");
        } finally {
          setLoadingInsight(false);
        }
      }
    };
    fetchInsight();
  }, [summary, goals, currentDate, formattedCurrentDate]);

  const changeDay = (amount) => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + amount);

    // Bloqueia navegar pra frente, comparando apenas o dia (não o horário)
    if (startOfDay(newDate) > startOfDay(new Date())) return;

    setCurrentDate(newDate);
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]); 

  useFocusEffect(
    useCallback(() => {
      const loadScreenData = async () => {
        fetchData();
        try {
          const userDataString = await AsyncStorage.getItem('user_data');
          if (userDataString) {
            const userData = JSON.parse(userDataString);
            setUserName(userData.name || '');
          }
        } catch (e) {
          console.error("Erro ao carregar dados do usuário:", e);
        }
      };
      loadScreenData();
    }, [fetchData]) 
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
    } catch (error) {
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

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00FF66" />
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
      <ScrollView 
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00FF66" />}
      >
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.brandRow}>
              <LogoMark size={22} />
              <Text style={styles.greeting}>Olá, {userName}</Text>
            </View>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={openDrawerMenu}
            >
              <Ionicons name="menu" size={28} color="#FFF" />
            </TouchableOpacity>
          </View>
          <View style={styles.dateSelector}>
            <TouchableOpacity onPress={() => changeDay(-1)} style={styles.arrowButton}>
              <Ionicons name="chevron-back" size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.title}>{getDisplayDate(currentDate)}</Text>
            <TouchableOpacity onPress={() => changeDay(1)} style={[styles.arrowButton, isFutureDate && styles.disabledArrow] } disabled={isFutureDate}>
              <Ionicons name="chevron-forward" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>Seu desempenho hoje</Text>
        </View>

        {/* Card de Insight da IA */}
        {(loadingInsight || aiInsight) && (
          <View style={styles.insightCard}>
            <View style={styles.insightHeader}>
              <Ionicons name="flash" size={20} color="#00FF66" style={styles.insightIcon} />
              <Text style={styles.insightTitle}>Insight do Treinador</Text>
            </View>
            {loadingInsight ? (
              <View style={styles.insightLoadingContainer}>
                <ActivityIndicator size="small" color="#00FF66" />
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
          <ProgressBar label="Hidratação" consumed={waterIntake} goal={2500} unit="ml" color="#00BFFF" />
          <View style={styles.waterButtonsContainer}>
            <TouchableOpacity style={styles.waterButton} onPress={() => handleAddWater(250)}>
              <Text style={styles.waterButtonText}>+250 ml</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.waterButton} onPress={() => handleAddWater(500)}>
              <Text style={styles.waterButtonText}>+500 ml</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.listTitle}>Refeições de {getDisplayDate(currentDate)}</Text>
        <FlatList
          data={summary?.meals || []}
          keyExtractor={(item) => item.id.toString()}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.mealItemContainer}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => navigation.navigate('AdjustQuantity', { meal: item })}>
                <View style={styles.mealItem}>
                  <View style={styles.mealHeader}>
                    <Text style={styles.mealDesc}>{item.description}</Text>
                    {item.confidence > 0 && (
                      <View style={styles.confidenceBadge}>
                        <Text style={styles.confidenceText}>{(item.confidence * 100).toFixed(0)}% IA</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.mealMacros}>{item.calories.toFixed(0)} kcal • P: {item.protein_g.toFixed(1)}g • C: {item.carbs_g.toFixed(1)}g • G: {item.fat_g.toFixed(1)}g</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleFavorite(item)} style={styles.actionButton}>
                <Ionicons name="star" size={20} color="#00FF66" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDeleteMeal(item.id)} style={styles.deleteButton}>
                <Text style={styles.deleteButtonText}>Excluir</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>Nenhuma refeição registrada. Puxe para atualizar.</Text>}
          contentContainerStyle={{ paddingBottom: 210 }}
          scrollEnabled={false}
        />
      </ScrollView>

      {/* FABs */}
      <View style={styles.fabContainer}>
        <TouchableOpacity style={styles.fabSecondary} onPress={() => navigation.navigate('ManualEntry', { targetDate: formattedCurrentDate })}>
          <Ionicons name="create" size={22} color="#00FF66" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('Camera', { targetDate: formattedCurrentDate })}>
          <Ionicons name="camera" size={28} color="#121212" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: { flex: 1, backgroundColor: '#121212' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212', padding: 20 },
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60 },
  header: { marginBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  menuButton: { padding: 4 },
  greeting: { color: '#FFFFFF', fontSize: 24, fontWeight: 'bold', marginLeft: 8 },
  dateSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 10 },
  arrowButton: { padding: 10 },
  arrowText: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  disabledArrow: { opacity: 0.3 },
  title: { color: '#FFF', fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  subtitle: { color: '#888888', fontSize: 16, marginTop: 4 },
  progressSection: { backgroundColor: '#1E1E1E', borderRadius: 16, padding: 20, marginBottom: 25 },
  insightCard: { backgroundColor: '#1E1E1E', borderRadius: 16, padding: 20, marginBottom: 25, borderWidth: 1, borderColor: 'rgba(0, 255, 102, 0.2)' },
  insightHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  insightIcon: { marginRight: 10 },
  insightTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  insightText: { color: '#DDDDDD', fontSize: 15, fontStyle: 'italic', lineHeight: 22 },
  insightLoadingContainer: { flexDirection: 'row', alignItems: 'center' },
  insightLoadingText: { color: '#888888', marginLeft: 10, fontSize: 14 },
  progressContainer: { marginBottom: 15 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '500' },
  progressPercentage: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Orbitron_700Bold' },
  progressBarTrack: { height: 10, backgroundColor: '#333333', borderRadius: 5, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 5 },
  progressMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  progressMetaText: { color: '#888888', fontSize: 12 },
  waterButtonsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 15 },
  waterButton: { borderColor: '#00BFFF', borderWidth: 1, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 25 },
  waterButtonText: { color: '#00BFFF', fontSize: 14, fontWeight: '600' },
  listTitle: { color: '#FFF', fontSize: 18, marginBottom: 15, fontWeight: '600' },
  mealItemContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  mealItem: { flex: 1, backgroundColor: '#1E1E1E', padding: 15, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#00FF66' },
  actionButton: { padding: 10, marginLeft: 10 },
  deleteButton: { padding: 10, marginLeft: 5 },
  deleteButtonText: { color: '#FF6B6B', fontSize: 14, fontWeight: '500' },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  mealDesc: { color: '#FFF', fontSize: 16, fontWeight: '500', flex: 1, marginRight: 10, textTransform: 'capitalize' },
  confidenceBadge: { backgroundColor: 'rgba(0, 255, 102, 0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#00FF66' },
  confidenceText: { color: '#00FF66', fontSize: 10, fontWeight: 'bold' },
  mealMacros: { color: '#888888', fontSize: 13 },
  emptyText: { color: '#888888', textAlign: 'center', marginTop: 30, fontSize: 14 },
  fabContainer: { position: 'absolute', bottom: 30, right: 20, alignItems: 'center' },
  fab: { backgroundColor: '#00FF66', width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', shadowColor: "#00FF66", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },
  fabSecondary: { backgroundColor: '#333', width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 15, elevation: 6 },
  errorText: { color: '#FF6B6B', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  retryButton: { backgroundColor: '#00FF66', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 10, },
  retryButtonText: { color: '#121212', fontSize: 16, fontWeight: 'bold' }
});