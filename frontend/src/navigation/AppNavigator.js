import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DrawerContent from './DrawerContent';
import { DrawerMenuProvider } from './DrawerMenuContext';

// Importando as telas
import LoginScreen from "../screens/LoginScreen";
import RegisterScreen from '../screens/RegisterScreen';
import DashboardScreen from "../screens/DashboardScreen";
import GoalsScreen from "../screens/GoalsScreen";
import CameraScreen from "../screens/CameraScreen";
import MealConfirmationScreen from "../screens/MealConfirmationScreen";
import InsightsScreen from '../screens/InsightsScreen'; // Importa a nova tela
import AdjustQuantityScreen from '../screens/AdjustQuantityScreen'; // Importa a nova tela
import ManualEntryScreen from '../screens/ManualEntryScreen';
import WorkoutHistoryScreen from '../screens/WorkoutHistoryScreen';
import WorkoutSessionScreen from '../screens/WorkoutSessionScreen';
import ExercisePickerScreen from '../screens/ExercisePickerScreen';
import ProgressScreen from '../screens/ProgressScreen';
import ChooseSplitScreen from '../screens/ChooseSplitScreen';
import WeeklyPlanSetupScreen from '../screens/WeeklyPlanSetupScreen';

const Stack = createNativeStackNavigator();

function MainStack() {
  const [initialRoute, setInitialRoute] = useState(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await AsyncStorage.getItem("jwt_token");
        setInitialRoute(token ? "Dashboard" : "Login");
      } catch (error) {
        setInitialRoute("Login");
      }
    };
    checkAuth();
  }, []);

  if (initialRoute === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00FF66" />
      </View>
    );
  }

  return (
    <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#121212' } }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="Dashboard" component={DashboardScreen} />
      <Stack.Screen name="Goals" component={GoalsScreen} />
      <Stack.Screen name="Camera" component={CameraScreen} />
      <Stack.Screen name="MealConfirmation" component={MealConfirmationScreen} />
      <Stack.Screen name="Insights" component={InsightsScreen} />
      <Stack.Screen name="AdjustQuantity" component={AdjustQuantityScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="ManualEntry" component={ManualEntryScreen} />
      <Stack.Screen name="WorkoutHistory" component={WorkoutHistoryScreen} />
      <Stack.Screen name="WorkoutSession" component={WorkoutSessionScreen} />
      <Stack.Screen name="ExercisePicker" component={ExercisePickerScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Progress" component={ProgressScreen} />
      <Stack.Screen name="ChooseSplit" component={ChooseSplitScreen} />
      <Stack.Screen name="WeeklyPlanSetup" component={WeeklyPlanSetupScreen} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <DrawerMenuProvider>
      <MainStack />
      <DrawerContent />
    </DrawerMenuProvider>
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
