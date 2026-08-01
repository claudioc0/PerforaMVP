import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { saveMeal, addFavorite } from '../services/api';
import BackButton from '../components/BackButton';
import MacroSummaryLine from '../components/MacroSummaryLine';
import { useAppAlert } from '../components/AppAlertProvider';
import { useScaledMealItems } from '../hooks/useScaledMealItems';
import { useTheme } from '../theme/ThemeContext';
import { registerNamespace } from '../i18n';
import { ROUTES } from '../navigation/routes';

import pt from '../i18n/locales/pt/mealConfirmation.json';
import en from '../i18n/locales/en/mealConfirmation.json';
import es from '../i18n/locales/es/mealConfirmation.json';

registerNamespace('mealConfirmation', { pt, en, es });

export default function MealConfirmationScreen({ navigation, route }) {
  const showAlert = useAppAlert();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useTranslation(['mealConfirmation', 'common']);
  const styles = useMemo(() => createStyles(colors), [colors]);
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
      showAlert(t('alerts.invalidQuantityTitle'), t('alerts.invalidQuantityMessage', { description: invalidItem.description }));
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
        } catch {
          // A refeição já foi registrada com sucesso — falha ao favoritar não deve bloquear o fluxo.
        }
      }

      showAlert(t('alerts.successTitle'), t('alerts.successMessage'));
      navigation.navigate(ROUTES.DASHBOARD);

    } catch (error) {
      showAlert(t('alerts.saveErrorTitle'), error.message || t('alerts.saveErrorFallback'));
    } finally {
      setLoading(false);
    }
  };

  if (!draftMeal || scaledItems.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
        {/* Sem isso, essa tela de erro não tinha NENHUM jeito de sair no iOS
            (sem gesto de voltar do Android, e sem botão nenhum na tela) —
            o usuário ficava preso aqui. */}
        <View style={styles.headerRow}>
          <BackButton />
        </View>
        <Text style={styles.errorText}>{t('errorMissingData')}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={[styles.container, { paddingTop: insets.top + 20 }]} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <BackButton />
        <Text style={styles.headerTitle}>{t('headerTitle')}</Text>
      </View>
      <Text style={styles.descriptionText}>{combinedDescription}</Text>

      <Text style={styles.sectionLabel}>{t('descriptionSectionLabel')}</Text>
      <Text style={styles.estimateHint}>{t('estimateHint')}</Text>

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
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.unitText}>{t('unitGrams')}</Text>
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
        <Text style={styles.cardTitle}>{t('totalCardTitle')}</Text>
        <View style={styles.macrosGrid}>
          <View style={styles.macroBox}>
            <Text style={styles.macroValue} maxFontSizeMultiplier={1.3}>{totals.calories.toFixed(0)}</Text>
            <Text style={styles.macroLabel} maxFontSizeMultiplier={1.3}>{t('macros.calories')}</Text>
          </View>
          <View style={styles.macroBox}>
            <Text style={styles.macroValue} maxFontSizeMultiplier={1.3}>{totals.protein_g.toFixed(1)} g</Text>
            <Text style={styles.macroLabel} maxFontSizeMultiplier={1.3}>{t('macros.protein')}</Text>
          </View>
          <View style={styles.macroBox}>
            <Text style={styles.macroValue} maxFontSizeMultiplier={1.3}>{totals.carbs_g.toFixed(1)} g</Text>
            <Text style={styles.macroLabel} maxFontSizeMultiplier={1.3}>{t('macros.carbs')}</Text>
          </View>
          <View style={styles.macroBox}>
            <Text style={styles.macroValue} maxFontSizeMultiplier={1.3}>{totals.fat_g.toFixed(1)} g</Text>
            <Text style={styles.macroLabel} maxFontSizeMultiplier={1.3}>{t('macros.fat')}</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={styles.favoriteToggleRow}
        onPress={() => setSaveAsFavorite((prev) => !prev)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: saveAsFavorite }}
      >
        <Ionicons name={saveAsFavorite ? 'checkbox' : 'square-outline'} size={22} color={saveAsFavorite ? colors.primary : colors.textSecondary} />
        <Text style={styles.favoriteToggleText}>{t('favoriteToggle')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.submitButton, loading && styles.disabledButton]}
        onPress={handleConfirmMeal}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={styles.submitText}>{t('confirmButton')}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
        <Text style={styles.cancelText}>{t('common:actions.cancel')}</Text>
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 60 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  headerTitle: { flex: 1, color: colors.white, fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  descriptionText: { color: colors.primary, fontSize: 20, fontWeight: '500', textAlign: 'center', marginBottom: 20, textTransform: 'capitalize' },
  sectionLabel: { color: colors.white, fontSize: 16, fontWeight: '600', marginBottom: 4 },
  estimateHint: { color: colors.textSecondary, fontSize: 12, marginBottom: 15 },
  itemCard: { backgroundColor: colors.surface, padding: 16, borderRadius: 16, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: colors.primary },
  itemDesc: { color: colors.white, fontSize: 16, fontWeight: '600', marginBottom: 10, textTransform: 'capitalize' },
  card: { backgroundColor: colors.surface, padding: 20, borderRadius: 16, marginTop: 8, marginBottom: 20 },
  cardTitle: { color: colors.white, fontSize: 18, fontWeight: '600', marginBottom: 15 },
  quantityContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.border, borderRadius: 10 },
  quantityInput: { color: colors.white, fontSize: 18, padding: 12, flex: 1, fontWeight: 'bold' },
  unitText: { color: colors.textSecondary, fontSize: 14, paddingRight: 15 },
  itemMacros: { color: colors.textSecondary, fontSize: 13, marginTop: 8 },
  macrosGrid: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
  macroBox: { alignItems: 'center', width: '48%', marginBottom: 15 },
  macroValue: { color: colors.white, fontSize: 24, fontWeight: 'bold' },
  macroLabel: { color: colors.textSecondary, fontSize: 14, marginTop: 4 },
  favoriteToggleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  favoriteToggleText: { color: colors.textFaint, fontSize: 13, marginLeft: 10, flex: 1 },
  submitButton: { backgroundColor: colors.primary, padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  disabledButton: { opacity: 0.7 },
  submitText: { color: colors.onPrimary, fontSize: 18, fontWeight: 'bold' },
  cancelButton: { padding: 15, alignItems: 'center', marginTop: 5 },
  cancelText: { color: colors.textSecondary, fontSize: 16 },
  errorText: { color: 'red', textAlign: 'center', fontSize: 18 },
});
