import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, FlatList } from 'react-native';
import { saveMeal, getFavorites, removeFavorite } from '../services/api';
import { useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import BackButton from '../components/BackButton';

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
    const fetchFavorites = async () => {
      try {
        const favs = await getFavorites();
        setFavorites(favs);
      } catch (error) {
        Alert.alert("Erro", "Não foi possível carregar seus pratos favoritos.");
      } finally {
        setLoadingFavorites(false);
      }
    };
    fetchFavorites();
  }, []);

  const handleFieldChange = (field, text) => {
    setMeal(prev => ({ ...prev, [field]: text }));
  };

  const handleSaveMeal = async () => {
    if (!meal.description || !meal.calories || !meal.protein_g || !meal.carbs_g || !meal.fat_g) {
      Alert.alert('Atenção', 'Por favor, preencha todos os campos.');
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

      Alert.alert('Sucesso', 'Refeição registrada manualmente!');
      navigation.goBack();

    } catch (error) {
      Alert.alert('Erro ao Salvar', error.message || 'Não foi possível registrar a refeição.');
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
      Alert.alert('Sucesso!', `"${favorite.description}" foi adicionado ao seu dia.`);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Erro', error.message || 'Não foi possível adicionar o prato favorito.');
    }
  };

  const handleRemoveFavorite = async (favId) => {
    Alert.alert(
      "Excluir Favorito",
      "Tem certeza que deseja remover este prato da sua lista de favoritos?",
      [
        { text: "Não", style: "cancel" },
        {
          text: "Sim",
          onPress: async () => {
            try {
              await removeFavorite(favId);
              // Atualização otimista da UI
              setFavorites(currentFavorites => currentFavorites.filter(f => f.id !== favId));
              Alert.alert("Removido", "O prato foi removido dos seus favoritos.");
            } catch (error) {
              Alert.alert("Erro", error.message || "Não foi possível remover o favorito.");
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
    <ScrollView style={styles.container}>
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

        <TouchableOpacity style={[styles.submitButton, loading && styles.disabledButton]} onPress={handleSaveMeal} disabled={loading}>
          {loading ? <ActivityIndicator color="#121212" /> : <Text style={styles.submitText}>Salvar Refeição</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Seus Pratos Favoritos</Text>
        {loadingFavorites ? (
          <ActivityIndicator color="#00FF66" style={{ marginTop: 20 }} />
        ) : (
          <FlatList
            data={favorites}
            renderItem={renderFavoriteItem}
            keyExtractor={(item) => item.id.toString()}
            ListEmptyComponent={<Text style={styles.emptyText}>Você ainda não tem pratos favoritos.</Text>}
            scrollEnabled={false} // A ScrollView principal já cuida do scroll
          />
        )}
      </View>

      <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
        <Text style={styles.cancelText}>Cancelar</Text>
      </TouchableOpacity>
    </ScrollView>
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