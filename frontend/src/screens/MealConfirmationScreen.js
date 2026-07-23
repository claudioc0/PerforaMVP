import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { saveMeal } from '../services/api';
import BackButton from '../components/BackButton';

export default function MealConfirmationScreen({ navigation, route }) {
  // 1. Recebe os dados da análise (rascunho) e a data da tela anterior
  const { draftMeal, targetDate } = route.params;

  // Estado para a quantidade em gramas — parte da estimativa da IA (baseada na foto/descrição),
  // com 100g como fallback caso ela não tenha conseguido estimar.
  const [quantity, setQuantity] = useState(String(draftMeal?.estimated_grams || 100));
  const [loading, setLoading] = useState(false);

  // 2. Lógica de recálculo dos macros em tempo real (Regra de Três)
  const calculatedMacros = useMemo(() => {
    const numQuantity = parseFloat(quantity) || 0;
    if (!draftMeal || numQuantity <= 0) {
      return {
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
      };
    }
    // A análise original é baseada em 100g
    const base = 100;
    return {
      calories: (draftMeal.calories / base) * numQuantity,
      protein_g: (draftMeal.protein_g / base) * numQuantity,
      carbs_g: (draftMeal.carbs_g / base) * numQuantity,
      fat_g: (draftMeal.fat_g / base) * numQuantity,
    };
  }, [draftMeal, quantity]);

  // 3. Função para submeter a refeição confirmada
  const handleConfirmMeal = async () => {
    setLoading(true);
    try {
      // Monta o payload final com os dados recalculados
      // 2. Correção de Dados: Garante que o payload enviado para a API tenha números limpos
      const finalMealData = {
        ...draftMeal, // description, confidence, source_type
        ...calculatedMacros, // Usa os valores já calculados e arredondados do useMemo
        quantity_g: parseFloat(quantity) || 100, // Quantidade confirmada pelo usuário
        date: targetDate, // Adiciona a data para o backend salvar no dia certo
      };

      await saveMeal(finalMealData);

      Alert.alert('Sucesso', 'Refeição registrada!');
      // Navega para o Dashboard, o 'goBack(2)' pode variar dependendo da pilha.
      // Uma forma mais robusta é navegar direto para o Dashboard.
      navigation.navigate('Dashboard');

    } catch (error) {
      Alert.alert('Erro ao Salvar', error.message || 'Não foi possível registrar a refeição.');
    } finally {
      setLoading(false);
    }
  };

  if (!draftMeal) {
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
      <Text style={styles.descriptionText}>{draftMeal.description}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Ajustar Quantidade</Text>
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
        {draftMeal?.estimated_grams > 0 && (
          <Text style={styles.estimateHint}>Estimativa da IA — ajuste se necessário</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Estimativa Nutricional</Text>
        <View style={styles.macrosGrid}>
          {/* 1. Correção Visual: Adiciona .toFixed() para formatar a exibição */}
          <View style={styles.macroBox}>
            <Text style={styles.macroValue}>{calculatedMacros.calories.toFixed(0)}</Text>
            <Text style={styles.macroLabel}>Kcal</Text>
          </View>
          <View style={styles.macroBox}>
            <Text style={styles.macroValue}>{calculatedMacros.protein_g.toFixed(1)} g</Text>
            <Text style={styles.macroLabel}>Proteína</Text>
          </View>
          <View style={styles.macroBox}>
            <Text style={styles.macroValue}>{calculatedMacros.carbs_g.toFixed(1)} g</Text>
            <Text style={styles.macroLabel}>Carbo</Text>
          </View>
          <View style={styles.macroBox}>
            <Text style={styles.macroValue}>{calculatedMacros.fat_g.toFixed(1)} g</Text>
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
  descriptionText: { color: '#00FF66', fontSize: 20, fontWeight: '500', textAlign: 'center', marginBottom: 30, textTransform: 'capitalize' },
  card: { backgroundColor: '#1E1E1E', padding: 20, borderRadius: 16, marginBottom: 20 },
  cardTitle: { color: '#FFF', fontSize: 18, fontWeight: '600', marginBottom: 15 },
  quantityContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#333', borderRadius: 10 },
  estimateHint: { color: '#888', fontSize: 12, marginTop: 10, textAlign: 'center' },
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
  errorText: { color: 'red', textAlign: 'center', fontSize: 18 },
});
