import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { updateMeal } from '../services/api';

const EditableField = ({ label, value, onChangeText, unit, keyboardType = 'numeric' }) => (
  <View style={styles.fieldContainer}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View style={styles.inputContainer}>
      <TextInput
        style={styles.input}
        value={String(value)}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholderTextColor="#666"
      />
      {unit && <Text style={styles.unitText}>{unit}</Text>}
    </View>
  </View>
);

export default function EditMealScreen({ navigation, route }) {
  const { meal } = route.params;
  const [editedMeal, setEditedMeal] = useState({
    description: meal.description,
    calories: meal.calories.toFixed(0),
    protein_g: meal.protein_g.toFixed(1),
    carbs_g: meal.carbs_g.toFixed(1),
    fat_g: meal.fat_g.toFixed(1),
  });
  const [loading, setLoading] = useState(false);

  const handleFieldChange = (field, text) => {
    setEditedMeal(prev => ({ ...prev, [field]: text }));
  };

  const handleSaveChanges = async () => {
    setLoading(true);
    try {
      // Converte os valores de volta para números antes de enviar
      const payload = {
        description: editedMeal.description,
        calories: parseFloat(editedMeal.calories) || 0,
        protein_g: parseFloat(editedMeal.protein_g) || 0,
        carbs_g: parseFloat(editedMeal.carbs_g) || 0,
        fat_g: parseFloat(editedMeal.fat_g) || 0,
      };

      await updateMeal(meal.id, payload);

      Alert.alert('Sucesso', 'Refeição atualizada!');
      navigation.navigate('Dashboard'); // Volta para o Dashboard, que será atualizado pelo useFocusEffect

    } catch (error) {
      Alert.alert('Erro ao Salvar', error.message || 'Não foi possível atualizar a refeição.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.headerTitle}>Editar Refeição</Text>

      <View style={styles.card}>
        <EditableField
          label="Descrição"
          value={editedMeal.description}
          onChangeText={(text) => handleFieldChange('description', text)}
          keyboardType="default"
        />
        <EditableField
          label="Calorias"
          value={editedMeal.calories}
          onChangeText={(text) => handleFieldChange('calories', text)}
          unit="kcal"
        />
        <EditableField
          label="Proteínas"
          value={editedMeal.protein_g}
          onChangeText={(text) => handleFieldChange('protein_g', text)}
          unit="g"
        />
        <EditableField
          label="Carboidratos"
          value={editedMeal.carbs_g}
          onChangeText={(text) => handleFieldChange('carbs_g', text)}
          unit="g"
        />
        <EditableField
          label="Gorduras"
          value={editedMeal.fat_g}
          onChangeText={(text) => handleFieldChange('fat_g', text)}
          unit="g"
        />
      </View>

      <TouchableOpacity
        style={[styles.submitButton, loading && styles.disabledButton]}
        onPress={handleSaveChanges}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#121212" /> : <Text style={styles.submitText}>Salvar Alterações</Text>}
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