import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Alert, TextInput, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getWeeklySummary, getUserGoals, getWeightHistory, logWeight } from '../services/api';

// --- Componente de Gráfico de Barras Customizado ---
const WeeklyBarChart = ({ data, goal, label }) => {
  if (!data || data.length === 0 || !goal) {
    return <View style={[styles.chartContainer, styles.chartPlaceholder]}><Text style={styles.placeholderText}>Dados insuficientes para exibir o gráfico.</Text></View>;
  }

  const safeGoal = goal > 0 ? goal : 1;

  return (
    <View>
      <Text style={styles.chartLabel}>{label}</Text>
      <View style={styles.chartContainer}>
        {data.map((day, index) => {
          const percentage = (day.calories / safeGoal) * 100;
          const barHeight = Math.min(percentage, 100); // Limita a altura visual em 100%
          const hasExceeded = percentage > 100;

          return (
            <View key={index} style={styles.barWrapper}>
              <View style={[styles.bar, { height: `${barHeight}%`, backgroundColor: hasExceeded ? '#FF6B6B' : '#00FF66' }]} />
              <Text style={styles.dayLabel}>{day.day_name.charAt(0)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

export default function InsightsScreen() {
  const [weeklyData, setWeeklyData] = useState([]);
  const [goals, setGoals] = useState(null);
  const [loading, setLoading] = useState(true);
  // Novos estados para Evolução Corporal
  const [weightHistory, setWeightHistory] = useState([]);
  const [currentWeightInput, setCurrentWeightInput] = useState('');
  const [loggingWeight, setLoggingWeight] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const fetchData = async () => {
        setLoading(true);
        try {
          const [summaryData, goalsData] = await Promise.all([
            getWeeklySummary(),
            getUserGoals(), 
          ]);
          const weightHistoryData = await getWeightHistory(); // Busca o histórico de peso
          setWeeklyData(summaryData.days || []);
          setGoals(goalsData);
          setWeightHistory(weightHistoryData || []);
        } catch (error) {
          Alert.alert("Erro", "Não foi possível carregar os insights. Tente novamente.");
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    }, [])
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
    const weight = parseFloat(currentWeightInput);
    if (isNaN(weight) || weight <= 0) {
      Alert.alert("Erro", "Por favor, insira um peso válido.");
      return;
    }

    setLoggingWeight(true);
    try {
      await logWeight({ weight });
      Alert.alert("Sucesso", "Peso registrado!");
      setCurrentWeightInput('');
      // Atualiza o histórico de peso após o registro
      const updatedHistory = await getWeightHistory();
      setWeightHistory(updatedHistory);
    } catch (error) {
      Alert.alert("Erro", error.message || "Não foi possível registrar o peso.");
    } finally {
      setLoggingWeight(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00FF66" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.headerTitle}>Desempenho Semanal</Text>

      <View style={styles.card}>
        <WeeklyBarChart data={weeklyData} goal={goals?.goal_calories} label="Consumo de Calorias (vs. Meta)" />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Média da Semana</Text>
        <View style={styles.avgContainer}>
          <View style={styles.avgBox}>
            <Text style={styles.avgValue}>{weeklyAverages.avgCalories.toFixed(0)}</Text>
            <Text style={styles.avgLabel}>Média de Kcal / dia</Text>
          </View>
          <View style={styles.avgBox}>
            <Text style={styles.avgValue}>{weeklyAverages.avgProtein.toFixed(1)}g</Text>
            <Text style={styles.avgLabel}>Média de Proteína / dia</Text>
          </View>
        </View>
      </View>

      {/* Seção de Evolução Corporal */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Evolução Corporal</Text>

        {/* Formulário de Registro de Peso */}
        <View style={styles.weightInputContainer}>
          <TextInput
            style={styles.weightInput}
            placeholder="Peso de hoje (kg)"
            placeholderTextColor="#666"
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
              <ActivityIndicator color="#121212" />
            ) : (
              <Text style={styles.logWeightButtonText}>Registrar</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Histórico de Peso */}
        {weightHistory.length > 0 ? (
          <View style={styles.weightHistoryContainer}>
            <Text style={styles.weightHistoryLabel}>Últimos Registros:</Text>
            <View style={styles.weightTagsContainer}>
              {weightHistory.slice(-5).map((log, index, arr) => {
                const prevLog = arr[index - 1];
                let indicator = '';
                let indicatorColor = '#888'; // Cor padrão

                if (prevLog) {
                  if (log.weight < prevLog.weight) { indicator = '⬇️'; indicatorColor = '#00FF66'; } // Verde para perda
                  else if (log.weight > prevLog.weight) { indicator = '⬆️'; indicatorColor = '#FF6B6B'; } // Vermelho para ganho
                }
                return (
                  <View key={log.id} style={[styles.weightTag, { borderColor: indicatorColor }]}>
                    <Text style={styles.weightTagText}>
                      {new Date(log.date).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}: {log.weight.toFixed(1)}kg {indicator}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <Text style={styles.emptyText}>Nenhum registro de peso ainda.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  headerTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 30 },
  card: { backgroundColor: '#1E1E1E', borderRadius: 16, padding: 20, marginBottom: 20 },
  cardTitle: { color: '#FFF', fontSize: 18, fontWeight: '600', marginBottom: 20 },
  
  // Estilos do Gráfico
  chartLabel: { color: '#888', fontSize: 14, marginBottom: 15, textAlign: 'center' },
  chartContainer: {
    height: 200,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingBottom: 5,
  },
  chartPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#666',
  },
  barWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  bar: {
    width: '50%',
    borderRadius: 4,
  },
  dayLabel: {
    color: '#888',
    fontSize: 12,
    marginTop: 8,
  },

  // Estilos do Resumo
  avgContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  avgBox: {
    alignItems: 'center',
  },
  avgValue: {
    color: '#FFF',
    fontSize: 26,
    fontWeight: 'bold',
  },
  avgLabel: {
    color: '#888',
    fontSize: 14,
    marginTop: 5,
  },
  // Novos estilos para Evolução Corporal
  weightInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  weightInput: {
    flex: 1,
    backgroundColor: '#333',
    color: '#FFF',
    padding: 12,
    borderRadius: 10,
    fontSize: 16,
    marginRight: 10,
  },
  logWeightButton: {
    backgroundColor: '#00FF66',
    padding: 12,
    borderRadius: 10,
  },
  logWeightButtonText: {
    color: '#121212',
    fontWeight: 'bold',
  },
  weightHistoryContainer: { marginTop: 10 },
  weightHistoryLabel: { color: '#FFF', fontSize: 14, marginBottom: 10 },
  weightTagsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
  weightTag: { backgroundColor: '#1E1E1E', borderWidth: 1, borderColor: '#888', borderRadius: 15, paddingVertical: 8, paddingHorizontal: 12, marginRight: 8, marginBottom: 8 },
  weightTagText: { color: '#FFF', fontSize: 13 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 10, fontSize: 14 },
});