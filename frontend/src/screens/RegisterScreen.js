import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { registerUser } from '../services/api'; // Importa a função da API
import BackButton from '../components/BackButton';
import LogoMark from '../components/LogoMark';
import { useAppAlert } from '../components/AppAlertProvider';
import { useTheme } from '../theme/ThemeContext';
import { ROUTES } from '../navigation/routes';

// Componente para exibir um requisito da senha
const PasswordRequirement = ({ met, text, styles }) => (
  <Text style={[styles.requirementText, met ? styles.requirementMet : styles.requirementPending]}>
    {met ? '✓' : '○'} {text}
  </Text>
);

export default function RegisterScreen({ navigation }) {
  const showAlert = useAppAlert();
  const { colors } = useTheme();
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
      showAlert("Senha Fraca", "Por favor, certifique-se de que sua senha atende a todos os requisitos.");
      return;
    }
    setLoading(true);
    try {
      await registerUser(name, email, password);
      showAlert(
        "Sucesso!",
        "Sua conta foi criada. Faça o login para continuar.",
        [{ text: "OK", onPress: () => navigation.navigate(ROUTES.LOGIN, { justRegistered: true, prefillEmail: email }) }]
      );
    } catch (error) {
      // A API já retorna os detalhes, podemos usá-los aqui também
      const errorMessage = error.details ? `${error.message}\n- ${error.details.join('\n- ')}` : error.message;
      showAlert("Erro no Cadastro", errorMessage);
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
        <Text style={styles.subtitle}>Crie sua conta para começar</Text>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Nome Completo"
        placeholderTextColor={colors.textSecondary}
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="E-mail"
        placeholderTextColor={colors.textSecondary}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Senha"
        placeholderTextColor={colors.textSecondary}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {/* Requisitos da Senha - Feedback em Tempo Real */}
      <View style={styles.requirementsContainer}>
        <PasswordRequirement met={passwordValidation.hasMinLength} text="Pelo menos 8 caracteres" styles={styles} />
        <PasswordRequirement met={passwordValidation.hasUpperCase} text="Uma letra maiúscula" styles={styles} />
        <PasswordRequirement met={passwordValidation.hasLowerCase} text="Uma letra minúscula" styles={styles} />
        <PasswordRequirement met={passwordValidation.hasNumber} text="Pelo menos um número" styles={styles} />
      </View>

      <TouchableOpacity 
        style={[styles.button, !passwordValidation.allMet && styles.buttonDisabled]} 
        onPress={handleRegister} 
        disabled={loading || !passwordValidation.allMet}
      >
        {loading ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.buttonText}>Cadastrar</Text>}
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
