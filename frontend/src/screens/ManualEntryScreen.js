import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native';
import { saveMeal, getFavorites, removeFavorite, addFavorite, analyzeMeal, searchFoods } from '../services/api';
import { useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import BackButton from '../components/BackButton';
import { useAppAlert } from '../components/AppAlertProvider';

const EditableField = ({ label, value, onChangeText, unit, keyboardType = 'default', placeholder }) => (
  <View style={styles.fieldContainer}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View style={styles.inputContainer}>
      <TextInput
        style={styles.input}
        value={String(value)}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor="#666"
      />
      {unit && <Text style={styles.unitText}>{unit}</Text>}
    </View>
  </View>
);

export default function ManualEntryScreen({ navigation, route }) {
  const showAlert = useAppAlert();
  // Usa route.params diretamente, que já é fornecido pelo React Navigation
  const { targetDate, scannedProduct } = route.params;

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
      } catch (error) {
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
      } catch (error) {
        showAlert("Erro", "Não foi possível carregar seus pratos favoritos.");
      } finally {
        setLoadingFavorites(false);
      }
    };
    fetchFavorites();
  }, []);

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
    navigation.navigate('MealConfirmation', { draftMeal, targetDate });
  };

  const handleEstimate = async () => {
    if (!meal.description.trim()) {
      showAlert('Atenção', 'Descreva o alimento antes de estimar automaticamente.');
      return;
    }

    setEstimating(true);
    try {
      const draftMeal = await analyzeMeal(null, meal.description);
      navigation.navigate('MealConfirmation', { draftMeal, targetDate });
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
        } catch (favoriteError) {
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
        <Text style={styles.favDesc}>{item.description}</Text>
        <Text style={styles.favMacros}>{item.calories.toFixed(0)} kcal • P: {item.protein_g.toFixed(1)}g • C: {item.carbs_g.toFixed(1)}g • G: {item.fat_g.toFixed(1)}g</Text>
      </View>
      <View style={styles.favActions}>
        <TouchableOpacity style={styles.favButton} onPress={() => handleAddFavoriteToToday(item)}>
          <Ionicons name="add-circle" size={26} color="#00FF66" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.favButton} onPress={() => handleRemoveFavorite(item.id)}>
          <Ionicons name="trash" size={22} color="#FF6B6B" />
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
    <FlatList
      style={styles.container}
      data={favorites}
      renderItem={renderFavoriteItem}
      keyExtractor={(item) => item.id.toString()}
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
              />

              {meal.description.trim().length >= 2 && (searching || searchResults.length > 0) && (
                <View style={styles.searchResultsContainer}>
                  {searching ? (
                    <ActivityIndicator color="#00FF66" style={{ marginVertical: 12 }} />
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
                  <ActivityIndicator color="#00FF66" />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={18} color="#00FF66" style={{ marginRight: 8 }} />
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
              />
              <EditableField
                label="Proteínas"
                value={meal.protein_g}
                onChangeText={(text) => handleFieldChange('protein_g', text)}
                unit="g"
                keyboardType="numeric"
                placeholder="45"
              />
              <EditableField
                label="Carboidratos"
                value={meal.carbs_g}
                onChangeText={(text) => handleFieldChange('carbs_g', text)}
                unit="g"
                keyboardType="numeric"
                placeholder="50"
              />
              <EditableField
                label="Gorduras"
                value={meal.fat_g}
                onChangeText={(text) => handleFieldChange('fat_g', text)}
                unit="g"
                keyboardType="numeric"
                placeholder="18"
              />
            </View>

            <TouchableOpacity style={styles.favoriteToggleRow} onPress={() => setSaveAsFavorite((prev) => !prev)}>
              <Ionicons name={saveAsFavorite ? 'checkbox' : 'square-outline'} size={22} color={saveAsFavorite ? '#00FF66' : '#888'} />
              <Text style={styles.favoriteToggleText}>Salvar este alimento como favorito, pra adicionar mais rápido depois</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.submitButton, loading && styles.disabledButton]} onPress={handleSaveMeal} disabled={loading}>
              {loading ? <ActivityIndicator color="#121212" /> : <Text style={styles.submitText}>Salvar Refeição</Text>}
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Seus Pratos Favoritos</Text>
          {loadingFavorites && <ActivityIndicator color="#00FF66" style={{ marginTop: 20 }} />}
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  section: { marginBottom: 30 },
  sectionTitle: { color: '#FFF', fontSize: 20, fontWeight: '600', marginBottom: 15, borderTopColor: '#333', borderTopWidth: 1, paddingTop: 20 },
  card: { backgroundColor: '#1E1E1E', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 16, marginBottom: 20 },
  fieldContainer: { marginVertical: 10, borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 15 },
  fieldLabel: { color: '#888', fontSize: 14, marginBottom: 5 },
  inputContainer: { flexDirection: 'row', alignItems: 'center' },
  input: { color: '#FFF', fontSize: 18, flex: 1, fontWeight: '500', paddingVertical: 5 },
  unitText: { color: '#888', fontSize: 16, marginLeft: 10 },
  searchResultsContainer: { backgroundColor: '#121212', borderRadius: 10, marginTop: -5, marginBottom: 10, borderWidth: 1, borderColor: '#333', overflow: 'hidden' },
  searchResultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  searchResultName: { color: '#FFF', fontSize: 14, fontWeight: '500', flex: 1, marginRight: 10, textTransform: 'capitalize' },
  searchResultMacros: { color: '#888', fontSize: 12 },
  estimateButton: { flexDirection: 'row', backgroundColor: 'transparent', borderWidth: 1, borderColor: '#00FF66', padding: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  estimateText: { color: '#00FF66', fontSize: 15, fontWeight: 'bold' },
  estimateHint: { color: '#666', fontSize: 12, textAlign: 'center', marginTop: 8, marginBottom: 4 },
  favoriteToggleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 4 },
  favoriteToggleText: { color: '#AAA', fontSize: 13, marginLeft: 10, flex: 1 },
  submitButton: { backgroundColor: '#00FF66', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  disabledButton: { opacity: 0.7 },
  submitText: { color: '#121212', fontSize: 18, fontWeight: 'bold' },
  cancelButton: { padding: 15, alignItems: 'center', marginTop: 5 },
  cancelText: { color: '#888', fontSize: 16, paddingBottom: 40 },
  // Estilos dos Favoritos
  favCard: { backgroundColor: '#1E1E1E', borderRadius: 12, padding: 15, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  favInfo: { flex: 1, marginRight: 10 },
  favDesc: { color: '#FFF', fontSize: 16, fontWeight: '500', textTransform: 'capitalize' },
  favMacros: { color: '#888', fontSize: 12, marginTop: 4 },
  favActions: { flexDirection: 'row' },
  favButton: { paddingHorizontal: 10 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 10, fontSize: 14 },
});