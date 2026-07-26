import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { registerUser } from '../services/api'; // Importa a função da API
import BackButton from '../components/BackButton';
import LogoMark from '../components/LogoMark';
import { useAppAlert } from '../components/AppAlertProvider';

// Componente para exibir um requisito da senha
const PasswordRequirement = ({ met, text }) => (
  <Text style={[styles.requirementText, met ? styles.requirementMet : styles.requirementPending]}>
    {met ? '✓' : '○'} {text}
  </Text>
);

export default function RegisterScreen({ navigation }) {
  const showAlert = useAppAlert();
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
        [{ text: "OK", onPress: () => navigation.navigate('Login') }]
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
    <View style={styles.container}>
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
        placeholderTextColor="#888"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="E-mail"
        placeholderTextColor="#888"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Senha"
        placeholderTextColor="#888"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {/* Requisitos da Senha - Feedback em Tempo Real */}
      <View style={styles.requirementsContainer}>
        <PasswordRequirement met={passwordValidation.hasMinLength} text="Pelo menos 8 caracteres" />
        <PasswordRequirement met={passwordValidation.hasUpperCase} text="Uma letra maiúscula" />
        <PasswordRequirement met={passwordValidation.hasLowerCase} text="Uma letra minúscula" />
        <PasswordRequirement met={passwordValidation.hasNumber} text="Pelo menos um número" />
      </View>

      <TouchableOpacity 
        style={[styles.button, !passwordValidation.allMet && styles.buttonDisabled]} 
        onPress={handleRegister} 
        disabled={loading || !passwordValidation.allMet}
      >
        {loading ? <ActivityIndicator color="#121212" /> : <Text style={styles.buttonText}>Cadastrar</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#121212',
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
    color: '#FFF',
    fontSize: 26,
    fontFamily: 'Orbitron_900Black',
    letterSpacing: 2,
    marginLeft: 10,
  },
  subtitle: {
    color: '#00FF66',
    fontSize: 16,
    marginTop: 5,
  },
  input: {
    backgroundColor: '#1E1E1E',
    color: '#FFF',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 10,
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#333',
  },
  button: {
    backgroundColor: '#00FF66',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    backgroundColor: '#555',
  },
  buttonText: {
    color: '#121212',
    fontSize: 16,
    fontWeight: 'bold',
  },
  requirementsContainer: {
    marginTop: 5,
    marginBottom: 15,
    padding: 15,
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
  },
  requirementText: {
    fontSize: 14,
    marginBottom: 5,
  },
  requirementPending: {
    color: '#888',
  },
  requirementMet: {
    color: '#00FF66',
  },
});
