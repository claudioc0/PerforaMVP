import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import BackButton from '../components/BackButton';
import { useAppAlert } from '../components/AppAlertProvider';
import { getWorkout, addSetLog, updateSetLog, deleteSetLog, updateWorkout, deleteWorkout, getExerciseHistory, getSplitDayExercises } from '../services/api';

const REST_TARGET_KEY = '@perfora_rest_target_seconds';
const DEFAULT_REST_TARGET = 90;
const REST_STEP = 15;

function formatSeconds(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

// Componente próprio (memoizado) pra cada linha da lista de séries — antes,
// editWeight/editReps viviam no componente pai, e digitar em qualquer um dos
// dois recriava a função renderItem inline do FlatList a cada tecla, o que
// derruba a otimização do FlatList (ele passa a re-renderizar TODAS as
// linhas, não só a que está sendo editada). Aqui, o estado do campo em edição
// é local a cada linha — digitar só re-renderiza ESTA linha, e a função
// renderItem do componente pai (useCallback abaixo) nunca muda de
// identidade por causa disso.
const SetRow = React.memo(function SetRow({
  item,
  isEditing,
  saving,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}) {
  const [editWeight, setEditWeight] = useState(String(item.weight_kg));
  const [editReps, setEditReps] = useState(String(item.reps));

  // Reinicia os campos com os valores atuais toda vez que ESTA linha entra
  // em modo de edição (não a cada render) — sem isso, editar duas séries
  // diferentes em sequência reaproveitaria o texto digitado na anterior.
  useEffect(() => {
    if (isEditing) {
      setEditWeight(String(item.weight_kg));
      setEditReps(String(item.reps));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  if (isEditing) {
    return (
      <View style={styles.setCardEditing}>
        <Text style={styles.setExercise}>{item.exercise_name}</Text>
        <View style={styles.editInputsRow}>
          <TextInput
            style={styles.editInput}
            value={editWeight}
            onChangeText={setEditWeight}
            keyboardType="numeric"
            placeholder="kg"
            placeholderTextColor="#666"
          />
          <Text style={styles.editSeparator}>kg ×</Text>
          <TextInput
            style={styles.editInput}
            value={editReps}
            onChangeText={setEditReps}
            keyboardType="numeric"
            placeholder="reps"
            placeholderTextColor="#666"
          />
          <Text style={styles.editSeparator}>reps</Text>
        </View>
        <View style={styles.editActionsRow}>
          <TouchableOpacity onPress={onCancelEdit} style={styles.editActionButton}>
            <Ionicons name="close" size={22} color="#888" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onSaveEdit(editWeight, editReps)}
            style={styles.editActionButton}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#00FF66" /> : <Ionicons name="checkmark" size={22} color="#00FF66" />}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity style={styles.setCard} onPress={onStartEdit}>
      <View>
        <Text style={styles.setExercise}>{item.exercise_name}</Text>
        <Text style={styles.setMeta}>Série {item.set_number}</Text>
      </View>
      <View style={styles.setCardRight}>
        <Text style={styles.setValues}>{item.weight_kg}kg × {item.reps}</Text>
        <TouchableOpacity onPress={onDelete} style={styles.setDeleteButton}>
          <Ionicons name="trash-outline" size={17} color="#FF5555" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});

export default function WorkoutSessionScreen({ navigation, route }) {
  const { workoutId } = route.params;
  const showAlert = useAppAlert();
  const insets = useSafeAreaInsets();

  const [workout, setWorkout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const [pendingExercise, setPendingExercise] = useState(null);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [lastPerformance, setLastPerformance] = useState(null);
  const [suggestedExercises, setSuggestedExercises] = useState([]);

  const [restElapsed, setRestElapsed] = useState(0);
  const [restRunning, setRestRunning] = useState(false);
  const [restTarget, setRestTarget] = useState(DEFAULT_REST_TARGET);
  const restIntervalRef = useRef(null);
  const restStartRef = useRef(null);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const [editingSetId, setEditingSetId] = useState(null);
  const [savingSetEdit, setSavingSetEdit] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(REST_TARGET_KEY).then((saved) => {
      if (saved) setRestTarget(parseInt(saved, 10));
    });
  }, []);

  const adjustRestTarget = (delta) => {
    setRestTarget((prev) => {
      const next = Math.max(REST_STEP, prev + delta);
      AsyncStorage.setItem(REST_TARGET_KEY, String(next));
      return next;
    });
  };

  const fetchWorkout = useCallback(async () => {
    try {
      const data = await getWorkout(workoutId);
      setWorkout(data);

      if (data.split_day_id) {
        try {
          const suggestions = await getSplitDayExercises(data.split_day_id);
          setSuggestedExercises(suggestions);
        } catch (error) {
          // Sugestões são um atalho — sem elas, o usuário ainda pode usar o catálogo completo.
        }
      }
    } catch (error) {
      showAlert('Erro', error.message || 'Não foi possível carregar o treino.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [workoutId, navigation]);

  useEffect(() => {
    fetchWorkout();
  }, [fetchWorkout]);

  // O interval do descanso só existe enquanto a tela está em foco — antes,
  // ele era criado em startRestTimer() e só limpo no unmount, o que significa
  // que navegar pro ExercisePicker (empilha por cima, não desmonta esta tela)
  // deixava um setState por segundo rodando escondido. Aqui, restStartRef
  // guarda o timestamp real do início do descanso; o interval em si é
  // recriado/limpo pelo useFocusEffect abaixo, e sempre recalcula o elapsed a
  // partir do timestamp real — então voltar de outra tela mostra o tempo
  // correto mesmo sem o interval ter rodado enquanto estava fora de foco.
  const startRestTimer = () => {
    restStartRef.current = Date.now();
    setRestElapsed(0);
    setRestRunning(true);
  };

  const stopRestTimer = () => {
    restStartRef.current = null;
    setRestRunning(false);
  };

  useFocusEffect(
    useCallback(() => {
      if (restRunning && restStartRef.current) {
        restIntervalRef.current = setInterval(() => {
          setRestElapsed(Math.floor((Date.now() - restStartRef.current) / 1000));
        }, 1000);
      }
      return () => {
        if (restIntervalRef.current) {
          clearInterval(restIntervalRef.current);
          restIntervalRef.current = null;
        }
      };
    }, [restRunning])
  );

  const selectExercise = async (exercise) => {
    setPendingExercise(exercise);
    setWeight('');
    setReps('');
    setLastPerformance(null);

    try {
      const history = await getExerciseHistory(exercise.id, 1);
      const lastSets = history[0]?.sets;
      if (lastSets && lastSets.length > 0) {
        const lastSet = lastSets[lastSets.length - 1];
        setLastPerformance({ weight_kg: lastSet.weight_kg, reps: lastSet.reps, date: history[0].started_at });
      }
    } catch (error) {
      // Referência de histórico é só um "nice to have" — não bloqueia o registro da série.
    }
  };

  const handleSelectSuggested = (suggestion) => {
    selectExercise({
      id: suggestion.exercise_id,
      name: suggestion.name,
      muscle_group: suggestion.muscle_group,
    });
  };

  const handleOpenPicker = () => {
    navigation.navigate('ExercisePicker', { onSelect: selectExercise });
  };

  const handleSaveSet = async () => {
    if (!weight || !reps) {
      showAlert('Atenção', 'Preencha peso e repetições.');
      return;
    }

    setSaving(true);
    try {
      const restSecondsTaken = restRunning ? restElapsed : undefined;
      const newSet = await addSetLog(workoutId, {
        exercise_id: pendingExercise.id,
        weight_kg: parseFloat(weight),
        reps: parseInt(reps, 10),
        rest_seconds: restSecondsTaken,
      });

      setWorkout((prev) => ({
        ...prev,
        sets: [
          ...prev.sets,
          { ...newSet, exercise_name: pendingExercise.name, muscle_group: pendingExercise.muscle_group },
        ],
      }));

      setPendingExercise(null);
      setWeight('');
      setReps('');
      setLastPerformance(null);
      startRestTimer();
    } catch (error) {
      // error.message já vem específico ("Sem conexão...", "A conexão demorou
      // demais...") quando a falha é de rede/timeout — sem sinal na academia,
      // por exemplo. O peso/reps digitados NÃO são limpos aqui (só no try,
      // acima), então o usuário pode tentar salvar de novo sem redigitar nada.
      showAlert('Erro', error.message || 'Não foi possível registrar a série.');
    } finally {
      setSaving(false);
    }
  };

  const handleFinishWorkout = async () => {
    showAlert('Finalizar Treino', 'Tem certeza que deseja finalizar este treino?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Finalizar',
        onPress: async () => {
          setFinishing(true);
          try {
            await updateWorkout(workoutId, { finished: true });
            stopRestTimer();
            navigation.goBack();
          } catch (error) {
            showAlert('Erro', error.message || 'Não foi possível finalizar o treino.');
          } finally {
            setFinishing(false);
          }
        },
      },
    ]);
  };

  const startEditName = () => {
    setNameInput(workout.name || '');
    setEditingName(true);
  };

  const cancelEditName = () => setEditingName(false);

  const saveWorkoutName = async () => {
    try {
      const updated = await updateWorkout(workoutId, { name: nameInput.trim() || null });
      setWorkout((prev) => ({ ...prev, name: updated.name }));
      setEditingName(false);
    } catch (error) {
      showAlert('Erro', error.message || 'Não foi possível renomear o treino.');
    }
  };

  const handleDeleteWorkout = () => {
    showAlert(
      'Excluir Treino',
      'Essa ação não pode ser desfeita. Deseja excluir este treino e todas as suas séries?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteWorkout(workoutId);
              navigation.goBack();
            } catch (error) {
              showAlert('Erro', error.message || 'Não foi possível excluir o treino.');
            }
          },
        },
      ]
    );
  };

  const startEditSet = useCallback((item) => {
    setEditingSetId(item.id);
  }, []);

  const cancelEditSet = useCallback(() => setEditingSetId(null), []);

  const saveEditSet = useCallback(async (weightStr, repsStr) => {
    if (!weightStr || !repsStr) {
      showAlert('Atenção', 'Preencha peso e repetições.');
      return;
    }
    setSavingSetEdit(true);
    try {
      const updated = await updateSetLog(workoutId, editingSetId, {
        weight_kg: parseFloat(weightStr),
        reps: parseInt(repsStr, 10),
      });
      setWorkout((prev) => ({
        ...prev,
        sets: prev.sets.map((s) => (s.id === editingSetId ? { ...s, weight_kg: updated.weight_kg, reps: updated.reps } : s)),
      }));
      setEditingSetId(null);
    } catch (error) {
      showAlert('Erro', error.message || 'Não foi possível atualizar a série.');
    } finally {
      setSavingSetEdit(false);
    }
  }, [workoutId, editingSetId, showAlert]);

  const confirmDeleteSet = useCallback((setId) => {
    showAlert('Excluir Série', 'Deseja excluir esta série?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSetLog(workoutId, setId);
            setWorkout((prev) => ({ ...prev, sets: prev.sets.filter((s) => s.id !== setId) }));
            setEditingSetId((current) => (current === setId ? null : current));
          } catch (error) {
            showAlert('Erro', error.message || 'Não foi possível excluir a série.');
          }
        },
      },
    ]);
  }, [workoutId, showAlert]);

  const renderSetItem = useCallback(({ item }) => (
    <SetRow
      item={item}
      isEditing={editingSetId === item.id}
      saving={savingSetEdit}
      onStartEdit={() => startEditSet(item)}
      onCancelEdit={cancelEditSet}
      onSaveEdit={saveEditSet}
      onDelete={() => confirmDeleteSet(item.id)}
    />
  ), [editingSetId, savingSetEdit, startEditSet, cancelEditSet, saveEditSet, confirmDeleteSet]);

  if (loading || !workout) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00FF66" />
      </View>
    );
  }

  const isFinished = workout.is_finished;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
      <View style={styles.headerRow}>
        <BackButton />
        {editingName ? (
          <TextInput
            style={styles.headerTitleInput}
            value={nameInput}
            onChangeText={setNameInput}
            placeholder="Nome do treino"
            placeholderTextColor="#666"
            autoFocus
          />
        ) : (
          <Text style={styles.headerTitle}>{workout.name || 'Treino'}</Text>
        )}
        <View style={styles.headerActions}>
          {editingName ? (
            <>
              <TouchableOpacity onPress={cancelEditName} style={styles.headerIconButton}>
                <Ionicons name="close" size={22} color="#888" />
              </TouchableOpacity>
              <TouchableOpacity onPress={saveWorkoutName} style={styles.headerIconButton}>
                <Ionicons name="checkmark" size={22} color="#00FF66" />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity onPress={startEditName} style={styles.headerIconButton}>
                <Ionicons name="pencil" size={19} color="#888" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDeleteWorkout} style={styles.headerIconButton}>
                <Ionicons name="trash-outline" size={19} color="#FF5555" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {!isFinished && (
        <View style={styles.restTargetRow}>
          <Text style={styles.restTargetLabel}>Meta de descanso</Text>
          <View style={styles.restTargetControls}>
            <TouchableOpacity onPress={() => adjustRestTarget(-REST_STEP)}>
              <Ionicons name="remove-circle-outline" size={22} color="#888" />
            </TouchableOpacity>
            <Text style={styles.restTargetValue}>{restTarget}s</Text>
            <TouchableOpacity onPress={() => adjustRestTarget(REST_STEP)}>
              <Ionicons name="add-circle-outline" size={22} color="#888" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {restRunning && !isFinished && (
        <View style={[styles.restBanner, restElapsed >= restTarget && styles.restBannerAchieved]}>
          <Ionicons name={restElapsed >= restTarget ? 'checkmark-circle' : 'time'} size={18} color="#00FF66" />
          <Text style={styles.restText}>
            Descanso: {formatSeconds(restElapsed)}
            {restElapsed >= restTarget ? ' — Meta atingida!' : ` / ${formatSeconds(restTarget)}`}
          </Text>
        </View>
      )}

      <FlatList
        data={workout.sets}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderSetItem}
        ListEmptyComponent={<Text style={styles.emptyText}>Nenhuma série registrada ainda.</Text>}
        contentContainerStyle={{ paddingBottom: 20 }}
      />

      {!isFinished && (
        <>
          {!pendingExercise && suggestedExercises.length > 0 && (
            <View style={styles.suggestedContainer}>
              <Text style={styles.suggestedLabel}>Sugeridos pra hoje</Text>
              <View style={styles.suggestedChipsRow}>
                {suggestedExercises.map((suggestion) => (
                  <TouchableOpacity
                    key={suggestion.exercise_id}
                    style={styles.suggestedChip}
                    onPress={() => handleSelectSuggested(suggestion)}
                  >
                    <Text style={styles.suggestedChipText}>{suggestion.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {pendingExercise ? (
            <View style={styles.pendingCard}>
              <Text style={styles.pendingTitle}>{pendingExercise.name}</Text>
              {lastPerformance && (
                <Text style={styles.lastPerformanceText}>
                  Última vez: {lastPerformance.weight_kg}kg × {lastPerformance.reps}
                </Text>
              )}
              <View style={styles.pendingInputsRow}>
                <View style={styles.pendingInputGroup}>
                  <Text style={styles.pendingLabel}>Peso (kg)</Text>
                  <TextInput
                    style={styles.pendingInput}
                    value={weight}
                    onChangeText={setWeight}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#666"
                  />
                </View>
                <View style={styles.pendingInputGroup}>
                  <Text style={styles.pendingLabel}>Reps</Text>
                  <TextInput
                    style={styles.pendingInput}
                    value={reps}
                    onChangeText={setReps}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#666"
                  />
                </View>
              </View>
              <View style={styles.pendingActionsRow}>
                <TouchableOpacity style={styles.cancelSetButton} onPress={() => { setPendingExercise(null); setLastPerformance(null); }}>
                  <Text style={styles.cancelSetText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveSetButton} onPress={handleSaveSet} disabled={saving}>
                  {saving ? <ActivityIndicator color="#121212" /> : <Text style={styles.saveSetText}>Salvar Série</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.addSetButton} onPress={handleOpenPicker}>
              <Ionicons name="add-circle" size={20} color="#00FF66" style={{ marginRight: 8 }} />
              <Text style={styles.addSetText}>
                {suggestedExercises.length > 0 ? 'Outro Exercício' : 'Adicionar Série'}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.finishButton} onPress={handleFinishWorkout} disabled={finishing}>
            {finishing ? <ActivityIndicator color="#121212" /> : <Text style={styles.finishText}>Finalizar Treino</Text>}
          </TouchableOpacity>
        </>
      )}
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  headerTitleInput: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: 'bold', textAlign: 'center', borderBottomWidth: 1, borderBottomColor: '#00FF66', paddingVertical: 2, marginHorizontal: 8 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerIconButton: { padding: 6, marginLeft: 2 },
  restTargetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  restTargetLabel: { color: '#888', fontSize: 14 },
  restTargetControls: { flexDirection: 'row', alignItems: 'center' },
  restTargetValue: { color: '#FFF', fontSize: 15, fontWeight: '600', marginHorizontal: 10, minWidth: 40, textAlign: 'center' },
  restBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,255,102,0.1)', borderWidth: 1, borderColor: '#00FF66', borderRadius: 10, padding: 10, marginBottom: 15 },
  restBannerAchieved: { backgroundColor: 'rgba(0,255,102,0.25)', borderWidth: 2 },
  restText: { color: '#00FF66', fontSize: 15, fontWeight: '600', marginLeft: 8 },
  setCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1E1E1E', borderRadius: 10, padding: 15, marginBottom: 10 },
  setExercise: { color: '#FFF', fontSize: 16, fontWeight: '500' },
  setMeta: { color: '#888', fontSize: 12, marginTop: 2 },
  setCardRight: { flexDirection: 'row', alignItems: 'center' },
  setValues: { color: '#00FF66', fontSize: 16, fontWeight: '600' },
  setDeleteButton: { padding: 6, marginLeft: 10 },
  setCardEditing: { backgroundColor: '#1E1E1E', borderRadius: 10, padding: 15, marginBottom: 10, borderWidth: 1, borderColor: '#00FF66' },
  editInputsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 12 },
  editInput: { backgroundColor: '#121212', color: '#FFF', borderRadius: 8, padding: 10, fontSize: 15, borderWidth: 1, borderColor: '#333', width: 70, textAlign: 'center' },
  editSeparator: { color: '#888', fontSize: 13, marginHorizontal: 8 },
  editActionsRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  editActionButton: { padding: 6, marginLeft: 12 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 30, fontSize: 14 },
  suggestedContainer: { marginTop: 10, marginBottom: 5 },
  suggestedLabel: { color: '#888', fontSize: 13, marginBottom: 8 },
  suggestedChipsRow: { flexDirection: 'row', flexWrap: 'wrap' },
  suggestedChip: { backgroundColor: '#1E1E1E', borderWidth: 1, borderColor: '#333', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, marginRight: 8, marginBottom: 8 },
  suggestedChipText: { color: '#00FF66', fontSize: 13, fontWeight: '600' },
  addSetButton: { flexDirection: 'row', backgroundColor: '#1E1E1E', borderWidth: 1, borderColor: '#00FF66', padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  addSetText: { color: '#00FF66', fontSize: 16, fontWeight: 'bold' },
  pendingCard: { backgroundColor: '#1E1E1E', borderRadius: 12, padding: 16, marginTop: 10 },
  pendingTitle: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  lastPerformanceText: { color: '#888', fontSize: 13, marginBottom: 12 },
  pendingInputsRow: { flexDirection: 'row', marginBottom: 15 },
  pendingInputGroup: { flex: 1, marginRight: 10 },
  pendingLabel: { color: '#888', fontSize: 13, marginBottom: 6 },
  pendingInput: { backgroundColor: '#121212', color: '#FFF', borderRadius: 8, padding: 12, fontSize: 16, borderWidth: 1, borderColor: '#333' },
  pendingActionsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cancelSetButton: { flex: 1, padding: 14, alignItems: 'center', marginRight: 10 },
  cancelSetText: { color: '#888', fontSize: 15 },
  saveSetButton: { flex: 1, backgroundColor: '#00FF66', padding: 14, borderRadius: 10, alignItems: 'center' },
  saveSetText: { color: '#121212', fontSize: 15, fontWeight: 'bold' },
  finishButton: { backgroundColor: '#333', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 15 },
  finishText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
});
