import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import BackButton from '../components/BackButton';
import { useAppAlert } from '../components/AppAlertProvider';
import { getProgressPhotos, addProgressPhoto, getAuthenticatedImageSource } from '../services/api';
import { formatShortDate } from '../utils/formatDate';
import { useTheme } from '../theme/ThemeContext';
import { registerNamespace } from '../i18n';

import pt from '../i18n/locales/pt/progressPhotos.json';
import en from '../i18n/locales/en/progressPhotos.json';
import es from '../i18n/locales/es/progressPhotos.json';

registerNamespace('progressPhotos', { pt, en, es });

// Timeline de fotos de progresso (mesmo ângulo, ao longo do tempo — uma por
// dia, mesma cadência de peso) com um modo de comparação lado a lado: toca em
// até 2 miniaturas pra ver as duas juntas, com a data de cada uma.
export default function ProgressPhotosScreen() {
  const showAlert = useAppAlert();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useTranslation(['progressPhotos', 'common']);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  const fetchPhotos = useCallback(async () => {
    try {
      const data = await getProgressPhotos();
      // Cada foto é conteúdo privado — o <Image> precisa do header
      // Authorization pra carregar, resolvido uma vez por foto aqui (não a
      // cada re-render).
      const withSources = await Promise.all(
        data.map(async (photo) => ({ ...photo, source: await getAuthenticatedImageSource(photo.image_url) }))
      );
      setPhotos(withSources);
    } catch {
      showAlert(t('alerts.loadErrorTitle'), t('alerts.loadErrorMessage'));
    } finally {
      setLoading(false);
    }
  }, [showAlert, t]);

  useFocusEffect(
    useCallback(() => {
      fetchPhotos();
    }, [fetchPhotos])
  );

  const handleCapture = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      showAlert(t('alerts.permissionRequiredTitle'), t('alerts.permissionRequiredMessage'));
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [3, 4], quality: 0.7 });
    if (result.canceled) return;

    setUploading(true);
    try {
      await addProgressPhoto(result.assets[0].uri);
      showAlert(t('alerts.successTitle'), t('alerts.successMessage'));
      fetchPhotos();
    } catch (error) {
      if (error.status === 409) {
        showAlert(t('alerts.alreadyTakenTitle'), t('alerts.alreadyTakenMessage'));
      } else {
        showAlert(t('alerts.saveErrorTitle'), error.message || t('alerts.saveErrorFallback'));
      }
    } finally {
      setUploading(false);
    }
  };

  // Selecionar uma terceira foto desliza a mais antiga das duas já
  // selecionadas pra fora — sempre no máximo 2, sem precisar de um botão
  // "limpar seleção" separado.
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const selectedPhotos = photos.filter((photo) => selectedIds.includes(photo.id));

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top + 20 }]}>
      <View style={styles.headerRow}>
        <BackButton />
        <Text style={styles.headerTitle}>{t('headerTitle')}</Text>
      </View>

      <TouchableOpacity style={[styles.captureButton, uploading && styles.disabledButton]} onPress={handleCapture} disabled={uploading}>
        {uploading ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <>
            <Ionicons name="camera" size={20} color={colors.onPrimary} style={{ marginRight: 8 }} />
            <Text style={styles.captureButtonText}>{t('captureButton')}</Text>
          </>
        )}
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : photos.length === 0 ? (
        <Text style={styles.emptyText}>{t('emptyText')}</Text>
      ) : (
        <>
          <Text style={styles.sectionLabel}>
            {selectedIds.length === 0 ? t('compareHint') : t('selectedCount', { count: selectedIds.length })}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timelineRow}>
            {photos.map((photo) => {
              const isSelected = selectedIds.includes(photo.id);
              return (
                <TouchableOpacity
                  key={photo.id}
                  style={[styles.thumbWrapper, isSelected && styles.thumbWrapperSelected]}
                  onPress={() => toggleSelect(photo.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t('photoAccessibilityLabel', { date: formatShortDate(photo.taken_at, { includeYear: true }) })}
                >
                  <Image source={photo.source} style={styles.thumbImage} />
                  <Text style={styles.thumbDate}>{formatShortDate(photo.taken_at)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {selectedPhotos.length === 2 && (
            <View style={styles.comparisonCard}>
              <Text style={styles.cardTitle}>{t('comparisonTitle')}</Text>
              <View style={styles.comparisonRow}>
                {selectedPhotos.map((photo) => (
                  <View key={photo.id} style={styles.comparisonItem}>
                    <Image source={photo.source} style={styles.comparisonImage} />
                    <Text style={styles.comparisonDate}>{formatShortDate(photo.taken_at, { includeYear: true })}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 60 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  headerTitle: { flex: 1, color: colors.white, fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  captureButton: { flexDirection: 'row', backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 25 },
  captureButtonText: { color: colors.onPrimary, fontSize: 16, fontWeight: 'bold' },
  disabledButton: { opacity: 0.7 },
  emptyText: { color: colors.textSecondary, textAlign: 'center', marginTop: 30, fontSize: 14 },
  sectionLabel: { color: colors.textSecondary, fontSize: 13, marginBottom: 12 },
  timelineRow: { marginBottom: 20 },
  thumbWrapper: { marginRight: 12, alignItems: 'center', borderWidth: 2, borderColor: 'transparent', borderRadius: 12, padding: 4 },
  thumbWrapperSelected: { borderColor: colors.primary },
  thumbImage: { width: 90, height: 120, borderRadius: 10, backgroundColor: colors.surface },
  thumbDate: { color: colors.textSecondary, fontSize: 11, marginTop: 6 },
  comparisonCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, marginBottom: 20 },
  cardTitle: { color: colors.white, fontSize: 18, fontWeight: '600', marginBottom: 15 },
  comparisonRow: { flexDirection: 'row', justifyContent: 'space-between' },
  comparisonItem: { flex: 1, alignItems: 'center', marginHorizontal: 5 },
  comparisonImage: { width: '100%', height: 220, borderRadius: 12, backgroundColor: colors.background },
  comparisonDate: { color: colors.textSecondary, fontSize: 12, marginTop: 8 },
});
