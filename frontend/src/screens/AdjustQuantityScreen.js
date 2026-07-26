import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { updateMeal } from '../services/api';
import BackButton from '../components/BackButton';
import { useAppAlert } from '../components/AppAlertProvider';

export default function AdjustQuantityScreen({ navigation, route }) {
  const showAlert = useAppAlert();
  const { meal: initialMeal } = route.params;

  // Refeições registradas via IA (foto/texto) têm detalhamento por item — refeições antigas
  // ou manuais (sem "items") caem no modo legado: um único campo de quantidade pra refeição toda.
  const hasItems = Boolean(initialMeal.items && initialMeal.items.length > 0);

  // --- MODO ITEMIZADO ---
  // Deriva os macros base (por 100g) de cada item a partir do que já foi salvo,
  // sem precisar chamar a IA de novo: base = valor salvo / (quantidade salva / 100).
  const [items, setItems] = useState(() => {
    if (!hasItems) return [];
    return initialMeal.items.map((item) => {
      const savedQuantity = item.quantity_g > 0 ? item.quantity_g : 100;
      const ratio = 100 / savedQuantity;
      return {
        description: item.description,
        baseCalories: item.calories * ratio,
        baseProtein_g: item.protein_g * ratio,
        baseCarbs_g: item.carbs_g * ratio,
        baseFat_g: item.fat_g * ratio,
        quantity: String(savedQuantity),
      };
    });
  });

  // --- MODO LEGADO ---
  const [legacyQuantity, setLegacyQuantity] = useState(String(initialMeal.quantity_g || 100));

  const [saving, setSaving] = useState(false);

  const updateItemQuantity = (index, text) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, quantity: text } : item)));
  };

  const scaledItems = useMemo(() => {
    return items.map((item) => {
      const numQuantity = parseFloat(item.quantity) || 0;
      const ratio = numQuantity / 100;
      return {
        ...item,
        numQuantity,
        scaledCalories: item.baseCalories * ratio,
        scaledProtein_g: item.baseProtein_g * ratio,
        scaledCarbs_g: item.baseCarbs_g * ratio,
        scaledFat_g: item.baseFat_g * ratio,
      };
    });
  }, [items]);

  const legacyMacros = useMemo(() => {
    const numQuantity = parseFloat(legacyQuantity) || 0;
    const savedQuantity = initialMeal.quantity_g > 0 ? initialMeal.quantity_g : 100;
    const ratio = numQuantity / savedQuantity;
    return {
      calories: initialMeal.calories * ratio,
      protein_g: initialMeal.protein_g * ratio,
      carbs_g: initialMeal.carbs_g * ratio,
      fat_g: initialMeal.fat_g * ratio,
    };
  }, [legacyQuantity, initialMeal]);

  const totals = useMemo(() => {
    if (!hasItems) return legacyMacros;
    return scaledItems.reduce(
      (acc, item) => ({
        calories: acc.calories + item.scaledCalories,
        protein_g: acc.protein_g + item.scaledProtein_g,
        carbs_g: acc.carbs_g + item.scaledCarbs_g,
        fat_g: acc.fat_g + item.scaledFat_g,
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
  }, [hasItems, scaledItems, legacyMacros]);

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
          calories: legacyMacros.calories,
          protein_g: legacyMacros.protein_g,
          carbs_g: legacyMacros.carbs_g,
          fat_g: legacyMacros.fat_g,
          quantity_g: parseFloat(legacyQuantity) || 0,
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

  return (
    <ScrollView style={styles.container}>
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
            <Text style={styles.itemMacros}>
              {item.scaledCalories.toFixed(0)} kcal • P: {item.scaledProtein_g.toFixed(1)}g • C: {item.scaledCarbs_g.toFixed(1)}g • G: {item.scaledFat_g.toFixed(1)}g
            </Text>
          </View>
        ))
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nova Quantidade</Text>
          <View style={styles.quantityContainer}>
            <TextInput
              style={styles.quantityInput}
              value={legacyQuantity}
              onChangeText={setLegacyQuantity}
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
  );
}

// Estilos baseados na MealConfirmationScreen para consistência
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
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
