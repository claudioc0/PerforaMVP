import React, { useState, useRef, useMemo } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { analyzeMeal, analyzeLabel } from '../services/api';
import { fetchProductByBarcode, ProductNotFoundError } from '../services/openFoodFacts';
import BackButton from '../components/BackButton';
import { useAppAlert } from '../components/AppAlertProvider';
import { useTheme } from '../theme/ThemeContext';
import { ROUTES } from '../navigation/routes';
import useCyclingMessages from '../hooks/useCyclingMessages';
import { registerNamespace } from '../i18n';

import pt from '../i18n/locales/pt/camera.json';
import en from '../i18n/locales/en/camera.json';
import es from '../i18n/locales/es/camera.json';

registerNamespace('camera', { pt, en, es });

export default function CameraScreen({ navigation, route }) {
  const showAlert = useAppAlert();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useTranslation(['camera', 'common']);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [imageUri, setImageUri] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzingLabel, setAnalyzingLabel] = useState(false);
  const { targetDate } = route.params || {};
  const [scanned, setScanned] = useState(false);
  const analyzingMessage = useCyclingMessages(t('analyzingMessages', { returnObjects: true }), analyzing);
  const analyzingLabelMessage = useCyclingMessages(t('labelAnalyzingMessages', { returnObjects: true }), analyzingLabel);

  // Placeholder: ainda não há checkout real (Play Billing/Stripe) integrado
  // nesta rodada — ver achado de freemium. Existe só pra o botão não ficar
  // mudo enquanto a assinatura de verdade não é construída.
  const handleUpsellPress = () => {
    showAlert(t('alerts.upsellTitle'), t('alerts.upsellMessage'));
  };
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  // Captura direto na câmera já embutida na tela (a mesma usada pro scanner
  // de código de barras), em vez de abrir o app de câmera do sistema via
  // ImagePicker — este delegava a captura pra um app externo (fora do nosso
  // controle) que em vários fabricantes Android ignora o pedido de câmera
  // traseira e abre em modo selfie. Capturando aqui dentro, a posição da
  // câmera é sempre a que a própria tela já está mostrando (`facing="back"`).
  const takePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5 });
      setImageUri(photo.uri);
    } catch (_error) {
      showAlert(t('alerts.cameraErrorTitle'), t('alerts.cameraErrorMessage'));
    }
  };

  const handleAnalyze = async () => {
    if (!imageUri) {
      showAlert(t('alerts.attentionTitle'), t('alerts.takePhotoPrompt'));
      return;
    }

    setAnalyzing(true);
    try {
      const draftMeal = await analyzeMeal(imageUri, null); 

      navigation.navigate(ROUTES.MEAL_CONFIRMATION, {
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
      if (error.status === 429 && error.data?.reason === 'daily_quota_exceeded') {
        // Diferente do 429 transitório abaixo (rate limit por minuto/hora):
        // esperar não resolve, a cota só reseta amanhã (ou nunca, se assinar).
        showAlert(
          t('alerts.dailyQuotaTitle'),
          t('alerts.dailyQuotaMessage'),
          [
            { text: t('alerts.subscribePremium'), onPress: handleUpsellPress },
            {
              text: t('alerts.manualEntry'),
              onPress: () => navigation.navigate(ROUTES.MANUAL_ENTRY, { targetDate })
            }
          ]
        );
      } else if (error.status === 429) {
        showAlert(
          t('alerts.serversBusyTitle'),
          t('alerts.serversBusyMealMessage'),
          [
            { text: t('alerts.wait'), style: "cancel" },
            {
              text: t('alerts.manualEntry'),
              onPress: () => navigation.navigate(ROUTES.MANUAL_ENTRY, { targetDate })
            }
          ]
        );
      } else {
        showAlert(t('alerts.analysisErrorTitle'), errorMsg || t('alerts.analysisErrorFallback'));
      }
    } finally {
      setAnalyzing(false);
    }
  };

  // Captura e analisa num só toque (diferente da foto de prato, que tem um
  // passo de conferir/tirar de novo antes de analisar) — um rótulo não
  // precisa de enquadramento revisável, e o resultado já cai no ManualEntry
  // pra edição, então uma segunda etapa de confirmação aqui só atrasaria.
  const handlePhotographLabel = async () => {
    if (!cameraRef.current) return;

    let photo;
    try {
      photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
    } catch (_error) {
      showAlert(t('alerts.cameraErrorTitle'), t('alerts.cameraErrorMessage'));
      return;
    }

    setAnalyzingLabel(true);
    try {
      // Mesmo shape/destino que um produto escaneado por código de barras —
      // reaproveita o pre-fill que ManualEntryScreen já faz pra scannedProduct.
      const product = await analyzeLabel(photo.uri);
      navigation.navigate(ROUTES.MANUAL_ENTRY, { scannedProduct: product, targetDate });
    } catch (error) {
      if (error.status === 429 && error.data?.reason === 'daily_quota_exceeded') {
        showAlert(
          t('alerts.dailyQuotaTitle'),
          t('alerts.dailyQuotaMessage'),
          [
            { text: t('alerts.subscribePremium'), onPress: handleUpsellPress },
            { text: t('alerts.manualEntry'), onPress: () => navigation.navigate(ROUTES.MANUAL_ENTRY, { targetDate }) }
          ]
        );
      } else if (error.status === 429) {
        showAlert(
          t('alerts.serversBusyTitle'),
          t('alerts.serversBusyLabelMessage'),
          [
            { text: t('alerts.wait'), style: "cancel" },
            { text: t('alerts.manualEntry'), onPress: () => navigation.navigate(ROUTES.MANUAL_ENTRY, { targetDate }) }
          ]
        );
      } else {
        showAlert(t('alerts.labelReadErrorTitle'), error.message || t('alerts.labelReadErrorFallback'));
      }
    } finally {
      setAnalyzingLabel(false);
    }
  };

  const handleBarCodeScanned = async ({ type, data }) => {
    if (scanned) return;
    setScanned(true);

    try {
      const product = await fetchProductByBarcode(data);
      navigation.navigate(ROUTES.MANUAL_ENTRY, {
        scannedProduct: product,
        targetDate: targetDate,
      });
    } catch (error) {
      if (error instanceof ProductNotFoundError) {
        // Isso aqui é uma resposta de verdade do banco de dados ("status !== 1"),
        // não uma falha de rede — o produto genuinamente não está cadastrado.
        showAlert(
          t('alerts.newProductTitle'),
          t('alerts.newProductMessage'),
          [
            { text: t('common:actions.tryAgain'), onPress: () => setScanned(false), style: 'cancel' },
            {
              text: t('alerts.registerManualButton'),
              onPress: () => {
                setScanned(false);
                navigation.navigate(ROUTES.MANUAL_ENTRY, { targetDate });
              }
            }
          ]
        );
      } else {
        // BarcodeNetworkError (ou qualquer outro erro inesperado): a consulta
        // nem chegou a acontecer de verdade — não faz sentido sugerir "cadastrar
        // manualmente" como se o produto não existisse.
        showAlert(
          t('alerts.connectionErrorTitle'),
          error.message || t('alerts.connectionErrorFallback'),
          [{ text: t('common:actions.tryAgain'), onPress: () => setScanned(false) }]
        );
      }
    }
  };

  if (!permission) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>{t('permissionText')}</Text>
        <TouchableOpacity style={styles.submitButton} onPress={requestPermission}>
          <Text style={styles.submitText}>{t('enableCameraButton')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
      <View style={styles.headerRow}>
        <BackButton />
        <Text style={styles.headerTitle}>{t('headerTitle')}</Text>
      </View>

      {/* CameraView fica SEMPRE montada — inclusive com uma foto em preview
          por cima dela — pra `cameraRef` nunca ficar órfão. Desmontar a
          câmera ao mostrar o preview (como era antes) quebrava "Tirar Outra
          Foto": não havia mais câmera nenhuma pra capturar de novo. */}
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={'back'}
          // Desliga a leitura de código de barras enquanto há uma foto em
          // preview — sem isso, a câmera (ainda ativa por baixo da imagem)
          // podia reconhecer um código de barras real do ambiente e navegar
          // pra outra tela sem o usuário entender o porquê.
          onBarcodeScanned={imageUri ? undefined : handleBarCodeScanned}
        />

        {imageUri ? (
          <>
            <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" />
            <View style={styles.previewBadge}>
              <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
              <Text style={styles.previewBadgeText}>{t('photoCapturedBadge')}</Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.overlay}>
              <Text style={styles.overlayText}>{t('barcodeHint')}</Text>
            </View>
            {scanned && (
              <TouchableOpacity style={styles.rescanButton} onPress={() => setScanned(false)}>
                <Text style={styles.buttonText}>{t('rescanButton')}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {imageUri ? (
        <View style={styles.previewActions}>
          {/* Ação primária: com a foto já visível acima, "analisar" é o próximo
              passo óbvio — vira o botão verde de destaque, não mais o segundo
              botão com cores invertidas que passava despercebido antes. */}
          <TouchableOpacity
            style={[styles.submitButton, analyzing && styles.disabledButton]}
            onPress={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator color={colors.onPrimary} style={{ marginRight: 10 }} />
                <Text style={styles.submitText}>{analyzingMessage}</Text>
              </View>
            ) : (
              <Text style={styles.submitText}>{t('analyzeButton')}</Text>
            )}
          </TouchableOpacity>

          {!analyzing && (
            // Só limpa a foto (volta a câmera ao vivo pro usuário mirar de
            // novo) — NÃO dispara outra captura na hora, que seria às cegas
            // já que a câmera ao vivo fica escondida atrás da prévia.
            <TouchableOpacity style={styles.retakeButton} onPress={() => setImageUri(null)}>
              <Text style={styles.retakeButtonText}>{t('retakeButton')}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          <Text style={styles.orText}>{t('orDivider')}</Text>

          <TouchableOpacity style={styles.submitButton} onPress={takePhoto}>
            <Text style={styles.submitText}>{t('takeMealPhotoButton')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.labelButton, analyzingLabel && styles.disabledButton]}
            onPress={handlePhotographLabel}
            disabled={analyzingLabel}
          >
            {analyzingLabel ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator color={colors.primary} style={{ marginRight: 10 }} />
                <Text style={styles.labelButtonText}>{analyzingLabelMessage}</Text>
              </View>
            ) : (
              <Text style={styles.labelButtonText}>{t('photographLabelButton')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelText}>{t('cancelButton')}</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 20 },
  container: { flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 60 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  headerTitle: { flex: 1, color: colors.white, fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  cameraContainer: { width: '100%', height: 380, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' },
  camera: { width: '100%', height: '100%' },
  overlay: { position: 'absolute', bottom: 10, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5 },
  overlayText: { color: colors.white, fontSize: 14 },
  rescanButton: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0, 255, 102, 0.8)', padding: 10, borderRadius: 8 },
  previewImage: { ...StyleSheet.absoluteFillObject },
  previewBadge: { position: 'absolute', bottom: 10, left: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  previewBadgeText: { color: colors.white, fontSize: 13, fontWeight: '600', marginLeft: 6 },
  previewActions: { marginTop: 24 },
  retakeButton: { padding: 12, alignItems: 'center', marginBottom: 15 },
  retakeButtonText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  placeholderText: { color: colors.textMuted, textAlign: 'center' },
  permissionText: { color: colors.white, fontSize: 16, textAlign: 'center', marginBottom: 20 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  orText: { color: colors.textMuted, textAlign: 'center', marginVertical: 20, fontWeight: 'bold' },
  submitButton: { backgroundColor: colors.primary, padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 15 },
  disabledButton: { opacity: 0.7 },
  submitText: { color: colors.onPrimary, fontSize: 16, fontWeight: 'bold' },
  labelButton: { borderColor: colors.primary, borderWidth: 1, padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 15 },
  labelButtonText: { color: colors.primary, fontSize: 16, fontWeight: 'bold' },
  cancelButton: { padding: 15, alignItems: 'center' },
  cancelText: { color: colors.textSecondary, fontSize: 16 }
});