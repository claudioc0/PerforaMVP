import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet, StatusBar } from "react-native";
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from "@react-native-async-storage/async-storage";

// Importando as telas
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import CameraScreen from './src/screens/CameraScreen';
import MealConfirmationScreen from "./src/screens/MealConfirmationScreen"; // Importa a nova tela
import GoalsScreen from "./src/screens/GoalsScreen"; // Importa a tela de Metas

const Stack = createNativeStackNavigator();
export default function App() {
  const [initialRoute, setInitialRoute] = useState(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await AsyncStorage.getItem("jwt_token");
        // Se achou o token, pula direto pro Dashboard. Senão, vai pro Login.
        setInitialRoute(token ? "Dashboard" : "Login");
      } catch (error) {
        setInitialRoute("Login");
      }
    };

    checkAuth();
  }, []);

  // Enquanto estiver procurando o token (initialRoute é null), mostra um loading na tela preta
  if (initialRoute === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00FF66" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" />
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#121212' } }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
        <Stack.Screen name="Goals" component={GoalsScreen} />
        <Stack.Screen name="Camera" component={CameraScreen} />
        {/* Adiciona a tela de confirmação à pilha */}
        <Stack.Screen 
          name="MealConfirmation" 
          component={MealConfirmationScreen} 
        />
      </Stack.Navigator>
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