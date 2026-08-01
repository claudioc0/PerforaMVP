import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { saveMeal, getFavorites, removeFavorite, addFavorite, analyzeMeal, searchFoods } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import BackButton from '../components/BackButton';
import MacroSummaryLine from '../components/MacroSummaryLine';
import { useAppAlert } from '../components/AppAlertProvider';
import { useTheme } from '../theme/ThemeContext';
import { ROUTES } from '../navigation/routes';

const EditableField = ({ label, value, onChangeText, unit, keyboardType = 'default', placeholder, styles, colors }) => (
  <View style={styles.fieldContainer}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View style={styles.inputContainer}>
      <TextInput
        style={styles.input}
        value={String(value)}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
      />
      {unit && <Text style={styles.unitText}>{unit}</Text>}
    </View>
  </View>
);

export default function ManualEntryScreen({ navigation, route }) {
  const showAlert = useAppAlert();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // route.params pode vir ausente (navegação sem os parâmetros esperados,
  // ex: um deep link ou uma rota antiga) — sem o `|| {}`, o destructuring
  // quebra na hora, derrubando a tela inteira (só o ErrorBoundary global
  // evitaria a tela branca; melhor nem chegar lá).
  const { targetDate, scannedProduct } = route.params || {};

  const [favorites, setFavorites] = useState([]);
  const [loadingFavorites, setLoadingFavorites] = useState(true);

  const [meal, setMeal] = useState({
    description: '',
    calories: '',
    protein_g: '',
    carbs_g: '',
    fat_g: '',
  });
  const [loading, setLoading] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [saveAsFavorite, setSaveAsFavorite] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    // Preenche o formulário se um produto escaneado for recebido
    if (scannedProduct) {
      setMeal({
        description: scannedProduct.description || '',
        calories: scannedProduct.calories?.toFixed(0) || '0',
        protein_g: scannedProduct.protein_g?.toFixed(1) || '0.0',
        carbs_g: scannedProduct.carbs_g?.toFixed(1) || '0.0',
        fat_g: scannedProduct.fat_g?.toFixed(1) || '0.0',
      });
    }
  }, [scannedProduct]);

  useEffect(() => {
    const query = meal.description.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timeoutId = setTimeout(async () => {
      try {
        const results = await searchFoods(query);
        setSearchResults(results);
      } catch {
        // Busca no catálogo é um atalho a mais — falha aqui não afeta a estimativa por IA nem o preenchimento manual.
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [meal.description]);

  useEffect(() => {
    const fetchFavorites = async () => {
      try {
        const favs = await getFavorites();
        setFavorites(favs);
      } catch {
        showAlert("Erro", "Não foi possível carregar seus pratos favoritos.");
      } finally {
        setLoadingFavorites(false);
      }
    };
    fetchFavorites();
  }, [showAlert]);

  const handleFieldChange = (field, text) => {
    setMeal(prev => ({ ...prev, [field]: text }));
  };

  const handleSelectCatalogItem = (item) => {
    const draftMeal = {
      items: [{
        description: item.name,
        calories: item.calories,
        protein_g: item.protein_g,
        carbs_g: item.carbs_g,
        fat_g: item.fat_g,
        estimated_grams: 100,
      }],
      confidence: 1,
      source_type: 'catalog',
    };
    setSearchResults([]);
    navigation.navigate(ROUTES.MEAL_CONFIRMATION, { draftMeal, targetDate });
  };

  const handleEstimate = async () => {
    if (!meal.description.trim()) {
      showAlert('Atenção', 'Descreva o alimento antes de estimar automaticamente.');
      return;
    }

    setEstimating(true);
    try {
      const draftMeal = await analyzeMeal(null, meal.description);
      navigation.navigate(ROUTES.MEAL_CONFIRMATION, { draftMeal, targetDate });
    } catch (error) {
      // Checa o status HTTP de verdade (o backend devolve 429 nesse caso) em
      // vez de adivinhar pelo texto da mensagem de erro.
      const errorMsg = error.message || '';
      if (error.status === 429) {
        showAlert('Servidores Ocupados ⚡', 'Nossa IA está processando muitos pratos agora. Tente de novo em instantes ou preencha os valores manualmente abaixo.');
      } else {
        showAlert('Erro na Estimativa', errorMsg || 'Não foi possível estimar os valores. Preencha manualmente abaixo.');
      }
    } finally {
      setEstimating(false);
    }
  };

  const handleSaveMeal = async () => {
    if (!meal.description || !meal.calories || !meal.protein_g || !meal.carbs_g || !meal.fat_g) {
      showAlert('Atenção', 'Por favor, preencha todos os campos.');
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

      if (saveAsFavorite) {
        try {
          await addFavorite({
            description: payload.description,
            calories: payload.calories,
            protein_g: payload.protein_g,
            carbs_g: payload.carbs_g,
            fat_g: payload.fat_g,
          });
        } catch {
          // A refeição já foi registrada com sucesso — falha ao favoritar não deve bloquear o fluxo.
        }
      }

      showAlert('Sucesso', 'Refeição registrada manualmente!');
      navigation.goBack();

    } catch (error) {
      showAlert('Erro ao Salvar', error.message || 'Não foi possível registrar a refeição.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddFavoriteToToday = async (favorite) => {
    try {
      const payload = {
        ...favorite,
        // Preserva a composição (items) na refeição logada quando o
        // favorito é um prato composto — sem isso, "adicionar a hoje"
        // colapsaria o combo de volta pra um único item achatado.
        items: favorite.items && favorite.items.length > 0 ? favorite.items : undefined,
        source_type: 'favorite',
        date: targetDate,
      };
      await saveMeal(payload);
      showAlert('Sucesso!', `"${favorite.description}" foi adicionado ao seu dia.`);
      navigation.goBack();
    } catch (error) {
      showAlert('Erro', error.message || 'Não foi possível adicionar o prato favorito.');
    }
  };

  const handleRemoveFavorite = async (favId) => {
    showAlert(
      "Excluir Favorito",
      "Tem certeza que deseja remover este prato da sua lista de favoritos?",
      [
        { text: "Não", style: "cancel" },
        {
          text: "Sim",
          style: "destructive",
          onPress: async () => {
            try {
              await removeFavorite(favId);
              // Atualização otimista da UI
              setFavorites(currentFavorites => currentFavorites.filter(f => f.id !== favId));
              showAlert("Removido", "O prato foi removido dos seus favoritos.");
            } catch (error) {
              showAlert("Erro", error.message || "Não foi possível remover o favorito.");
            }
          },
        },
      ]
    );
  };

  const renderFavoriteItem = ({ item }) => (
    <View style={styles.favCard}>
      <View style={styles.favInfo}>
        <Text style={styles.favDesc}>
          {item.description}
          {item.items?.length > 0 && <Text style={styles.favComboTag}>  · {item.items.length} itens</Text>}
        </Text>
        <MacroSummaryLine
          calories={item.calories}
          proteinG={item.protein_g}
          carbsG={item.carbs_g}
          fatG={item.fat_g}
          style={styles.favMacros}
        />
      </View>
      <View style={styles.favActions}>
        <TouchableOpacity
          style={styles.favButton}
          onPress={() => handleAddFavoriteToToday(item)}
          accessibilityRole="button"
          accessibilityLabel={`Adicionar "${item.description}" aos registros de hoje`}
        >
          <Ionicons name="add-circle" size={26} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.favButton}
          onPress={() => handleRemoveFavorite(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`Remover "${item.description}" dos favoritos`}
        >
          <Ionicons name="trash" size={22} color={colors.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    // Um único FlatList raiz (não um ScrollView com outro FlatList
    // scrollEnabled=false dentro) — aninhar assim anula a virtualização de
    // favoritos: TODA linha monta de uma vez, independente do que está
    // visível na tela. Com um histórico grande de favoritos, a tela travava
    // por um instante ao abrir. O formulário inteiro vira o
    // ListHeaderComponent.
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <FlatList
      style={[styles.container, { paddingTop: insets.top + 20 }]}
      data={favorites}
      renderItem={renderFavoriteItem}
      keyExtractor={(item) => item.id.toString()}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <>
          <View style={styles.headerRow}>
            <BackButton />
            <Text style={styles.headerTitle}>Registro Manual</Text>
          </View>

          <View style={styles.section}>
            <View style={styles.card}>
              <EditableField
                label="Descrição do Alimento"
                value={meal.description}
                onChangeText={(text) => handleFieldChange('description', text)}
                keyboardType="default"
                placeholder="Ex: Arroz, feijão e bife"
                styles={styles}
                colors={colors}
              />

              {meal.description.trim().length >= 2 && (searching || searchResults.length > 0) && (
                <View style={styles.searchResultsContainer}>
                  {searching ? (
                    <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
                  ) : (
                    searchResults.map((item) => (
                      <TouchableOpacity key={item.id} style={styles.searchResultRow} onPress={() => handleSelectCatalogItem(item)}>
                        <Text style={styles.searchResultName}>{item.name}</Text>
                        <Text style={styles.searchResultMacros}>{item.calories.toFixed(0)} kcal /100g</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}

              <TouchableOpacity style={styles.estimateButton} onPress={handleEstimate} disabled={estimating}>
                {estimating ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={18} color={colors.primary} style={{ marginRight: 8 }} />
                    <Text style={styles.estimateText}>Estimar valores com IA</Text>
                  </>
                )}
              </TouchableOpacity>
              <Text style={styles.estimateHint}>Ou preencha os valores manualmente abaixo</Text>

              <EditableField
                label="Calorias"
                value={meal.calories}
                onChangeText={(text) => handleFieldChange('calories', text)}
                unit="kcal"
                keyboardType="numeric"
                placeholder="550"
                styles={styles}
                colors={colors}
              />
              <EditableField
                label="Proteínas"
                value={meal.protein_g}
                onChangeText={(text) => handleFieldChange('protein_g', text)}
                unit="g"
                keyboardType="numeric"
                placeholder="45"
                styles={styles}
                colors={colors}
              />
              <EditableField
                label="Carboidratos"
                value={meal.carbs_g}
                onChangeText={(text) => handleFieldChange('carbs_g', text)}
                unit="g"
                keyboardType="numeric"
                placeholder="50"
                styles={styles}
                colors={colors}
              />
              <EditableField
                label="Gorduras"
                value={meal.fat_g}
                onChangeText={(text) => handleFieldChange('fat_g', text)}
                unit="g"
                keyboardType="numeric"
                placeholder="18"
                styles={styles}
                colors={colors}
              />
            </View>

            <TouchableOpacity
              style={styles.favoriteToggleRow}
              onPress={() => setSaveAsFavorite((prev) => !prev)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: saveAsFavorite }}
            >
              <Ionicons name={saveAsFavorite ? 'checkbox' : 'square-outline'} size={22} color={saveAsFavorite ? colors.primary : colors.textSecondary} />
              <Text style={styles.favoriteToggleText}>Salvar este alimento como favorito, pra adicionar mais rápido depois</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.submitButton, loading && styles.disabledButton]} onPress={handleSaveMeal} disabled={loading}>
              {loading ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.submitText}>Salvar Refeição</Text>}
            </TouchableOpacity>
          </View>

          <View style={styles.favoritesHeaderRow}>
            <Text style={styles.sectionTitle}>Seus Pratos Favoritos</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate(ROUTES.COMPOSE_FAVORITE)}
              accessibilityRole="button"
              accessibilityLabel="Criar novo prato composto"
            >
              <Text style={styles.newComboLink}>+ Novo prato composto</Text>
            </TouchableOpacity>
          </View>
          {loadingFavorites && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}
        </>
      }
      ListEmptyComponent={
        loadingFavorites ? null : <Text style={styles.emptyText}>Você ainda não tem pratos favoritos.</Text>
      }
      ListFooterComponent={
        <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancelar</Text>
        </TouchableOpacity>
      }
    />
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 60 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  headerTitle: { flex: 1, color: colors.white, fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  section: { marginBottom: 30 },
  sectionTitle: { color: colors.white, fontSize: 20, fontWeight: '600' },
  favoritesHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 20 },
  newComboLink: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  favComboTag: { color: colors.textSecondary, fontSize: 12, fontWeight: '400' },
  card: { backgroundColor: colors.surface, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 16, marginBottom: 20 },
  fieldContainer: { marginVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 15 },
  fieldLabel: { color: colors.textSecondary, fontSize: 14, marginBottom: 5 },
  inputContainer: { flexDirection: 'row', alignItems: 'center' },
  input: { color: colors.white, fontSize: 18, flex: 1, fontWeight: '500', paddingVertical: 5 },
  unitText: { color: colors.textSecondary, fontSize: 16, marginLeft: 10 },
  searchResultsContainer: { backgroundColor: colors.background, borderRadius: 10, marginTop: -5, marginBottom: 10, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  searchResultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  searchResultName: { color: colors.white, fontSize: 14, fontWeight: '500', flex: 1, marginRight: 10, textTransform: 'capitalize' },
  searchResultMacros: { color: colors.textSecondary, fontSize: 12 },
  estimateButton: { flexDirection: 'row', backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary, padding: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  estimateText: { color: colors.primary, fontSize: 15, fontWeight: 'bold' },
  estimateHint: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 8, marginBottom: 4 },
  favoriteToggleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 4 },
  favoriteToggleText: { color: colors.textFaint, fontSize: 13, marginLeft: 10, flex: 1 },
  submitButton: { backgroundColor: colors.primary, padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  disabledButton: { opacity: 0.7 },
  submitText: { color: colors.onPrimary, fontSize: 18, fontWeight: 'bold' },
  cancelButton: { padding: 15, alignItems: 'center', marginTop: 5 },
  cancelText: { color: colors.textSecondary, fontSize: 16, paddingBottom: 40 },
  // Estilos dos Favoritos
  favCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 15, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  favInfo: { flex: 1, marginRight: 10 },
  favDesc: { color: colors.white, fontSize: 16, fontWeight: '500', textTransform: 'capitalize' },
  favMacros: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  favActions: { flexDirection: 'row' },
  favButton: { paddingHorizontal: 10 },
  emptyText: { color: colors.textSecondary, textAlign: 'center', marginTop: 10, fontSize: 14 },
});