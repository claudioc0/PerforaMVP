import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import BackButton from '../components/BackButton';
import { useAppAlert } from '../components/AppAlertProvider';
import { listExercises, createExercise } from '../services/api';
import { useTheme } from '../theme/ThemeContext';
import { ROUTES } from '../navigation/routes';

export default function ExercisePickerScreen({ navigation }) {
  const showAlert = useAppAlert();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

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
    } catch {
      showAlert('Erro', 'Não foi possível buscar o catálogo de exercícios.');
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

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

  // Devolve o exercício escolhido como parâmetro de navegação serializável
  // (id/name/muscle_group), em vez de uma função `onSelect` — funções não
  // sobrevivem à serialização de estado de navegação (persistência entre
  // sessões, deep linking): se o picker fosse restaurado depois de o app
  // ficar em background, o callback original simplesmente não existiria mais.
  // `navigate` para uma rota já existente na pilha (WorkoutSession, abaixo
  // deste picker) volta pra ela mesclando os novos params, sem precisar de
  // goBack() separado.
  const handleSelect = (exercise) => {
    navigation.navigate(ROUTES.WORKOUT_SESSION, {
      selectedExercise: { id: exercise.id, name: exercise.name, muscle_group: exercise.muscle_group },
    });
  };

  const handleCreateCustom = async () => {
    setCreating(true);
    try {
      const exercise = await createExercise({ name: query.trim() });
      navigation.navigate(ROUTES.WORKOUT_SESSION, {
        selectedExercise: { id: exercise.id, name: exercise.name, muscle_group: exercise.muscle_group },
      });
    } catch {
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
        <Ionicons name="search" size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar exercício..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          accessibilityLabel="Buscar exercício"
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
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
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>Nenhum exercício encontrado.</Text>}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}

      {showCreateOption && (
        <TouchableOpacity style={styles.createButton} onPress={handleCreateCustom} disabled={creating}>
          {creating ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <>
              <Ionicons name="add-circle" size={20} color={colors.onPrimary} style={{ marginRight: 8 }} />
              <Text style={styles.createButtonText}>Criar &quot;{query.trim()}&quot;</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 60 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  headerTitle: { flex: 1, color: colors.white, fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 15, paddingVertical: 12, marginBottom: 20, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.white, fontSize: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 10, padding: 15, marginBottom: 10 },
  rowName: { color: colors.white, fontSize: 16, fontWeight: '500' },
  rowMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  emptyText: { color: colors.textSecondary, textAlign: 'center', marginTop: 30, fontSize: 14 },
  createButton: { flexDirection: 'row', backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  createButtonText: { color: colors.onPrimary, fontSize: 16, fontWeight: 'bold' },
});
