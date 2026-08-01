import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { loginUser } from '../services/api';
import { setToken } from '../services/secureTokenStorage';
import LogoMark from '../components/LogoMark';
import { useAppAlert } from '../components/AppAlertProvider';
import { useTheme } from '../theme/ThemeContext';
import { registerNamespace } from '../i18n';
import { ROUTES } from '../navigation/routes';

import pt from '../i18n/locales/pt/login.json';
import en from '../i18n/locales/en/login.json';
import es from '../i18n/locales/es/login.json';

registerNamespace('login', { pt, en, es });

export default function LoginScreen({ navigation, route }) {
  const showAlert = useAppAlert();
  const { colors } = useTheme();
  const { t } = useTranslation(['login', 'common']);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // O Login normalmente já está montado na pilha (ex: acabou de deslogar) —
  // navigate() de volta pra ele só atualiza route.params, sem remontar o
  // componente. Um useState(initialValue) só rodaria uma vez e nunca pegaria
  // esse prefill; useEffect reage à mudança do param mesmo sem remount.
  useEffect(() => {
    if (route.params?.prefillEmail) {
      setEmail(route.params.prefillEmail);
    }
  }, [route.params?.prefillEmail]);

  const handleLogin = async () => {
    if (!email || !password) {
      showAlert(t('alerts.missingFieldsTitle'), t('alerts.missingFieldsMessage'));
      return;
    }

    setLoading(true);
    try {
      // 1. Bate na API do Flask
      const data = await loginUser(email, password);
      
      // 2. Salva os tokens e os dados do usuário em paralelo para otimizar.
      // O refresh_token precisa ficar salvo pra poder ser enviado no logout —
      // sem isso, o backend não tem como revogá-lo, e ele continua válido
      // por até 7 dias mesmo depois do usuário "sair" do app.
      await Promise.all([
        setToken('jwt_token', data.token),
        setToken('refresh_token', data.refresh_token),
        AsyncStorage.setItem('user_data', JSON.stringify(data.user)) // Salva o objeto do usuário
      ]);
      
      // Primeiro login logo após o cadastro: manda pra calculadora de meta em
      // vez do Dashboard direto, pra não deixar o usuário com metas em
      // branco até ele achar a tela de Metas por conta própria.
      if (route.params?.justRegistered) {
        navigation.replace(ROUTES.GOALS, { openCalculator: true });
      } else {
        navigation.replace(ROUTES.DASHBOARD); // 'replace' impede que o usuário volte pro login com a seta do celular
      }
    } catch (error) {
      showAlert(t('alerts.loginErrorTitle'), error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <LogoMark size={44} />
          <Text style={styles.title}>PERFORA</Text>
        </View>
        <Text style={styles.subtitle}>{t('subtitle')}</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>{t('emailLabel')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('emailPlaceholder')}
          placeholderTextColor={colors.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

        <Text style={styles.label}>{t('passwordLabel')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('passwordPlaceholder')}
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.buttonText}>{t('loginButton')}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.navigate(ROUTES.REGISTER)}
        >
          <Text style={styles.linkText}>{t('noAccount')} <Text style={styles.linkTextBold}>{t('signUp')}</Text></Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: colors.background, justifyContent: 'center', padding: 25 },
  header: { marginBottom: 40, alignItems: 'center' },
  logoRow: { flexDirection: 'row', alignItems: 'center' },
  title: { color: colors.white, fontSize: 32, fontFamily: 'Orbitron_900Black', letterSpacing: 2, marginLeft: 10 },
  subtitle: { color: colors.primary, fontSize: 16, marginTop: 5 },
  form: { width: '100%' },
  label: { color: colors.white, fontSize: 14, marginBottom: 8, fontWeight: '500' },
  input: { backgroundColor: colors.surface, color: colors.white, borderRadius: 10, padding: 15, fontSize: 16, marginBottom: 20, borderWidth: 1, borderColor: colors.border },
  button: { backgroundColor: colors.primary, borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 10 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: colors.onPrimary, fontSize: 18, fontWeight: 'bold' },
  linkButton: { marginTop: 25, alignItems: 'center' },
  linkText: { color: colors.textSecondary, fontSize: 14 },
  linkTextBold: { color: colors.primary, fontWeight: 'bold' }
});