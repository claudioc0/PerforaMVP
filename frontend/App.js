import React from "react";
import { StatusBar } from "react-native";
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from "./src/navigation/RootNavigation";

// Importa o navegador centralizado
import AppNavigator from "./src/navigation/AppNavigator";

export default function App() {
  return (
    // O NavigationContainer agora envolve o AppNavigator
    // e recebe a ref para navegação global.
    <NavigationContainer ref={navigationRef}>
      <StatusBar barStyle="light-content" />
      <AppNavigator />
    </NavigationContainer>
  );
}