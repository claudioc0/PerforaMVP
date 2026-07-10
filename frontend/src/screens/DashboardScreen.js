import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getTodaySummary } from '../services/api'; 
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

export default function DashboardScreen({ navigation }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());

  const formattedCurrentDate = useMemo(() => getFormattedDate(currentDate), [currentDate]);
  const isFutureDate = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return currentDate > today;
  }, [currentDate]);

  const fetchSummary = useCallback(async () => {
    setLoading(true); // Mostra o loading a cada nova busca
    try {
      const data = await getTodaySummary(formattedCurrentDate);
      setSummary(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [formattedCurrentDate]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSummary(); // fetchSummary já tem o setLoading(false) no finally
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
    fetchSummary();
  }, [fetchSummary]); // fetchSummary é recriado quando formattedCurrentDate muda

  useFocusEffect(
    useCallback(() => {
      // Ao focar na tela, busca os dados para a data que já está selecionada.
      // Isso garante que os dados sejam atualizados se uma nova refeição for adicionada.
      fetchSummary(); 
    }, [fetchSummary]) // Depende de fetchSummary para sempre usar a data mais recente
  );

  const handleLogout = async () => {
    await AsyncStorage.removeItem('jwt_token');
    navigation.replace('Login'); // Destrói a pilha atual e joga pro Login
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00FF66" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.greeting}>Olá, Claudio!</Text>
          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logoutText}>Sair</Text>
          </TouchableOpacity>
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
        <Text style={styles.subtitle}>Performance, reprogramada!</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Consumo Diário</Text>
        <View style={styles.macrosContainer}>
          <View style={styles.macroBox}>
            <Text style={styles.macroValue}>{(summary?.total_calories || 0).toFixed(0)}</Text>
            <Text style={styles.macroLabel}>Kcal</Text>
          </View>
          <View style={styles.macroBox}>
            <Text style={styles.macroValue}>{(summary?.total_protein_g || 0).toFixed(1)}g</Text>
            <Text style={styles.macroLabel}>Proteína</Text>
          </View>
          <View style={styles.macroBox}>
            <Text style={styles.macroValue}>{(summary?.total_carbs_g || 0).toFixed(1)}g</Text>
            <Text style={styles.macroLabel}>Carbo</Text>
          </View>
          <View style={styles.macroBox}>
            <Text style={styles.macroValue}>{(summary?.total_fat_g || 0).toFixed(1)}g</Text>
            <Text style={styles.macroLabel}>Gordura</Text>
          </View>
        </View>
      </View>

      <Text style={styles.listTitle}>Refeições de {getDisplayDate(currentDate)}</Text>
      <FlatList
        data={summary?.meals || []}
        keyExtractor={(item) => item.id.toString()}
        showsVerticalScrollIndicator={false}
        // Configuração do Pull-to-Refresh
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            tintColor="#00FF66" 
            colors={["#00FF66"]} 
            progressBackgroundColor="#1E1E1E"
          />
        }
        renderItem={({ item }) => (
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
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>Nenhuma refeição registrada. Puxe para atualizar.</Text>}
        contentContainerStyle={{ paddingBottom: 100 }} // Espaço para não esconder o último item atrás do botão
      />

      <TouchableOpacity 
        style={styles.fab} 
        onPress={() => navigation.navigate('Camera', { targetDate: formattedCurrentDate })}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', backgroundColor: '#121212' },
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60 },
  header: { marginBottom: 20 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logoutText: { color: '#00FF66', fontSize: 16, fontWeight: '500' },
  dateSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 4 },
  arrowButton: { padding: 10 },
  arrowText: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  disabledArrow: { opacity: 0.3 },
  greeting: { color: '#888', fontSize: 16 },
  title: { color: '#FFF', fontSize: 32, fontWeight: 'bold', letterSpacing: 1, textAlign: 'center' },
  subtitle: { color: '#00FF66', fontSize: 14, marginTop: 4 },
  card: { backgroundColor: '#1E1E1E', padding: 20, borderRadius: 16, marginBottom: 25, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 },
  cardTitle: { color: '#FFF', fontSize: 18, marginBottom: 15, fontWeight: '600' },
  macrosContainer: { flexDirection: 'row', justifyContent: 'space-between' },
  macroBox: { alignItems: 'center' },
  macroValue: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  macroLabel: { color: '#888', fontSize: 12, marginTop: 4 },
  listTitle: { color: '#FFF', fontSize: 18, marginBottom: 15, fontWeight: '600' },
  mealItem: { backgroundColor: '#1E1E1E', padding: 15, borderRadius: 12, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#00FF66' },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  mealDesc: { color: '#FFF', fontSize: 16, fontWeight: '500', flex: 1, marginRight: 10 },
  confidenceBadge: { backgroundColor: 'rgba(0, 255, 102, 0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#00FF66' },
  confidenceText: { color: '#00FF66', fontSize: 10, fontWeight: 'bold' },
  mealMacros: { color: '#888', fontSize: 13 },
  emptyText: { color: '#666', textAlign: 'center', marginTop: 30, fontSize: 14 },
  fab: { position: 'absolute', bottom: 30, right: 30, backgroundColor: '#00FF66', width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', shadowColor: "#00FF66", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },
  fabIcon: { color: '#121212', fontSize: 32, fontWeight: '300', marginTop: -4 }
});