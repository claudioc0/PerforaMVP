import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { saveMeal } from '../services/api';

const EditableField = ({ label, value, onChangeText, unit, keyboardType = 'default', placeholder }) => (
  <View style={styles.fieldContainer}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View style={styles.inputContainer}>
      <TextInput
        style={styles.input}
        value={String(value)}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor="#666"
      />
      {unit && <Text style={styles.unitText}>{unit}</Text>}
    </View>
  </View>
);

export default function ManualEntryScreen({ navigation, route }) {
  const { targetDate } = route.params;

  const [meal, setMeal] = useState({
    description: '',
    calories: '',
    protein_g: '',
    carbs_g: '',
    fat_g: '',
  });
  const [loading, setLoading] = useState(false);

  const handleFieldChange = (field, text) => {
    setMeal(prev => ({ ...prev, [field]: text }));
  };

  const handleSaveMeal = async () => {
    if (!meal.description || !meal.calories || !meal.protein_g || !meal.carbs_g || !meal.fat_g) {
      Alert.alert('Atenção', 'Por favor, preencha todos os campos.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        description: meal.description,
        calories: parseFloat(meal.calories) || 0,
        protein_g: parseFloat(meal.protein_g) || 0,
        carbs_g: parseFloat(meal.carbs_g) || 0,
        fat_g: parseFloat(meal.fat_g) || 0,
        source_type: 'manual', // Regra de Ouro do Payload
        date: targetDate,
      };

      await saveMeal(payload);

      Alert.alert('Sucesso', 'Refeição registrada manualmente!');
      navigation.goBack();

    } catch (error) {
      Alert.alert('Erro ao Salvar', error.message || 'Não foi possível registrar a refeição.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.headerTitle}>Registro Manual</Text>

      <View style={styles.card}>
        <EditableField
          label="Descrição do Alimento"
          value={meal.description}
          onChangeText={(text) => handleFieldChange('description', text)}
          keyboardType="default"
          placeholder="Ex: Arroz, feijão e bife"
        />
        <EditableField
          label="Calorias"
          value={meal.calories}
          onChangeText={(text) => handleFieldChange('calories', text)}
          unit="kcal"
          keyboardType="numeric"
          placeholder="550"
        />
        <EditableField
          label="Proteínas"
          value={meal.protein_g}
          onChangeText={(text) => handleFieldChange('protein_g', text)}
          unit="g"
          keyboardType="numeric"
          placeholder="45"
        />
        <EditableField
          label="Carboidratos"
          value={meal.carbs_g}
          onChangeText={(text) => handleFieldChange('carbs_g', text)}
          unit="g"
          keyboardType="numeric"
          placeholder="50"
        />
        <EditableField
          label="Gorduras"
          value={meal.fat_g}
          onChangeText={(text) => handleFieldChange('fat_g', text)}
          unit="g"
          keyboardType="numeric"
          placeholder="18"
        />
      </View>

      <TouchableOpacity style={[styles.submitButton, loading && styles.disabledButton]} onPress={handleSaveMeal} disabled={loading}>
        {loading ? <ActivityIndicator color="#121212" /> : <Text style={styles.submitText}>Salvar Refeição</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
        <Text style={styles.cancelText}>Cancelar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60 },
  headerTitle: { color: '#FFF', fontSize: 28, fontWeight: 'bold', marginBottom: 30, textAlign: 'center' },
  card: { backgroundColor: '#1E1E1E', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 16, marginBottom: 20 },
  fieldContainer: { marginVertical: 10, borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 15 },
  fieldLabel: { color: '#888', fontSize: 14, marginBottom: 5 },
  inputContainer: { flexDirection: 'row', alignItems: 'center' },
  input: { color: '#FFF', fontSize: 18, flex: 1, fontWeight: '500', paddingVertical: 5 },
  unitText: { color: '#888', fontSize: 16, marginLeft: 10 },
  submitButton: { backgroundColor: '#00FF66', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  disabledButton: { opacity: 0.7 },
  submitText: { color: '#121212', fontSize: 18, fontWeight: 'bold' },
  cancelButton: { padding: 15, alignItems: 'center', marginTop: 5 },
  cancelText: { color: '#888', fontSize: 16 },
});