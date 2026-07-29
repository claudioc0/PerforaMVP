import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resetToDashboard } from '../navigation/RootNavigation';
import { colors } from '../theme/colors';

/**
 * Sem isso, um crash de render em QUALQUER tela (ex: route.params ausente
 * desestruturado sem guarda) derrubava a árvore inteira do React Native —
 * tela em branco, sem erro visível pro usuário, sem jeito de voltar sem
 * fechar e reabrir o app inteiro.
 *
 * Só componentes de classe suportam getDerivedStateFromError/componentDidCatch
 * (não existe hook equivalente ainda), por isso não é um componente de função
 * como o resto do app.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary capturou um crash de render:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false });
    resetToDashboard();
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Ionicons name="warning-outline" size={48} color={colors.danger} style={{ marginBottom: 16 }} />
          <Text style={styles.title}>Algo deu errado</Text>
          <Text style={styles.subtitle}>
            Encontramos um problema inesperado nesta tela. Você pode voltar ao início e tentar de novo.
          </Text>
          <TouchableOpacity style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Voltar ao Início</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 30 },
  title: { color: colors.white, fontSize: 20, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  subtitle: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 25, lineHeight: 20 },
  button: { backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 35, borderRadius: 12 },
  buttonText: { color: colors.background, fontSize: 16, fontWeight: 'bold' },
});
