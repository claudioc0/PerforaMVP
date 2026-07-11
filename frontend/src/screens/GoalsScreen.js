import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { getUserGoals, updateUserGoals } from '../services/api';

export default function GoalsScreen({ navigation }) {
  const [goals, setGoals] = useState({
    goal_calories: '',
    goal_protein_g: '',
    goal_carbs_g: '',
    goal_fat_g: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchGoals = async () => {
      try {
        const data = await getUserGoals();
        // Converte os valores para string para o TextInput
        const stringifiedData = Object.fromEntries(
          Object.entries(data).map(([key, value]) => [key, String(value)])
        );
        setGoals(stringifiedData);
      } catch (error) {
        Alert.alert('Erro', 'Não foi possível carregar suas metas. Tente novamente.');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };

    fetchGoals();
  }, []);

  const handleInputChange = (name, value) => {
    setGoals(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveChanges = async () => {
    setSaving(true);
    try {
      // Converte os valores de volta para float antes de enviar
      const numericGoals = Object.fromEntries(
        Object.entries(goals).map(([key, value]) => [key, parseFloat(value) || 0])
      );

      await updateUserGoals(numericGoals);
      Alert.alert('Sucesso!', 'Suas metas foram atualizadas.');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Erro ao Salvar', error.message || 'Não foi possível atualizar suas metas.');
    } finally {
      setSaving(false);
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
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.headerTitle}>Minhas Metas Diárias</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Calorias</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={goals.goal_calories}
              onChangeText={(val) => handleInputChange('goal_calories', val)}
              keyboardType="numeric"
              placeholderTextColor="#666"
            />
            <Text style={styles.unit}>kcal</Text>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Proteínas</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={goals.goal_protein_g}
              onChangeText={(val) => handleInputChange('goal_protein_g', val)}
              keyboardType="numeric"
              placeholderTextColor="#666"
            />
            <Text style={styles.unit}>g</Text>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Carboidratos</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={goals.goal_carbs_g}
              onChangeText={(val) => handleInputChange('goal_carbs_g', val)}
              keyboardType="numeric"
              placeholderTextColor="#666"
            />
            <Text style={styles.unit}>g</Text>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Gorduras</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={goals.goal_fat_g}
              onChangeText={(val) => handleInputChange('goal_fat_g', val)}
              keyboardType="numeric"
              placeholderTextColor="#666"
            />
            <Text style={styles.unit}>g</Text>
          </View>
        </View>

        <TouchableOpacity style={[styles.saveButton, saving && styles.disabledButton]} onPress={handleSaveChanges} disabled={saving}>
          {saving ? <ActivityIndicator color="#121212" /> : <Text style={styles.saveButtonText}>Salvar Metas</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  scrollContent: { flexGrow: 1, padding: 20, paddingTop: 60, justifyContent: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  headerTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 40 },
  inputGroup: { marginBottom: 25 },
  label: { color: '#888888', fontSize: 16, marginBottom: 8 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E1E1E', borderRadius: 10, paddingHorizontal: 15 },
  input: { color: '#FFFFFF', fontSize: 18, paddingVertical: 15, flex: 1 },
  unit: { color: '#888888', fontSize: 16, marginLeft: 10 },
  saveButton: { backgroundColor: '#00FF66', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  saveButtonText: { color: '#121212', fontSize: 18, fontWeight: 'bold' },
  disabledButton: { opacity: 0.7 },
});