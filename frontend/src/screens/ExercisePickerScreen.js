import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import BackButton from '../components/BackButton';
import { useAppAlert } from '../components/AppAlertProvider';
import { listExercises, createExercise } from '../services/api';

export default function ExercisePickerScreen({ navigation, route }) {
  const showAlert = useAppAlert();
  const insets = useSafeAreaInsets();
  const { onSelect } = route.params;

  const [query, setQuery] = useState('');
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const debounceRef = useRef(null);

  const fetchExercises = useCallback(async (search) => {
    setLoading(true);
    try {
      const data = await listExercises(search);
      setExercises(data);
    } catch (error) {
      showAlert('Erro', 'Não foi possível buscar o catálogo de exercícios.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Um só efeito cuida da busca inicial E da busca com debounce — antes, um
  // useEffect rodava fetchExercises() de imediato na montagem e ESTE efeito
  // (que também dispara na montagem, já que query começa vazia) rodava de
  // novo 300ms depois com o mesmo argumento: o catálogo inteiro baixava duas
  // vezes toda vez que o picker abria. Na primeira execução, busca na hora,
  // sem esperar o debounce; nas próximas (usuário digitando), debounce normal.
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      fetchExercises();
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchExercises(query || undefined);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, fetchExercises]);

  const handleSelect = (exercise) => {
    onSelect(exercise);
    navigation.goBack();
  };

  const handleCreateCustom = async () => {
    setCreating(true);
    try {
      const exercise = await createExercise({ name: query.trim() });
      onSelect(exercise);
      navigation.goBack();
    } catch (error) {
      showAlert('Erro', 'Não foi possível criar o exercício.');
    } finally {
      setCreating(false);
    }
  };

  const showCreateOption = query.trim().length > 0 && !loading && !exercises.some(
    (e) => e.name.trim().toLowerCase() === query.trim().toLowerCase()
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
      <View style={styles.headerRow}>
        <BackButton />
        <Text style={styles.headerTitle}>Escolher Exercício</Text>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#888" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar exercício..."
          placeholderTextColor="#666"
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#00FF66" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={exercises}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => handleSelect(item)}>
              <View>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta}>{item.muscle_group}{item.equipment ? ` • ${item.equipment}` : ''}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#888" />
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>Nenhum exercício encontrado.</Text>}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}

      {showCreateOption && (
        <TouchableOpacity style={styles.createButton} onPress={handleCreateCustom} disabled={creating}>
          {creating ? (
            <ActivityIndicator color="#121212" />
          ) : (
            <>
              <Ionicons name="add-circle" size={20} color="#121212" style={{ marginRight: 8 }} />
              <Text style={styles.createButtonText}>Criar "{query.trim()}"</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E1E1E', borderRadius: 10, paddingHorizontal: 15, paddingVertical: 12, marginBottom: 20, borderWidth: 1, borderColor: '#333' },
  searchInput: { flex: 1, color: '#FFF', fontSize: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1E1E1E', borderRadius: 10, padding: 15, marginBottom: 10 },
  rowName: { color: '#FFF', fontSize: 16, fontWeight: '500' },
  rowMeta: { color: '#888', fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 30, fontSize: 14 },
  createButton: { flexDirection: 'row', backgroundColor: '#00FF66', padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  createButtonText: { color: '#121212', fontSize: 16, fontWeight: 'bold' },
});
