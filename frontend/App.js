import React from "react";
import { StatusBar, View, ActivityIndicator, StyleSheet } from "react-native";
import { NavigationContainer } from '@react-navigation/native';
import { useFonts, Orbitron_700Bold, Orbitron_900Black } from '@expo-google-fonts/orbitron';
import { navigationRef } from "./src/navigation/RootNavigation";

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
    // O NavigationContainer agora envolve o AppNavigator
    // e recebe a ref para navegação global.
    <NavigationContainer ref={navigationRef}>
      <StatusBar barStyle="light-content" />
      <AppNavigator />
    </NavigationContainer>
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