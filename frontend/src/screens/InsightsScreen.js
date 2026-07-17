import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getWeeklySummary, getUserGoals } from '../services/api';

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

  useFocusEffect(
    useCallback(() => {
      const fetchData = async () => {
        setLoading(true);
        try {
          const [summaryData, goalsData] = await Promise.all([
            getWeeklySummary(),
            getUserGoals(),
          ]);
          setWeeklyData(summaryData.days || []);
          setGoals(goalsData);
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
});