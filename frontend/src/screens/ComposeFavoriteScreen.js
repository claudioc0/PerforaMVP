import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { searchFoods, addFavorite } from '../services/api';
import BackButton from '../components/BackButton';
import MacroSummaryLine from '../components/MacroSummaryLine';
import { useAppAlert } from '../components/AppAlertProvider';
import { useTheme } from '../theme/ThemeContext';

// Monta um prato composto a partir de vários itens do catálogo (cada um com
// quantidade própria) e salva como UM favorito só, com `items` preenchido —
// diferente do favorito "achatado" de sempre (uma refeição, um item
// implícito), pra registrar em 1 toque depois (ManualEntryScreen já sabe
// preservar `items` ao "adicionar a hoje").
export default function ComposeFavoriteScreen({ navigation }) {
  const showAlert = useAppAlert();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [comboName, setComboName] = useState('');
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timeoutId = setTimeout(async () => {
      try {
        const results = await searchFoods(trimmed);
        setSearchResults(results);
      } catch {
        // Busca é um atalho — sem resultados, o usuário só não consegue adicionar por aqui agora.
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [query]);

  const addItemFromCatalog = (catalogItem) => {
    setItems((prev) => [
      ...prev,
      {
        localId: `${Date.now()}-${Math.random()}`,
        description: catalogItem.name,
        baseCalories: catalogItem.calories,
        baseProteinG: catalogItem.protein_g,
        baseCarbsG: catalogItem.carbs_g,
        baseFatG: catalogItem.fat_g,
        quantity: '100',
      },
    ]);
    setQuery('');
    setSearchResults([]);
  };

  const updateItemQuantity = (localId, text) => {
    setItems((prev) => prev.map((item) => (item.localId === localId ? { ...item, quantity: text } : item)));
  };

  const removeItem = (localId) => {
    setItems((prev) => prev.filter((item) => item.localId !== localId));
  };

  // Cada item do catálogo já vem por 100g — escala pela quantidade que o
  // usuário definir pra ESTE combo, mesma conta de useScaledMealItems.
  const scaledItems = useMemo(() => {
    return items.map((item) => {
      const numQuantity = parseFloat(item.quantity.replace(',', '.')) || 0;
      const factor = numQuantity / 100;
      return {
        ...item,
        numQuantity,
        scaledCalories: item.baseCalories * factor,
        scaledProteinG: item.baseProteinG * factor,
        scaledCarbsG: item.baseCarbsG * factor,
        scaledFatG: item.baseFatG * factor,
      };
    });
  }, [items]);

  const totals = useMemo(() => {
    return scaledItems.reduce(
      (acc, item) => ({
        calories: acc.calories + item.scaledCalories,
        protein_g: acc.protein_g + item.scaledProteinG,
        carbs_g: acc.carbs_g + item.scaledCarbsG,
        fat_g: acc.fat_g + item.scaledFatG,
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
  }, [scaledItems]);

  const handleSave = async () => {
    if (!comboName.trim()) {
      showAlert('Atenção', 'Dê um nome pro combo (ex: "Marmita de terça").');
      return;
    }
    if (scaledItems.length === 0) {
      showAlert('Atenção', 'Adicione pelo menos um item ao combo.');
      return;
    }
    const invalidItem = scaledItems.find((item) => !item.numQuantity || item.numQuantity <= 0);
    if (invalidItem) {
      showAlert('Atenção', `Informe uma quantidade válida (em gramas) para "${invalidItem.description}".`);
      return;
    }

    setSaving(true);
    try {
      await addFavorite({
        description: comboName.trim(),
        items: scaledItems.map((item) => ({
          description: item.description,
          calories: item.scaledCalories,
          protein_g: item.scaledProteinG,
          carbs_g: item.scaledCarbsG,
          fat_g: item.scaledFatG,
          quantity_g: item.numQuantity,
        })),
      });
      showAlert('Sucesso', 'Combo salvo nos seus favoritos!');
      navigation.goBack();
    } catch (error) {
      showAlert('Erro', error.message || 'Não foi possível salvar o combo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={[styles.container, { paddingTop: insets.top + 20 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <BackButton />
          <Text style={styles.headerTitle}>Novo Prato Composto</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Nome do combo</Text>
          <TextInput
            style={styles.nameInput}
            value={comboName}
            onChangeText={setComboName}
            placeholder="Ex: Marmita de terça"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Adicionar item do catálogo</Text>
          <TextInput
            style={styles.nameInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar alimento..."
            placeholderTextColor={colors.textMuted}
          />
          {query.trim().length >= 2 && (searching || searchResults.length > 0) && (
            <View style={styles.searchResultsContainer}>
              {searching ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
              ) : (
                searchResults.map((item) => (
                  <TouchableOpacity key={item.id} style={styles.searchResultRow} onPress={() => addItemFromCatalog(item)}>
                    <Text style={styles.searchResultName}>{item.name}</Text>
                    <Text style={styles.searchResultMacros}>{item.calories.toFixed(0)} kcal /100g</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </View>

        {scaledItems.map((item) => (
          <View key={item.localId} style={styles.itemCard}>
            <View style={styles.itemHeaderRow}>
              <Text style={styles.itemDesc}>{item.description}</Text>
              <TouchableOpacity
                onPress={() => removeItem(item.localId)}
                accessibilityRole="button"
                accessibilityLabel={`Remover "${item.description}" do combo`}
              >
                <Ionicons name="trash-outline" size={20} color={colors.dangerStrong} />
              </TouchableOpacity>
            </View>
            <View style={styles.quantityRow}>
              <TextInput
                style={styles.quantityInput}
                value={item.quantity}
                onChangeText={(text) => updateItemQuantity(item.localId, text)}
                keyboardType="numeric"
                placeholder="100"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={styles.unitText}>gramas</Text>
            </View>
            <MacroSummaryLine
              calories={item.scaledCalories}
              proteinG={item.scaledProteinG}
              carbsG={item.scaledCarbsG}
              fatG={item.scaledFatG}
              style={styles.itemMacros}
            />
          </View>
        ))}

        {scaledItems.length === 0 && (
          <Text style={styles.emptyText}>Busque itens do catálogo acima pra montar o combo.</Text>
        )}

        {scaledItems.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Total do Combo</Text>
            <View style={styles.macrosGrid}>
              <View style={styles.macroBox}><Text style={styles.macroValue} maxFontSizeMultiplier={1.3}>{totals.calories.toFixed(0)}</Text><Text style={styles.macroLabel} maxFontSizeMultiplier={1.3}>Kcal</Text></View>
              <View style={styles.macroBox}><Text style={styles.macroValue} maxFontSizeMultiplier={1.3}>{totals.protein_g.toFixed(1)} g</Text><Text style={styles.macroLabel} maxFontSizeMultiplier={1.3}>Proteína</Text></View>
              <View style={styles.macroBox}><Text style={styles.macroValue} maxFontSizeMultiplier={1.3}>{totals.carbs_g.toFixed(1)} g</Text><Text style={styles.macroLabel} maxFontSizeMultiplier={1.3}>Carbo</Text></View>
              <View style={styles.macroBox}><Text style={styles.macroValue} maxFontSizeMultiplier={1.3}>{totals.fat_g.toFixed(1)} g</Text><Text style={styles.macroLabel} maxFontSizeMultiplier={1.3}>Gordura</Text></View>
            </View>
          </View>
        )}

        <TouchableOpacity style={[styles.submitButton, saving && styles.disabledButton]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.submitText}>Salvar Combo</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancelar</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 60 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  headerTitle: { flex: 1, color: colors.white, fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  card: { backgroundColor: colors.surface, padding: 20, borderRadius: 16, marginBottom: 15 },
  cardTitle: { color: colors.white, fontSize: 18, fontWeight: '600', marginBottom: 15 },
  fieldLabel: { color: colors.textSecondary, fontSize: 14, marginBottom: 8 },
  nameInput: { backgroundColor: colors.background, color: colors.white, padding: 15, borderRadius: 10, fontSize: 16 },
  searchResultsContainer: { backgroundColor: colors.background, borderRadius: 10, marginTop: 10, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  searchResultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  searchResultName: { color: colors.white, fontSize: 14, fontWeight: '500', flex: 1, marginRight: 10, textTransform: 'capitalize' },
  searchResultMacros: { color: colors.textSecondary, fontSize: 12 },
  itemCard: { backgroundColor: colors.surface, padding: 16, borderRadius: 16, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: colors.primary },
  itemHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  itemDesc: { color: colors.white, fontSize: 16, fontWeight: '600', flex: 1, marginRight: 10, textTransform: 'capitalize' },
  quantityRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: 10 },
  quantityInput: { color: colors.white, fontSize: 18, padding: 12, flex: 1, fontWeight: 'bold' },
  unitText: { color: colors.textSecondary, fontSize: 14, paddingRight: 15 },
  itemMacros: { color: colors.textSecondary, fontSize: 13, marginTop: 8 },
  emptyText: { color: colors.textSecondary, textAlign: 'center', marginVertical: 20, fontSize: 14 },
  macrosGrid: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
  macroBox: { alignItems: 'center', width: '48%', marginBottom: 15 },
  macroValue: { color: colors.white, fontSize: 24, fontWeight: 'bold' },
  macroLabel: { color: colors.textSecondary, fontSize: 14, marginTop: 4 },
  submitButton: { backgroundColor: colors.primary, padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  disabledButton: { opacity: 0.7 },
  submitText: { color: colors.onPrimary, fontSize: 18, fontWeight: 'bold' },
  cancelButton: { padding: 15, alignItems: 'center', marginTop: 5 },
  cancelText: { color: colors.textSecondary, fontSize: 16, paddingBottom: 40 },
});
