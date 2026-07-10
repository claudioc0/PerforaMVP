import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { analyzeMeal } from '../services/api';

export default function CameraScreen({ navigation, route }) {
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const { targetDate } = route.params || {}; // Captura a data dos parâmetros da rota
  
  const takePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      alert("Precisamos da permissão da câmera para analisar o prato!");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleAnalyze = async () => {
    if (!imageUri && !description) {
      Alert.alert("Atenção", "Tire uma foto ou descreva a refeição em texto.");
      return;
    }

    setAnalyzing(true);
    try {
      // 1. Chama a API de análise para obter o rascunho (sem a data)
      const draftMeal = await analyzeMeal(imageUri, description);
      
      // 2. Navega para a tela de confirmação, passando o rascunho e a data
      navigation.navigate('MealConfirmation', { 
        draftMeal, 
        targetDate 
      });
    } catch (error) {
      Alert.alert("Erro na Análise", error.message || "Falha ao analisar a refeição. Verifique o servidor.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Nova Refeição</Text>
      
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.previewImage} />
      ) : (
        <View style={styles.placeholderBox}>
          <Text style={styles.placeholderText}>Nenhuma imagem capturada</Text>
        </View>
      )}

      <TouchableOpacity style={styles.cameraButton} onPress={takePhoto}>
        <Text style={styles.buttonText}>Abrir Câmera</Text>
      </TouchableOpacity>

      <Text style={styles.orText}>OU</Text>

      <TextInput
        style={styles.input}
        placeholder="Descreva o prato (ex: 200g de frango)"
        placeholderTextColor="#666"
        value={description}
        onChangeText={setDescription}
      />

      <TouchableOpacity 
        style={[styles.submitButton, analyzing && styles.disabledButton]} 
        onPress={handleAnalyze}
        disabled={analyzing}
      >
        {analyzing ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <ActivityIndicator color="#121212" style={{ marginRight: 10 }} />
            <Text style={styles.submitText}>Mapeando nutrientes...</Text>
          </View>
        ) : (
          <Text style={styles.submitText}>Analisar com IA</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
        <Text style={styles.cancelText}>Cancelar e Voltar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60 },
  headerTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  previewImage: { width: '100%', height: 250, borderRadius: 16, marginBottom: 20 },
  placeholderBox: { width: '100%', height: 250, backgroundColor: '#1E1E1E', borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderColor: '#333', borderWidth: 1, borderStyle: 'dashed' },
  placeholderText: { color: '#666' },
  cameraButton: { backgroundColor: '#333', padding: 15, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  orText: { color: '#666', textAlign: 'center', marginVertical: 20 },
  input: { backgroundColor: '#1E1E1E', color: '#FFF', padding: 15, borderRadius: 12, fontSize: 16, marginBottom: 20 },
  submitButton: { backgroundColor: '#00FF66', padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 15 },
  disabledButton: { opacity: 0.7 },
  submitText: { color: '#121212', fontSize: 18, fontWeight: 'bold' },
  cancelButton: { padding: 15, alignItems: 'center' },
  cancelText: { color: '#888', fontSize: 16 }
});