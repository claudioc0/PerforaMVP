import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { updateUserGoals, calculateSmartGoals } from '../services/api';
import BackButton from '../components/BackButton';
import { useAppAlert } from '../components/AppAlertProvider';
import { useUserGoals } from '../contexts/UserContext';

// Componente para botões de seleção customizados
const OptionSelector = ({ options, selectedValue, onSelect, style }) => (
  <View style={[styles.optionContainer, style]}>
    {options.map((option) => (
      <TouchableOpacity
        key={option.value}
        style={[
          styles.optionButton,
          selectedValue === option.value && styles.optionButtonSelected,
        ]}
        onPress={() => onSelect(option.value)}
      >
        <Text
          style={[
            styles.optionButtonText,
            selectedValue === option.value && styles.optionButtonTextSelected,
          ]}
        >
          {option.label}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
);

export default function GoalsScreen({ navigation }) {
  const showAlert = useAppAlert();
  const insets = useSafeAreaInsets();
  const { refreshGoals, setGoalsLocally } = useUserGoals();
  // Estado para metas manuais
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  // Estado para a calculadora
  const [modalVisible, setModalVisible] = useState(false);
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('M');
  const [activityLevel, setActivityLevel] = useState('1.2');
  const [goal, setGoal] = useState('maintain');

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);

  // Extraído de dentro do useFocusEffect pra poder ser chamado de novo pelo
  // botão "Tentar novamente" — antes, se a busca falhasse, o alerta de erro
  // era a ÚNICA reação: fechá-lo deixava a tela cair no formulário normal com
  // os 4 campos em branco (o estado nunca foi preenchido). Nada impedia
  // tocar "Salvar Metas" ali — parseFloat('') || 0 manda 0/0/0/0 pro backend,
  // apagando as metas reais do usuário sem aviso nenhum. Agora um erro de
  // carregamento mantém uma tela de erro dedicada (sem formulário, sem botão
  // de salvar) até a busca ter sucesso.
  const loadGoals = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const goals = await refreshGoals();
      setCalories(goals.goal_calories?.toString() || '');
      setProtein(goals.goal_protein_g?.toString() || '');
      setCarbs(goals.goal_carbs_g?.toString() || '');
      setFat(goals.goal_fat_g?.toString() || '');
    } catch (error) {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [refreshGoals]);

  useFocusEffect(
    useCallback(() => {
      loadGoals();
    }, [loadGoals])
  );

  const handleSaveGoals = async () => {
    setSaving(true);
    try {
      const goalsData = {
        goal_calories: parseFloat(calories) || 0,
        goal_protein_g: parseFloat(protein) || 0,
        goal_carbs_g: parseFloat(carbs) || 0,
        goal_fat_g: parseFloat(fat) || 0,
      };
      await updateUserGoals(goalsData);
      // Propaga na hora pro Dashboard/Insights, sem esperar uma nova busca de rede.
      setGoalsLocally(goalsData);
      showAlert('Sucesso!', 'Suas metas foram atualizadas.');
      navigation.goBack();
    } catch (error) {
      showAlert('Erro ao Salvar', error.message || 'Não foi possível atualizar as metas.');
    } finally {
      setSaving(false);
    }
  };

  const handleCalculateGoals = async () => {
    if (!weight || !height || !age) {
      showAlert('Atenção', 'Por favor, preencha peso, altura e idade.');
      return;
    }
    setCalculating(true);
    try {
      const physicalData = {
        weight: parseFloat(weight),
        height: parseFloat(height),
        age: parseInt(age, 10),
        gender,
        activity_level: parseFloat(activityLevel),
        goal,
      };

      const result = await calculateSmartGoals(physicalData);
      const { goals: newGoals } = result;

      // Atualiza os inputs da tela principal com os novos valores
      setCalories(newGoals.goal_calories.toString());
      setProtein(newGoals.goal_protein_g.toString());
      setCarbs(newGoals.goal_carbs_g.toString());
      setFat(newGoals.goal_fat_g.toString());
      // Propaga na hora pro Dashboard/Insights, sem esperar uma nova busca de rede.
      setGoalsLocally(newGoals);

      setModalVisible(false); // Fecha o modal
      showAlert('Sucesso!', 'Suas metas foram calculadas e aplicadas.');

    } catch (error) {
      showAlert('Erro no Cálculo', error.message || 'Não foi possível calcular as metas.');
    } finally {
      setCalculating(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#00FF66" /></View>;
  }

  if (loadError) {
    return (
      <View style={styles.center}>
        <View style={[styles.errorHeaderRow, { top: insets.top + 20 }]}>
          <BackButton />
        </View>
        <Ionicons name="cloud-offline-outline" size={40} color="#888" style={{ marginBottom: 12 }} />
        <Text style={styles.errorTitle}>Não foi possível carregar suas metas</Text>
        <Text style={styles.errorSubtitle}>Verifique sua conexão e tente novamente.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadGoals}>
          <Text style={styles.retryButtonText}>Tentar Novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={[styles.container, { paddingTop: insets.top + 20 }]} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <BackButton />
        <Text style={styles.headerTitle}>Definir Metas</Text>
      </View>

      <TouchableOpacity style={styles.smartButton} onPress={() => setModalVisible(true)}>
        <Text style={styles.smartButtonText}>Usar Calculadora Automática</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Metas Manuais</Text>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Calorias (kcal)</Text>
        <TextInput style={styles.input} value={calories} onChangeText={setCalories} keyboardType="numeric" placeholder="2000" placeholderTextColor="#666" />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Proteínas (g)</Text>
        <TextInput style={styles.input} value={protein} onChangeText={setProtein} keyboardType="numeric" placeholder="150" placeholderTextColor="#666" />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Carboidratos (g)</Text>
        <TextInput style={styles.input} value={carbs} onChangeText={setCarbs} keyboardType="numeric" placeholder="250" placeholderTextColor="#666" />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Gorduras (g)</Text>
        <TextInput style={styles.input} value={fat} onChangeText={setFat} keyboardType="numeric" placeholder="70" placeholderTextColor="#666" />
      </View>

      <TouchableOpacity style={[styles.saveButton, saving && styles.disabledButton]} onPress={handleSaveGoals} disabled={saving}>
        {saving ? <ActivityIndicator color="#121212" /> : <Text style={styles.saveButtonText}>Salvar Metas</Text>}
      </TouchableOpacity>

      {/* Modal da Calculadora Inteligente */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <ScrollView style={styles.modalContent}>
            <Text style={styles.modalTitle}>Calculadora Inteligente</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Peso (kg)</Text>
              <TextInput style={styles.input} value={weight} onChangeText={setWeight} keyboardType="numeric" placeholder="75" placeholderTextColor="#666" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Altura (cm)</Text>
              <TextInput style={styles.input} value={height} onChangeText={setHeight} keyboardType="numeric" placeholder="180" placeholderTextColor="#666" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Idade</Text>
              <TextInput style={styles.input} value={age} onChangeText={setAge} keyboardType="numeric" placeholder="30" placeholderTextColor="#666" />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gênero</Text>
              <OptionSelector
                options={[{ label: 'Masculino', value: 'M' }, { label: 'Feminino', value: 'F' }]}
                selectedValue={gender}
                onSelect={setGender}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Nível de Atividade</Text>
              <OptionSelector
                options={[
                  { label: 'Sedentário', value: '1.2' },
                  { label: 'Leve', value: '1.375' },
                  { label: 'Moderado', value: '1.55' },
                  { label: 'Ativo', value: '1.725' },
                  { label: 'Extremo', value: '1.9' },
                ]}
                selectedValue={activityLevel}
                onSelect={setActivityLevel}
                style={{ flexWrap: 'wrap' }}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Objetivo</Text>
              <OptionSelector
                options={[
                  { label: 'Perder Peso', value: 'lose' },
                  { label: 'Manter', value: 'maintain' },
                  { label: 'Ganhar Massa', value: 'gain' },
                ]}
                selectedValue={goal}
                onSelect={setGoal}
              />
            </View>

            <TouchableOpacity style={[styles.saveButton, calculating && styles.disabledButton]} onPress={handleCalculateGoals} disabled={calculating}>
              {calculating ? <ActivityIndicator color="#121212" /> : <Text style={styles.saveButtonText}>Calcular e Aplicar</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={() => setModalVisible(false)}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212', padding: 20 },
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60 },
  errorHeaderRow: { position: 'absolute', top: 60, left: 20 },
  errorTitle: { color: '#FFF', fontSize: 17, fontWeight: '600', textAlign: 'center', marginBottom: 6 },
  errorSubtitle: { color: '#888', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  retryButton: { backgroundColor: '#00FF66', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 10 },
  retryButtonText: { color: '#121212', fontSize: 16, fontWeight: 'bold' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  smartButton: {
    borderColor: '#00FF66',
    borderWidth: 1,
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 30,
  },
  smartButtonText: { color: '#00FF66', fontSize: 16, fontWeight: 'bold' },
  sectionTitle: { color: '#888', fontSize: 16, fontWeight: '600', marginBottom: 10, borderTopColor: '#333', borderTopWidth: 1, paddingTop: 20 },
  inputGroup: { marginBottom: 20 },
  label: { color: '#888', fontSize: 14, marginBottom: 8 },
  input: { backgroundColor: '#1E1E1E', color: '#FFF', padding: 15, borderRadius: 12, fontSize: 16 },
  saveButton: { backgroundColor: '#00FF66', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  disabledButton: { opacity: 0.7 },
  saveButtonText: { color: '#121212', fontSize: 18, fontWeight: 'bold' },
  // Modal Styles
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 25,
    maxHeight: '90%',
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  cancelButton: {
    padding: 15,
    alignItems: 'center',
    marginTop: 5,
    marginBottom: 20, // Espaço para safe area
  },
  cancelText: {
    color: '#888',
    fontSize: 16,
  },
  // Option Selector
  optionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  optionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#333',
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  optionButtonSelected: {
    backgroundColor: '#00FF66',
  },
  optionButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
  optionButtonTextSelected: {
    color: '#121212',
  },
});