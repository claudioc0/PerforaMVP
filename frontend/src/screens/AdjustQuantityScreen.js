import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { updateMeal } from '../services/api';
import BackButton from '../components/BackButton';

export default function AdjustQuantityScreen({ navigation, route }) {
  const { meal: initialMeal } = route.params;

  const [quantity, setQuantity] = useState(String(initialMeal.quantity_g || 100));
  const [saving, setSaving] = useState(false);

  // Deriva os macros base (para 100g) a partir da própria refeição já salva,
  // sem precisar chamar a IA de novo: base = valor salvo / (quantidade salva / 100).
  const baseMacros = useMemo(() => {
    const savedQuantity = initialMeal.quantity_g > 0 ? initialMeal.quantity_g : 100;
    const ratio = 100 / savedQuantity;
    return {
      calories: initialMeal.calories * ratio,
      protein_g: initialMeal.protein_g * ratio,
      carbs_g: initialMeal.carbs_g * ratio,
      fat_g: initialMeal.fat_g * ratio,
    };
  }, [initialMeal]);

  // Recalcula os macros em tempo real com base na nova quantidade
  const calculatedMacros = useMemo(() => {
    const numQuantity = parseFloat(quantity) || 0;
    if (numQuantity <= 0) {
      return { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    }
    const base = 100; // baseMacros é sempre por 100g
    return {
      calories: (baseMacros.calories / base) * numQuantity,
      protein_g: (baseMacros.protein_g / base) * numQuantity,
      carbs_g: (baseMacros.carbs_g / base) * numQuantity,
      fat_g: (baseMacros.fat_g / base) * numQuantity,
    };
  }, [baseMacros, quantity]);

  const handleSaveChanges = async () => {
    setSaving(true);
    try {
      const numQuantity = parseFloat(quantity) || 0;
      const payload = {
        description: initialMeal.description,
        calories: calculatedMacros.calories,
        protein_g: calculatedMacros.protein_g,
        carbs_g: calculatedMacros.carbs_g,
        fat_g: calculatedMacros.fat_g,
        quantity_g: numQuantity, // Salva a nova quantidade
      };

      await updateMeal(initialMeal.id, payload);

      Alert.alert('Sucesso', 'Refeição atualizada!');
      navigation.navigate('Dashboard');

    } catch (error) {
      Alert.alert('Erro ao Salvar', error.message || 'Não foi possível atualizar a refeição.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerRow}>
        <BackButton />
        <Text style={styles.headerTitle}>Ajustar Quantidade</Text>
      </View>
      <Text style={styles.descriptionText}>{initialMeal.description}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Nova Quantidade</Text>
        <View style={styles.quantityContainer}>
          <TextInput
            style={styles.quantityInput}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="numeric"
            placeholder="100"
            placeholderTextColor="#666"
          />
          <Text style={styles.unitText}>gramas</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Nova Estimativa Nutricional</Text>
        <View style={styles.macrosGrid}>
          <View style={styles.macroBox}><Text style={styles.macroValue}>{calculatedMacros.calories.toFixed(0)}</Text><Text style={styles.macroLabel}>Kcal</Text></View>
          <View style={styles.macroBox}><Text style={styles.macroValue}>{calculatedMacros.protein_g.toFixed(1)} g</Text><Text style={styles.macroLabel}>Proteína</Text></View>
          <View style={styles.macroBox}><Text style={styles.macroValue}>{calculatedMacros.carbs_g.toFixed(1)} g</Text><Text style={styles.macroLabel}>Carbo</Text></View>
          <View style={styles.macroBox}><Text style={styles.macroValue}>{calculatedMacros.fat_g.toFixed(1)} g</Text><Text style={styles.macroLabel}>Gordura</Text></View>
        </View>
      </View>

      <TouchableOpacity style={[styles.submitButton, saving && styles.disabledButton]} onPress={handleSaveChanges} disabled={saving}>
        {saving ? <ActivityIndicator color="#121212" /> : <Text style={styles.submitText}>Salvar Alterações</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
        <Text style={styles.cancelText}>Cancelar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// Estilos baseados na MealConfirmationScreen para consistência
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  descriptionText: { color: '#00FF66', fontSize: 20, fontWeight: '500', textAlign: 'center', marginBottom: 30, textTransform: 'capitalize' },
  card: { backgroundColor: '#1E1E1E', padding: 20, borderRadius: 16, marginBottom: 20 },
  cardTitle: { color: '#FFF', fontSize: 18, fontWeight: '600', marginBottom: 15 },
  quantityContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#333', borderRadius: 10 },
  quantityInput: { color: '#FFF', fontSize: 20, padding: 15, flex: 1, fontWeight: 'bold' },
  unitText: { color: '#888', fontSize: 16, paddingRight: 15 },
  macrosGrid: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
  macroBox: { alignItems: 'center', width: '48%', marginBottom: 15 },
  macroValue: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  macroLabel: { color: '#888', fontSize: 14, marginTop: 4 },
  submitButton: { backgroundColor: '#00FF66', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  disabledButton: { opacity: 0.7 },
  submitText: { color: '#121212', fontSize: 18, fontWeight: 'bold' },
  cancelButton: { padding: 15, alignItems: 'center', marginTop: 5 },
  cancelText: { color: '#888', fontSize: 16 },
});