import "react-native-gesture-handler";
import React from "react";
import { StatusBar, View, ActivityIndicator, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from '@react-navigation/native';
import { useFonts, Orbitron_700Bold, Orbitron_900Black } from '@expo-google-fonts/orbitron';
import { navigationRef } from "./src/navigation/RootNavigation";
import ErrorBoundary from "./src/components/ErrorBoundary";

// Importa o navegador centralizado
import AppNavigator from "./src/navigation/AppNavigator";

export default function App() {
  const [fontsLoaded] = useFonts({ Orbitron_700Bold, Orbitron_900Black });

  if (!fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00FF66" />
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
    backgroundColor: "#121212",
    justifyContent: "center",
    alignItems: "center",
  },
});