import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BackButton from '../components/BackButton';
import { listSplits, createWorkout } from '../services/api';

export default function ChooseSplitScreen({ navigation }) {
  const [splits, setSplits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedSplitId, setExpandedSplitId] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const fetchSplits = async () => {
      try {
        const data = await listSplits();
        setSplits(data);
      } catch (error) {
        Alert.alert('Erro', 'Não foi possível carregar as divisões de treino.');
      } finally {
        setLoading(false);
      }
    };
    fetchSplits();
  }, []);

  const toggleSplit = (splitId) => {
    setExpandedSplitId((current) => (current === splitId ? null : splitId));
  };

  const handleStart = useCallback(async (workoutData) => {
    setCreating(true);
    try {
      const workout = await createWorkout(workoutData);
      navigation.replace('WorkoutSession', { workoutId: workout.id });
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível iniciar o treino.');
    } finally {
      setCreating(false);
    }
  }, [navigation]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00FF66" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <BackButton />
        <Text style={styles.headerTitle}>Iniciar Treino</Text>
      </View>

      <TouchableOpacity
        style={styles.freestyleCard}
        onPress={() => handleStart({})}
        disabled={creating}
      >
        <Ionicons name="shuffle" size={24} color="#121212" style={{ marginRight: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.freestyleTitle}>Freestyle</Text>
          <Text style={styles.freestyleSubtitle}>Sem roteiro — escolha os exercícios na hora</Text>
        </View>
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>Ou escolha uma divisão</Text>

      <FlatList
        data={splits}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.splitCard}>
            <TouchableOpacity style={styles.splitHeader} onPress={() => toggleSplit(item.id)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.splitName}>{item.name}</Text>
                {item.description && <Text style={styles.splitDescription}>{item.description}</Text>}
              </View>
              <Ionicons
                name={expandedSplitId === item.id ? 'chevron-up' : 'chevron-down'}
                size={20}
                color="#888"
              />
            </TouchableOpacity>

            {expandedSplitId === item.id && (
              <View style={styles.daysContainer}>
                {item.days.map((day) => (
                  <TouchableOpacity
                    key={day.id}
                    style={styles.dayRow}
                    onPress={() => handleStart({ split_day_id: day.id, name: day.name })}
                    disabled={creating}
                  >
                    <Text style={styles.dayName}>{day.name}</Text>
                    <Ionicons name="chevron-forward" size={18} color="#00FF66" />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 40 }}
      />

      {creating && (
        <View style={styles.creatingOverlay}>
          <ActivityIndicator size="large" color="#00FF66" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  freestyleCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#00FF66', borderRadius: 12, padding: 16, marginBottom: 25 },
  freestyleTitle: { color: '#121212', fontSize: 16, fontWeight: 'bold' },
  freestyleSubtitle: { color: '#121212', fontSize: 12, marginTop: 2, opacity: 0.8 },
  sectionLabel: { color: '#888', fontSize: 14, marginBottom: 12 },
  splitCard: { backgroundColor: '#1E1E1E', borderRadius: 12, marginBottom: 12, overflow: 'hidden' },
  splitHeader: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  splitName: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  splitDescription: { color: '#888', fontSize: 12, marginTop: 2 },
  daysContainer: { borderTopWidth: 1, borderTopColor: '#333' },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: '#2A2A2A' },
  dayName: { color: '#FFF', fontSize: 15 },
  creatingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
});
