import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { updateMeal } from '../services/api';
import BackButton from '../components/BackButton';
import MacroSummaryLine from '../components/MacroSummaryLine';
import { useAppAlert } from '../components/AppAlertProvider';
import { useScaledMealItems } from '../hooks/useScaledMealItems';
import { deriveBaseFromSavedItem } from '../utils/mealMacros';

export default function AdjustQuantityScreen({ navigation, route }) {
  const showAlert = useAppAlert();
  // `|| {}` evita quebrar o destructuring se a tela for aberta sem params
  // (deep link, rota antiga) — o `!initialMeal` logo abaixo mostra uma tela
  // de erro em vez de crashar tentando ler `.items` de undefined.
  const { meal: initialMeal } = route.params || {};

  // Refeições registradas via IA (foto/texto) têm detalhamento por item — refeições antigas
  // ou manuais (sem "items") caem no modo legado: um único campo de quantidade pra refeição toda,
  // tratado aqui como uma lista de 1 item só (mesma conta, sem caminho separado).
  const hasItems = Boolean(initialMeal?.items && initialMeal.items.length > 0);

  // Deriva os macros base (por 100g) a partir do que já foi salvo, sem precisar
  // chamar a IA de novo — o backend guarda o total pra quantity_g gramas, não o
  // valor por 100g.
  const initialItems = useMemo(() => {
    if (!initialMeal) return [];
    if (hasItems) {
      return initialMeal.items.map(deriveBaseFromSavedItem);
    }
    return [
      deriveBaseFromSavedItem({
        description: initialMeal.description,
        quantity_g: initialMeal.quantity_g,
        calories: initialMeal.calories,
        protein_g: initialMeal.protein_g,
        carbs_g: initialMeal.carbs_g,
        fat_g: initialMeal.fat_g,
      }),
    ];
  }, [hasItems, initialMeal]);

  const { scaledItems, totals, updateItemQuantity } = useScaledMealItems(initialItems);

  const [saving, setSaving] = useState(false);

  const handleSaveChanges = async () => {
    setSaving(true);
    try {
      let payload;

      if (hasItems) {
        payload = {
          items: scaledItems.map((item) => ({
            description: item.description,
            quantity_g: item.numQuantity,
            calories: item.scaledCalories,
            protein_g: item.scaledProtein_g,
            carbs_g: item.scaledCarbs_g,
            fat_g: item.scaledFat_g,
          })),
        };
      } else {
        payload = {
          description: initialMeal.description,
          calories: totals.calories,
          protein_g: totals.protein_g,
          carbs_g: totals.carbs_g,
          fat_g: totals.fat_g,
          quantity_g: scaledItems[0]?.numQuantity ?? 0,
        };
      }

      await updateMeal(initialMeal.id, payload);

      showAlert('Sucesso', 'Refeição atualizada!');
      navigation.navigate('Dashboard');

    } catch (error) {
      showAlert('Erro ao Salvar', error.message || 'Não foi possível atualizar a refeição.');
    } finally {
      setSaving(false);
    }
  };

  if (!initialMeal) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <BackButton />
          <Text style={styles.headerTitle}>Ajustar Quantidade</Text>
        </View>
        <Text style={styles.errorText}>Erro: dados da refeição não encontrados.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <BackButton />
        <Text style={styles.headerTitle}>Ajustar Quantidade</Text>
      </View>
      <Text style={styles.descriptionText}>{initialMeal.description}</Text>

      {hasItems ? (
        scaledItems.map((item, index) => (
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
            <MacroSummaryLine
              calories={item.scaledCalories}
              proteinG={item.scaledProtein_g}
              carbsG={item.scaledCarbs_g}
              fatG={item.scaledFat_g}
              style={styles.itemMacros}
            />
          </View>
        ))
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nova Quantidade</Text>
          <View style={styles.quantityContainer}>
            <TextInput
              style={styles.quantityInput}
              value={scaledItems[0]?.quantity ?? ''}
              onChangeText={(text) => updateItemQuantity(0, text)}
              keyboardType="numeric"
              placeholder="100"
              placeholderTextColor="#666"
            />
            <Text style={styles.unitText}>gramas</Text>
          </View>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{hasItems ? 'Total da Refeição' : 'Nova Estimativa Nutricional'}</Text>
        <View style={styles.macrosGrid}>
          <View style={styles.macroBox}><Text style={styles.macroValue}>{totals.calories.toFixed(0)}</Text><Text style={styles.macroLabel}>Kcal</Text></View>
          <View style={styles.macroBox}><Text style={styles.macroValue}>{totals.protein_g.toFixed(1)} g</Text><Text style={styles.macroLabel}>Proteína</Text></View>
          <View style={styles.macroBox}><Text style={styles.macroValue}>{totals.carbs_g.toFixed(1)} g</Text><Text style={styles.macroLabel}>Carbo</Text></View>
          <View style={styles.macroBox}><Text style={styles.macroValue}>{totals.fat_g.toFixed(1)} g</Text><Text style={styles.macroLabel}>Gordura</Text></View>
        </View>
      </View>

      <TouchableOpacity style={[styles.submitButton, saving && styles.disabledButton]} onPress={handleSaveChanges} disabled={saving}>
        {saving ? <ActivityIndicator color="#121212" /> : <Text style={styles.submitText}>Salvar Alterações</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
        <Text style={styles.cancelText}>Cancelar</Text>
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Estilos baseados na MealConfirmationScreen para consistência
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  errorText: { color: 'red', textAlign: 'center', fontSize: 18, marginTop: 20 },
  descriptionText: { color: '#00FF66', fontSize: 20, fontWeight: '500', textAlign: 'center', marginBottom: 20, textTransform: 'capitalize' },
  itemCard: { backgroundColor: '#1E1E1E', padding: 16, borderRadius: 16, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#00FF66' },
  itemDesc: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 10, textTransform: 'capitalize' },
  itemMacros: { color: '#888888', fontSize: 13, marginTop: 8 },
  card: { backgroundColor: '#1E1E1E', padding: 20, borderRadius: 16, marginTop: 8, marginBottom: 20 },
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
