import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { saveMeal } from '../services/api';
import BackButton from '../components/BackButton';

export default function MealConfirmationScreen({ navigation, route }) {
  // Recebe o rascunho da análise (lista de itens, cada um por 100g) e a data da tela anterior
  const { draftMeal, targetDate } = route.params;

  // Um estado por item: description/calories/protein_g/carbs_g/fat_g vêm da IA (por 100g do
  // próprio item) e "quantity" é editável, pré-preenchida com a estimativa de peso da IA.
  const [items, setItems] = useState(() =>
    (draftMeal?.items || []).map((item) => ({
      ...item,
      quantity: String(item.estimated_grams || 100),
    }))
  );
  const [loading, setLoading] = useState(false);

  const updateItemQuantity = (index, text) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, quantity: text } : item)));
  };

  // Recalcula os macros de cada item em tempo real (regra de três, cada item por 100g próprio)
  const scaledItems = useMemo(() => {
    return items.map((item) => {
      const numQuantity = parseFloat(item.quantity) || 0;
      const ratio = numQuantity / 100;
      return {
        ...item,
        numQuantity,
        scaledCalories: item.calories * ratio,
        scaledProtein_g: item.protein_g * ratio,
        scaledCarbs_g: item.carbs_g * ratio,
        scaledFat_g: item.fat_g * ratio,
      };
    });
  }, [items]);

  // Total da refeição = soma dos itens já ajustados
  const totals = useMemo(() => {
    return scaledItems.reduce(
      (acc, item) => ({
        calories: acc.calories + item.scaledCalories,
        protein_g: acc.protein_g + item.scaledProtein_g,
        carbs_g: acc.carbs_g + item.scaledCarbs_g,
        fat_g: acc.fat_g + item.scaledFat_g,
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
  }, [scaledItems]);

  const combinedDescription = useMemo(() => items.map((item) => item.description).join(', '), [items]);

  const handleConfirmMeal = async () => {
    setLoading(true);
    try {
      const finalItems = scaledItems.map((item) => ({
        description: item.description,
        quantity_g: item.numQuantity,
        calories: item.scaledCalories,
        protein_g: item.scaledProtein_g,
        carbs_g: item.scaledCarbs_g,
        fat_g: item.scaledFat_g,
      }));

      const finalMealData = {
        items: finalItems,
        confidence: draftMeal.confidence,
        source_type: draftMeal.source_type,
        date: targetDate,
      };

      await saveMeal(finalMealData);

      Alert.alert('Sucesso', 'Refeição registrada!');
      navigation.navigate('Dashboard');

    } catch (error) {
      Alert.alert('Erro ao Salvar', error.message || 'Não foi possível registrar a refeição.');
    } finally {
      setLoading(false);
    }
  };

  if (!draftMeal || items.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Erro: Dados da refeição não encontrados.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerRow}>
        <BackButton />
        <Text style={styles.headerTitle}>Confirmar Refeição</Text>
      </View>
      <Text style={styles.descriptionText}>{combinedDescription}</Text>

      <Text style={styles.sectionLabel}>Itens identificados</Text>
      <Text style={styles.estimateHint}>Quantidades estimadas pela IA — ajuste cada item se necessário</Text>

      {scaledItems.map((item, index) => (
        <View key={index} style={styles.itemCard}>
          <Text style={styles.itemDesc}>{item.description}</Text>
          <View style={styles.quantityContainer}>
            <TextInput
              style={styles.quantityInput}
              value={item.quantity}
              onChangeText={(text) => updateItemQuantity(index, text)}
              keyboardType="numeric"
              placeholder="100"
              placeholderTextColor="#666"
            />
            <Text style={styles.unitText}>gramas</Text>
          </View>
          <Text style={styles.itemMacros}>
            {item.scaledCalories.toFixed(0)} kcal • P: {item.scaledProtein_g.toFixed(1)}g • C: {item.scaledCarbs_g.toFixed(1)}g • G: {item.scaledFat_g.toFixed(1)}g
          </Text>
        </View>
      ))}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Total da Refeição</Text>
        <View style={styles.macrosGrid}>
          <View style={styles.macroBox}>
            <Text style={styles.macroValue}>{totals.calories.toFixed(0)}</Text>
            <Text style={styles.macroLabel}>Kcal</Text>
          </View>
          <View style={styles.macroBox}>
            <Text style={styles.macroValue}>{totals.protein_g.toFixed(1)} g</Text>
            <Text style={styles.macroLabel}>Proteína</Text>
          </View>
          <View style={styles.macroBox}>
            <Text style={styles.macroValue}>{totals.carbs_g.toFixed(1)} g</Text>
            <Text style={styles.macroLabel}>Carbo</Text>
          </View>
          <View style={styles.macroBox}>
            <Text style={styles.macroValue}>{totals.fat_g.toFixed(1)} g</Text>
            <Text style={styles.macroLabel}>Gordura</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.submitButton, loading && styles.disabledButton]}
        onPress={handleConfirmMeal}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#121212" />
        ) : (
          <Text style={styles.submitText}>Confirmar Refeição</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
        <Text style={styles.cancelText}>Cancelar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  descriptionText: { color: '#00FF66', fontSize: 20, fontWeight: '500', textAlign: 'center', marginBottom: 20, textTransform: 'capitalize' },
  sectionLabel: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  estimateHint: { color: '#888', fontSize: 12, marginBottom: 15 },
  itemCard: { backgroundColor: '#1E1E1E', padding: 16, borderRadius: 16, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#00FF66' },
  itemDesc: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 10, textTransform: 'capitalize' },
  card: { backgroundColor: '#1E1E1E', padding: 20, borderRadius: 16, marginTop: 8, marginBottom: 20 },
  cardTitle: { color: '#FFF', fontSize: 18, fontWeight: '600', marginBottom: 15 },
  quantityContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#333', borderRadius: 10 },
  quantityInput: { color: '#FFF', fontSize: 18, padding: 12, flex: 1, fontWeight: 'bold' },
  unitText: { color: '#888', fontSize: 14, paddingRight: 15 },
  itemMacros: { color: '#888888', fontSize: 13, marginTop: 8 },
  macrosGrid: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
  macroBox: { alignItems: 'center', width: '48%', marginBottom: 15 },
  macroValue: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  macroLabel: { color: '#888', fontSize: 14, marginTop: 4 },
  submitButton: { backgroundColor: '#00FF66', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  disabledButton: { opacity: 0.7 },
  submitText: { color: '#121212', fontSize: 18, fontWeight: 'bold' },
  cancelButton: { padding: 15, alignItems: 'center', marginTop: 5 },
  cancelText: { color: '#888', fontSize: 16 },
  errorText: { color: 'red', textAlign: 'center', fontSize: 18 },
});
