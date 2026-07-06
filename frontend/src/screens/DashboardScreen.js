import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getTodaySummary } from '../services/api'; 

export default function DashboardScreen({ navigation }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const data = await getTodaySummary();
      setSummary(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchSummary();
    }, [])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00FF66" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Olá, Claudio!</Text>
        <Text style={styles.title}>Perfora</Text>
        <Text style={styles.subtitle}>Performance, reprogramada!</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Consumo Diário</Text>
        <View style={styles.macrosContainer}>
          <View style={styles.macroBox}>
            <Text style={styles.macroValue}>{summary?.total_calories || 0}</Text>
            <Text style={styles.macroLabel}>Kcal</Text>
          </View>
          <View style={styles.macroBox}>
            <Text style={styles.macroValue}>{summary?.total_protein_g || 0}g</Text>
            <Text style={styles.macroLabel}>Proteína</Text>
          </View>
          <View style={styles.macroBox}>
            <Text style={styles.macroValue}>{summary?.total_carbs_g || 0}g</Text>
            <Text style={styles.macroLabel}>Carbo</Text>
          </View>
          <View style={styles.macroBox}>
            <Text style={styles.macroValue}>{summary?.total_fat_g || 0}g</Text>
            <Text style={styles.macroLabel}>Gordura</Text>
          </View>
        </View>
      </View>

      <Text style={styles.listTitle}>Refeições de Hoje</Text>
      <FlatList
        data={summary?.meals || []}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.mealItem}>
            <Text style={styles.mealDesc}>{item.description}</Text>
            <Text style={styles.mealMacros}>{item.calories} kcal • P: {item.protein_g}g</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>Nenhuma refeição registrada hoje.</Text>}
      />

      <TouchableOpacity 
        style={styles.fab} 
        onPress={() => navigation.navigate('Camera')}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', backgroundColor: '#121212' },
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60 },
  header: { marginBottom: 30 },
  greeting: { color: '#888', fontSize: 16 },
  title: { color: '#FFF', fontSize: 32, fontWeight: 'bold' },
  subtitle: { color: '#00FF66', fontSize: 14, marginTop: 4 },
  card: { backgroundColor: '#1E1E1E', padding: 20, borderRadius: 16, marginBottom: 30 },
  cardTitle: { color: '#FFF', fontSize: 18, marginBottom: 15, fontWeight: '600' },
  macrosContainer: { flexDirection: 'row', justifyContent: 'space-between' },
  macroBox: { alignItems: 'center' },
  macroValue: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  macroLabel: { color: '#888', fontSize: 12, marginTop: 4 },
  listTitle: { color: '#FFF', fontSize: 18, marginBottom: 15, fontWeight: '600' },
  mealItem: { backgroundColor: '#1E1E1E', padding: 15, borderRadius: 12, marginBottom: 10 },
  mealDesc: { color: '#FFF', fontSize: 16, marginBottom: 4 },
  mealMacros: { color: '#00FF66', fontSize: 14 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 20 },
  fab: { position: 'absolute', bottom: 30, right: 30, backgroundColor: '#00FF66', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  fabIcon: { color: '#121212', fontSize: 32, fontWeight: 'bold', marginTop: -4 }
});