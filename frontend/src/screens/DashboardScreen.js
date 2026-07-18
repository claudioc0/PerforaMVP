import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getTodaySummary, getUserGoals, deleteMeal, addWater } from '../services/api'; 
import AsyncStorage from '@react-native-async-storage/async-storage';

// --- Funções utilitárias para manipulação de datas ---
const getFormattedDate = (date) => {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
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
  const safeGoal = goal > 0 ? goal : 1; // Evita divisão por zero
  const percentage = (consumed / safeGoal) * 100;
  const visualPercentage = Math.min(percentage, 100); // Limita a barra em 100%

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
  const [summary, setSummary] = useState(null);
  const [goals, setGoals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [userName, setUserName] = useState('');
  const [waterIntake, setWaterIntake] = useState(0);

  const formattedCurrentDate = useMemo(() => getFormattedDate(currentDate), [currentDate]);
  const isFutureDate = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return currentDate > today;
  }, [currentDate]);

  const fetchData = useCallback(async () => {
    setLoading(true); // Mostra o loading a cada nova busca
    setError(null); // Limpa erros anteriores
    try {
      // Busca summary e goals em paralelo para otimizar o tempo de carregamento
      const [summaryData, goalsData] = await Promise.all([
        getTodaySummary(formattedCurrentDate),
        getUserGoals()
      ]);
      setSummary(summaryData);
      setGoals(goalsData);
      setWaterIntake(summaryData?.total_water_ml || 0); // Atualiza a água com os dados do dia
    } catch (err) {
      console.error("Erro ao buscar resumo:", err);
      // Se o erro for 401 (Sessão Expirada), não mostre a tela de "Tentar Novamente",
      // pois o interceptador da API já está redirecionando para o Login.
      // Para qualquer outro erro, mostre a mensagem.
      if (err.status !== 401) {
        setError("Não foi possível carregar os dados. Verifique sua conexão.");
      }
    } finally {
      setLoading(false);
    }
  }, [formattedCurrentDate]); // A dependência é a data formatada

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, []);

  const changeDay = (amount) => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + amount);
    
    const today = new Date();
    if (newDate > today) return; // Impede navegação para o futuro

    setCurrentDate(newDate);
  };

  // Efeito para buscar dados sempre que a data mudar
  useEffect(() => {
    fetchData();
  }, [fetchData]); // fetchData é recriado quando formattedCurrentDate muda

  useFocusEffect(
    useCallback(() => {
      const loadScreenData = async () => {
        // Busca os dados da refeição e do usuário em paralelo
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
    }, [fetchData]) // Depende de fetchData para sempre usar a data mais recente
  );

  const handleLogout = async () => {
    await AsyncStorage.removeItem('jwt_token');
    navigation.replace('Login'); // Destrói a pilha atual e joga pro Login
  };

  const handleDeleteMeal = async (mealId) => {
    Alert.alert(
      "Excluir Refeição",
      "Tem certeza que deseja apagar este registro?",
      [
        {
          text: "Não",
          style: "cancel"
        },
        { 
          text: "Sim", 
          onPress: async () => {
            try {
              await deleteMeal(mealId);
              fetchData(); // Re-busca os dados para atualizar a UI
            } catch (error) {
              Alert.alert("Erro ao Excluir", error.message || "Não foi possível apagar a refeição.");
            }
          }
        }
      ]
    );
  };

  const handleAddWater = async (amount) => {
    // Atualização otimista para feedback instantâneo
    const previousIntake = waterIntake;
    setWaterIntake(prev => prev + amount);

    try {
      const response = await addWater(amount);
      // Sincroniza com o valor real retornado pelo backend
      setWaterIntake(response.total);
    } catch (error) {
      // Reverte em caso de erro
      setWaterIntake(previousIntake);
      Alert.alert("Erro", "Não foi possível registrar a água. Tente novamente.");
    }
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00FF66" />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.greeting}>Olá, {userName}</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={() => navigation.navigate('Insights')}><Text style={styles.headerButtonText}>Gráficos</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.navigate('Goals')}><Text style={styles.headerButtonText}>Metas</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleLogout}><Text style={styles.logoutText}>Sair</Text></TouchableOpacity>
            </View>
          </View>
          <View style={styles.dateSelector}>
            <TouchableOpacity onPress={() => changeDay(-1)} style={styles.arrowButton}>
              <Text style={styles.arrowText}>{'<'}</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{getDisplayDate(currentDate)}</Text>
            <TouchableOpacity onPress={() => changeDay(1)} style={[styles.arrowButton, isFutureDate && styles.disabledArrow] } disabled={isFutureDate}>
              <Text style={styles.arrowText}>{'>'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>Seu desempenho hoje</Text>
        </View>

        {/* Seção de Progresso com as novas barras */}
        <View style={styles.progressSection}>
          <ProgressBar
            label="Calorias"
            consumed={summary?.total_calories}
            goal={goals?.goal_calories}
            unit="kcal"
          />
          <ProgressBar
            label="Proteínas"
            consumed={summary?.total_protein_g}
            goal={goals?.goal_protein_g}
          />
          <ProgressBar
            label="Carboidratos"
            consumed={summary?.total_carbs_g}
            goal={goals?.goal_carbs_g}
          />
          <ProgressBar
            label="Gorduras"
            consumed={summary?.total_fat_g}
            goal={goals?.goal_fat_g}
          />
        </View>

        {/* Seção de Hidratação */}
        <View style={styles.progressSection}>
          <ProgressBar
            label="Hidratação"
            consumed={waterIntake}
            goal={2500} // Meta fixa de 2.5L por enquanto
            unit="ml"
            color="#00BFFF" // Azul Neon
          />
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
                    {/* Badge de Confiança da IA */}
                    {item.confidence > 0 && (
                      <View style={styles.confidenceBadge}>
                        <Text style={styles.confidenceText}>{(item.confidence * 100).toFixed(0)}% IA</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.mealMacros}>{item.calories.toFixed(0)} kcal • P: {item.protein_g.toFixed(1)}g • C: {item.carbs_g.toFixed(1)}g • G: {item.fat_g.toFixed(1)}g</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDeleteMeal(item.id)} style={styles.deleteButton}>
                <Text style={styles.deleteButtonText}>Excluir</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>Nenhuma refeição registrada. Puxe para atualizar.</Text>}
          contentContainerStyle={{ paddingBottom: 120 }} // Espaço para não esconder o último item atrás do botão
          scrollEnabled={false} // Desabilita o scroll da FlatList, pois a tela inteira já é um ScrollView
        />
      </ScrollView>

      {/* Novo grupo de botões flutuantes */}
      <View style={styles.fabContainer}>
        <TouchableOpacity 
          style={styles.fabSecondary} 
          onPress={() => navigation.navigate('ManualEntry', { targetDate: formattedCurrentDate })}
        >
          <Text style={styles.fabSecondaryIcon}>✍️</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('Camera', { targetDate: formattedCurrentDate })}>
          <Text style={styles.fabIcon}>📷</Text>
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
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerButtonText: { color: '#00FF66', fontSize: 16, fontWeight: '500', marginRight: 15 },
  greeting: { color: '#FFFFFF', fontSize: 24, fontWeight: 'bold' },
  logoutText: { color: '#888888', fontSize: 16, },
  dateSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 10 },
  arrowButton: { padding: 10 },
  arrowText: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  disabledArrow: { opacity: 0.3 },
  title: { color: '#FFF', fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  subtitle: { color: '#888888', fontSize: 16, marginTop: 4 },
  progressSection: { backgroundColor: '#1E1E1E', borderRadius: 16, padding: 20, marginBottom: 25 },
  progressContainer: { marginBottom: 15 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '500' },
  progressPercentage: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },
  progressBarTrack: { height: 10, backgroundColor: '#333333', borderRadius: 5, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 5 },
  progressMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  progressMetaText: { color: '#888888', fontSize: 12 },
  // Estilos para Hidratação
  waterButtonsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 15 },
  waterButton: { borderColor: '#00BFFF', borderWidth: 1, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 25 },
  waterButtonText: { color: '#00BFFF', fontSize: 14, fontWeight: '600' },

  // Estilos da Lista
  listTitle: { color: '#FFF', fontSize: 18, marginBottom: 15, fontWeight: '600' },
  mealItemContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  mealItem: { flex: 1, backgroundColor: '#1E1E1E', padding: 15, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#00FF66' },
  deleteButton: { padding: 10, marginLeft: 10 },
  deleteButtonText: { color: '#FF6B6B', fontSize: 14, fontWeight: '500' },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  mealDesc: { color: '#FFF', fontSize: 16, fontWeight: '500', flex: 1, marginRight: 10, textTransform: 'capitalize' },
  confidenceBadge: { backgroundColor: 'rgba(0, 255, 102, 0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#00FF66' },
  confidenceText: { color: '#00FF66', fontSize: 10, fontWeight: 'bold' },
  mealMacros: { color: '#888888', fontSize: 13 },
  emptyText: { color: '#888888', textAlign: 'center', marginTop: 30, fontSize: 14 },
  // Estilos para o grupo de FABs
  fabContainer: { position: 'absolute', bottom: 30, right: 20, alignItems: 'center' },
  fab: { backgroundColor: '#00FF66', width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', shadowColor: "#00FF66", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },
  fabIcon: { color: '#121212', fontSize: 28 },
  fabSecondary: { backgroundColor: '#333', width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 15, elevation: 6 },
  fabSecondaryIcon: { fontSize: 20 },
  errorText: {
    color: '#FF6B6B',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20
  },
  retryButton: {
    backgroundColor: '#00FF66',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#121212',
    fontSize: 16,
    fontWeight: 'bold'
  }
});