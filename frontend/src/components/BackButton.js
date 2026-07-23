import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Seta de "voltar" reutilizável. Por padrão usa navigation.goBack(),
 * mas aceita um onPress customizado quando a tela precisar de outro comportamento.
 */
export default function BackButton({ onPress, style }) {
  const navigation = useNavigation();

  return (
    <TouchableOpacity
      onPress={onPress || (() => navigation.goBack())}
      style={[styles.button, style]}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Ionicons name="chevron-back" size={26} color="#00FF66" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { marginRight: 10, padding: 4 },
});
