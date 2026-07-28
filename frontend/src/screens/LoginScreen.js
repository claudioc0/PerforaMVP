import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loginUser } from '../services/api';
import { setToken } from '../services/secureTokenStorage';
import LogoMark from '../components/LogoMark';
import { useAppAlert } from '../components/AppAlertProvider';

export default function LoginScreen({ navigation }) {
  const showAlert = useAppAlert();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      showAlert('Erro', 'Preencha email e senha.');
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
      
      navigation.replace('Dashboard'); // 'replace' impede que o usuário volte pro login com a seta do celular
    } catch (error) {
      showAlert('Erro no Login', error.message);
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
        <Text style={styles.subtitle}>Acesse sua conta para continuar</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>E-mail</Text>
        <TextInput
          style={styles.input}
          placeholder="exemplo@email.com"
          placeholderTextColor="#666"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

        <Text style={styles.label}>Senha</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor="#666"
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
            <ActivityIndicator color="#121212" />
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.linkButton} 
          onPress={() => navigation.navigate('Register')}
        >
          <Text style={styles.linkText}>Não tem uma conta? <Text style={styles.linkTextBold}>Cadastre-se</Text></Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#121212', justifyContent: 'center', padding: 25 },
  header: { marginBottom: 40, alignItems: 'center' },
  logoRow: { flexDirection: 'row', alignItems: 'center' },
  title: { color: '#FFF', fontSize: 32, fontFamily: 'Orbitron_900Black', letterSpacing: 2, marginLeft: 10 },
  subtitle: { color: '#00FF66', fontSize: 16, marginTop: 5 },
  form: { width: '100%' },
  label: { color: '#FFF', fontSize: 14, marginBottom: 8, fontWeight: '500' },
  input: { backgroundColor: '#1E1E1E', color: '#FFF', borderRadius: 10, padding: 15, fontSize: 16, marginBottom: 20, borderWidth: 1, borderColor: '#333' },
  button: { backgroundColor: '#00FF66', borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 10 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#121212', fontSize: 18, fontWeight: 'bold' },
  linkButton: { marginTop: 25, alignItems: 'center' },
  linkText: { color: '#888', fontSize: 14 },
  linkTextBold: { color: '#00FF66', fontWeight: 'bold' }
});