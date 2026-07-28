import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { analyzeMeal } from '../services/api';
import { fetchProductByBarcode, ProductNotFoundError } from '../services/openFoodFacts';
import BackButton from '../components/BackButton';
import { useAppAlert } from '../components/AppAlertProvider';

export default function CameraScreen({ navigation, route }) {
  const showAlert = useAppAlert();
  const [imageUri, setImageUri] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const { targetDate } = route.params || {}; 
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const takePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      showAlert("Permissão Necessária", "Precisamos da permissão da câmera para analisar o prato!");
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
    if (!imageUri) {
      showAlert("Atenção", "Tire uma foto para analisar a refeição.");
      return;
    }

    setAnalyzing(true);
    try {
      const draftMeal = await analyzeMeal(imageUri, null); 

      navigation.navigate('MealConfirmation', {
        draftMeal,
        targetDate 
      });
    } catch (error) {
      // TRATAMENTO DE ERRO DE COTA/LIMITE DA IA (429) — checa o status HTTP
      // de verdade (o backend agora devolve 429 nesse caso), em vez de
      // adivinhar pelo texto da mensagem de erro (frágil: dependia de a
      // mensagem incluir literalmente "429"/"quota"/"RESOURCE_EXHAUSTED",
      // e não cobria nenhum outro tipo de erro upstream, como timeout).
      const errorMsg = error.message || "";
      if (error.status === 429) {
        showAlert(
          "Servidores Ocupados ⚡",
          "Nossa IA está processando muitos pratos agora. Aguarde um minuto ou adicione os dados manualmente.",
          [
            { text: "Aguardar", style: "cancel" },
            { 
              text: "Entrada Manual", 
              onPress: () => navigation.navigate('ManualEntry', { targetDate }) 
            }
          ]
        );
      } else {
        showAlert("Erro na Análise", errorMsg || "Falha ao analisar a refeição. Verifique o servidor.");
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const handleBarCodeScanned = async ({ type, data }) => {
    if (scanned) return;
    setScanned(true);

    try {
      const product = await fetchProductByBarcode(data);
      navigation.navigate('ManualEntry', {
        scannedProduct: product,
        targetDate: targetDate,
      });
    } catch (error) {
      if (error instanceof ProductNotFoundError) {
        // Isso aqui é uma resposta de verdade do banco de dados ("status !== 1"),
        // não uma falha de rede — o produto genuinamente não está cadastrado.
        showAlert(
          "Produto inédito! 🕵️",
          "Não encontramos este código de barras no banco mundial. Deseja cadastrá-lo manualmente?",
          [
            { text: 'Tentar Novamente', onPress: () => setScanned(false), style: 'cancel' },
            {
              text: 'Cadastrar Manual',
              onPress: () => {
                setScanned(false);
                navigation.navigate('ManualEntry', { targetDate });
              }
            }
          ]
        );
      } else {
        // BarcodeNetworkError (ou qualquer outro erro inesperado): a consulta
        // nem chegou a acontecer de verdade — não faz sentido sugerir "cadastrar
        // manualmente" como se o produto não existisse.
        showAlert(
          "Erro de Conexão",
          error.message || "Ocorreu um erro ao buscar o produto na internet.",
          [{ text: 'Tentar Novamente', onPress: () => setScanned(false) }]
        );
      }
    }
  };

  if (!permission) {
    return <View style={styles.center}><ActivityIndicator color="#00FF66" /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>Precisamos da sua permissão para usar a câmera.</Text>
        <TouchableOpacity style={styles.submitButton} onPress={requestPermission}>
          <Text style={styles.submitText}>Habilitar Câmera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <BackButton />
        <Text style={styles.headerTitle}>Nova Refeição</Text>
      </View>

      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          facing={'back'}
          onBarcodeScanned={handleBarCodeScanned}
        />
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>Aponte para um código de barras</Text>
        </View>
        {scanned && (
          <TouchableOpacity style={styles.rescanButton} onPress={() => setScanned(false)}>
            <Text style={styles.buttonText}>Escanear Novamente</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.orText}>OU</Text>

      <TouchableOpacity 
        style={[styles.submitButton, analyzing && styles.disabledButton]}
        onPress={takePhoto}
        disabled={analyzing}
      >
        {analyzing ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <ActivityIndicator color="#121212" style={{ marginRight: 10 }} />
            <Text style={styles.submitText}>Mapeando nutrientes...</Text>
          </View>
        ) : (
          <Text style={styles.submitText}>Tirar Foto do Prato (IA)</Text>
        )}
      </TouchableOpacity>

      {imageUri && !analyzing && (
         <TouchableOpacity style={[styles.submitButton, {marginTop: 10, backgroundColor: '#FFF'}]} onPress={handleAnalyze}>
            <Text style={[styles.submitText, {color: '#121212'}]}>Analisar Foto Atual</Text>
         </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
        <Text style={styles.cancelText}>Cancelar e Voltar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212', padding: 20 },
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  cameraContainer: { width: '100%', height: 300, borderRadius: 16, overflow: 'hidden', backgroundColor: '#1E1E1E', justifyContent: 'center', alignItems: 'center' },
  camera: { width: '100%', height: '100%' },
  overlay: { position: 'absolute', bottom: 10, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5 },
  overlayText: { color: '#FFF', fontSize: 14 },
  rescanButton: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0, 255, 102, 0.8)', padding: 10, borderRadius: 8 },
  placeholderText: { color: '#666', textAlign: 'center' },
  permissionText: { color: '#FFF', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  orText: { color: '#666', textAlign: 'center', marginVertical: 20, fontWeight: 'bold' },
  submitButton: { backgroundColor: '#00FF66', padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 15 },
  disabledButton: { opacity: 0.7 },
  submitText: { color: '#121212', fontSize: 16, fontWeight: 'bold' },
  cancelButton: { padding: 15, alignItems: 'center' },
  cancelText: { color: '#888', fontSize: 16 }
});