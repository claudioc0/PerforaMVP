import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { registerUser } from '../services/api'; // Importa a função da API
import BackButton from '../components/BackButton';
import LogoMark from '../components/LogoMark';
import { useAppAlert } from '../components/AppAlertProvider';
import { useTheme } from '../theme/ThemeContext';
import { ROUTES } from '../navigation/routes';
import { registerNamespace } from '../i18n';

import pt from '../i18n/locales/pt/register.json';
import en from '../i18n/locales/en/register.json';
import es from '../i18n/locales/es/register.json';

registerNamespace('register', { pt, en, es });

// Componente para exibir um requisito da senha
const PasswordRequirement = ({ met, text, styles }) => (
  <Text style={[styles.requirementText, met ? styles.requirementMet : styles.requirementPending]}>
    {met ? '✓' : '○'} {text}
  </Text>
);

export default function RegisterScreen({ navigation }) {
  const showAlert = useAppAlert();
  const { colors } = useTheme();
  const { t } = useTranslation(['register', 'common']);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Memoiza os resultados da validação para evitar recálculos desnecessários
  const passwordValidation = useMemo(() => {
    const hasMinLength = password.length >= 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const allMet = hasMinLength && hasUpperCase && hasLowerCase && hasNumber;
    return { hasMinLength, hasUpperCase, hasLowerCase, hasNumber, allMet };
  }, [password]);

  const handleRegister = async () => {
    if (!passwordValidation.allMet) {
      showAlert(t('alerts.weakPasswordTitle'), t('alerts.weakPasswordMessage'));
      return;
    }
    setLoading(true);
    try {
      await registerUser(name, email, password);
      showAlert(
        t('alerts.successTitle'),
        t('alerts.successMessage'),
        [{ text: t('common:actions.ok'), onPress: () => navigation.navigate(ROUTES.LOGIN, { justRegistered: true, prefillEmail: email }) }]
      );
    } catch (error) {
      // A API já retorna os detalhes, podemos usá-los aqui também
      const errorMessage = error.details ? `${error.message}\n- ${error.details.join('\n- ')}` : error.message;
      showAlert(t('alerts.registerErrorTitle'), errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.backRow}>
        <BackButton />
      </View>

      <View style={styles.header}>
        <View style={styles.logoRow}>
          <LogoMark size={36} />
          <Text style={styles.title}>PERFORA</Text>
        </View>
        <Text style={styles.subtitle}>{t('subtitle')}</Text>
      </View>

      <TextInput
        style={styles.input}
        placeholder={t('namePlaceholder')}
        placeholderTextColor={colors.textSecondary}
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder={t('emailPlaceholder')}
        placeholderTextColor={colors.textSecondary}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder={t('passwordPlaceholder')}
        placeholderTextColor={colors.textSecondary}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {/* Requisitos da Senha - Feedback em Tempo Real */}
      <View style={styles.requirementsContainer}>
        <PasswordRequirement met={passwordValidation.hasMinLength} text={t('requirements.minLength')} styles={styles} />
        <PasswordRequirement met={passwordValidation.hasUpperCase} text={t('requirements.upperCase')} styles={styles} />
        <PasswordRequirement met={passwordValidation.hasLowerCase} text={t('requirements.lowerCase')} styles={styles} />
        <PasswordRequirement met={passwordValidation.hasNumber} text={t('requirements.number')} styles={styles} />
      </View>

      <TouchableOpacity
        style={[styles.button, !passwordValidation.allMet && styles.buttonDisabled]}
        onPress={handleRegister}
        disabled={loading || !passwordValidation.allMet}
      >
        {loading ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.buttonText}>{t('registerButton')}</Text>}
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: colors.background,
  },
  backRow: {
    marginBottom: 10,
  },
  header: {
    marginBottom: 30,
    alignItems: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    color: colors.white,
    fontSize: 26,
    fontFamily: 'Orbitron_900Black',
    letterSpacing: 2,
    marginLeft: 10,
  },
  subtitle: {
    color: colors.primary,
    fontSize: 16,
    marginTop: 5,
  },
  input: {
    backgroundColor: colors.surface,
    color: colors.white,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 10,
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.primary,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    backgroundColor: colors.textDark,
  },
  buttonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  requirementsContainer: {
    marginTop: 5,
    marginBottom: 15,
    padding: 15,
    backgroundColor: colors.surface,
    borderRadius: 10,
  },
  requirementText: {
    fontSize: 14,
    marginBottom: 5,
  },
  requirementPending: {
    color: colors.textSecondary,
  },
  requirementMet: {
    color: colors.primary,
  },
});
