// Precisa ser o primeiro import do arquivo — registra os handlers nativos de
// gesto antes de qualquer outro módulo ser avaliado.
import { GestureHandlerRootView } from "react-native-gesture-handler";
import React from "react";
import { StatusBar, View, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from '@react-navigation/native';
import { useFonts, Orbitron_700Bold, Orbitron_900Black } from '@expo-google-fonts/orbitron';
import * as Notifications from "expo-notifications";
import { navigationRef } from "./src/navigation/RootNavigation";
import ErrorBoundary from "./src/components/ErrorBoundary";
import { colors } from "./src/theme/colors";

// Importa o navegador centralizado
import AppNavigator from "./src/navigation/AppNavigator";

// Sem isso, os lembretes locais (refeição/água/treino) não aparecem como
// banner/som se o app já estiver aberto quando disparam — o padrão do Expo é
// não mostrar nada em primeiro plano. Módulo-level (roda uma vez, antes do
// componente montar), não dentro de um useEffect.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  const [fontsLoaded] = useFonts({ Orbitron_700Bold, Orbitron_900Black });

  if (!fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* O NavigationContainer agora envolve o AppNavigator
            e recebe a ref para navegação global. */}
        <NavigationContainer ref={navigationRef}>
          <StatusBar barStyle="light-content" />
          {/* ErrorBoundary por dentro do NavigationContainer: se uma tela
              crashar no render (ex: route.params ausente), o fallback troca
              só o conteúdo da tela atual — o NavigationContainer em si
              continua de pé, então resetToDashboard() ainda funciona. */}
          <ErrorBoundary>
            <AppNavigator />
          </ErrorBoundary>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
});