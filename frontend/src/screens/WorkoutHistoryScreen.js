import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import BackButton from '../components/BackButton';
import { listWorkouts } from '../services/api';

function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function WorkoutHistoryScreen({ navigation }) {
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchWorkouts = useCallback(async () => {
    try {
      const data = await listWorkouts();
      setWorkouts(data);
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível carregar seu histórico de treinos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchWorkouts();
    }, [fetchWorkouts])
  );

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
      <Text style={styles.cardDate}>{formatDate(item.started_at)}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <BackButton />
        <Text style={styles.headerTitle}>Treinos</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#00FF66" style={{ marginTop: 40 }} />
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
  fab: { position: 'absolute', bottom: 30, right: 20, backgroundColor: '#00FF66', width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', shadowColor: '#00FF66', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },
});
