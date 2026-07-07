import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

// Importando as telas
import LoginScreen from "../screens/LoginScreen"; // <--- ADICIONADO
import DashboardScreen from "../screens/DashboardScreen";
import CameraScreen from "../screens/CameraScreen";

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login" 
        screenOptions={{ headerShown: false }}
      >
        {/* Cadastrando a tela de Login na pilha de navegação */}
        <Stack.Screen name="Login" component={LoginScreen} />
        
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
        <Stack.Screen name="Camera" component={CameraScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}