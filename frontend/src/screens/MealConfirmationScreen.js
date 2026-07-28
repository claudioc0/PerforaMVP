import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { saveMeal, addFavorite } from '../services/api';
import BackButton from '../components/BackButton';
import MacroSummaryLine from '../components/MacroSummaryLine';
import { useAppAlert } from '../components/AppAlertProvider';
import { useScaledMealItems } from '../hooks/useScaledMealItems';

export default function MealConfirmationScreen({ navigation, route }) {
  const showAlert = useAppAlert();
  // Recebe o rascunho da análise (lista de itens, cada um por 100g) e a data da
  // tela anterior. `|| {}` evita quebrar o destructuring se a tela for aberta
  // sem params (deep link, rota antiga) — o `!draftMeal` logo abaixo já cobre
  // esse caso mostrando a tela de erro em vez de crashar.
  const { draftMeal, targetDate } = route.params || {};

  // A IA já devolve os macros de cada item por 100g — são a "base" pra escalar.
  // "quantity" é editável, pré-preenchida com a estimativa de peso da própria IA.
  const initialItems = useMemo(
    () =>
      (draftMeal?.items || []).map((item) => ({
        description: item.description,
        baseCalories: item.calories,
        baseProtein_g: item.protein_g,
        baseCarbs_g: item.carbs_g,
        baseFat_g: item.fat_g,
        quantity: String(item.estimated_grams || 100),
      })),
    [draftMeal]
  );

  const { scaledItems, totals, updateItemQuantity } = useScaledMealItems(initialItems);

  const [loading, setLoading] = useState(false);
  const [saveAsFavorite, setSaveAsFavorite] = useState(false);

  const combinedDescription = useMemo(
    () => scaledItems.map((item) => item.description).join(', '),
    [scaledItems]
  );

  const handleConfirmMeal = async () => {
    // Sem isso, limpar o campo de quantidade (texto vira '') fazia
    // parseFloat('') || 0 virar 0 silenciosamente em scaleMealItems — a
    // refeição era confirmada com 0 kcal / 0g de tudo, sem nenhum aviso.
    const invalidItem = scaledItems.find((item) => !item.numQuantity || item.numQuantity <= 0);
    if (invalidItem) {
      showAlert('Atenção', `Informe uma quantidade válida (em gramas) para "${invalidItem.description}" antes de confirmar.`);
      return;
    }

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

      if (saveAsFavorite) {
        try {
          await addFavorite({
            description: combinedDescription,
            calories: totals.calories,
            protein_g: totals.protein_g,
            carbs_g: totals.carbs_g,
            fat_g: totals.fat_g,
          });
        } catch (favoriteError) {
          // A refeição já foi registrada com sucesso — falha ao favoritar não deve bloquear o fluxo.
        }
      }

      showAlert('Sucesso', 'Refeição registrada!');
      navigation.navigate('Dashboard');

    } catch (error) {
      showAlert('Erro ao Salvar', error.message || 'Não foi possível registrar a refeição.');
    } finally {
      setLoading(false);
    }
  };

  if (!draftMeal || scaledItems.length === 0) {
    return (
      <View style={styles.container}>
        {/* Sem isso, essa tela de erro não tinha NENHUM jeito de sair no iOS
            (sem gesto de voltar do Android, e sem botão nenhum na tela) —
            o usuário ficava preso aqui. */}
        <View style={styles.headerRow}>
          <BackButton />
        </View>
        <Text style={styles.errorText}>Erro: Dados da refeição não encontrados.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
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
          <MacroSummaryLine
            calories={item.scaledCalories}
            proteinG={item.scaledProtein_g}
            carbsG={item.scaledCarbs_g}
            fatG={item.scaledFat_g}
            style={styles.itemMacros}
          />
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

      <TouchableOpacity style={styles.favoriteToggleRow} onPress={() => setSaveAsFavorite((prev) => !prev)}>
        <Ionicons name={saveAsFavorite ? 'checkbox' : 'square-outline'} size={22} color={saveAsFavorite ? '#00FF66' : '#888'} />
        <Text style={styles.favoriteToggleText}>Salvar este alimento como favorito, pra adicionar mais rápido depois</Text>
      </TouchableOpacity>

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
    </KeyboardAvoidingView>
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
  favoriteToggleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  favoriteToggleText: { color: '#AAA', fontSize: 13, marginLeft: 10, flex: 1 },
  submitButton: { backgroundColor: '#00FF66', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  disabledButton: { opacity: 0.7 },
  submitText: { color: '#121212', fontSize: 18, fontWeight: 'bold' },
  cancelButton: { padding: 15, alignItems: 'center', marginTop: 5 },
  cancelText: { color: '#888', fontSize: 16 },
  errorText: { color: 'red', textAlign: 'center', fontSize: 18 },
});
