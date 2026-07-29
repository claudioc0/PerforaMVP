import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { getToken } from "../services/secureTokenStorage";
import DrawerContent from './DrawerContent';
import { DrawerMenuProvider } from './DrawerMenuContext';
import { AppAlertProvider } from '../components/AppAlertProvider';
import { UserProvider } from '../contexts/UserContext';

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
import RemindersScreen from '../screens/RemindersScreen';
import { colors } from '../theme/colors';
import { ROUTES } from './routes';

const Stack = createNativeStackNavigator();

function MainStack() {
  const [initialRoute, setInitialRoute] = useState(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await getToken("jwt_token");
        setInitialRoute(token ? ROUTES.DASHBOARD : ROUTES.LOGIN);
      } catch {
        setInitialRoute(ROUTES.LOGIN);
      }
    };
    checkAuth();
  }, []);

  if (initialRoute === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name={ROUTES.LOGIN} component={LoginScreen} />
      <Stack.Screen name={ROUTES.REGISTER} component={RegisterScreen} />
      <Stack.Screen name={ROUTES.DASHBOARD} component={DashboardScreen} />
      <Stack.Screen name={ROUTES.GOALS} component={GoalsScreen} />
      <Stack.Screen name={ROUTES.CAMERA} component={CameraScreen} />
      <Stack.Screen name={ROUTES.MEAL_CONFIRMATION} component={MealConfirmationScreen} />
      <Stack.Screen name={ROUTES.INSIGHTS} component={InsightsScreen} />
      <Stack.Screen name={ROUTES.ADJUST_QUANTITY} component={AdjustQuantityScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name={ROUTES.MANUAL_ENTRY} component={ManualEntryScreen} />
      <Stack.Screen name={ROUTES.WORKOUT_HISTORY} component={WorkoutHistoryScreen} />
      <Stack.Screen name={ROUTES.WORKOUT_SESSION} component={WorkoutSessionScreen} />
      <Stack.Screen name={ROUTES.EXERCISE_PICKER} component={ExercisePickerScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name={ROUTES.PROGRESS} component={ProgressScreen} />
      <Stack.Screen name={ROUTES.CHOOSE_SPLIT} component={ChooseSplitScreen} />
      <Stack.Screen name={ROUTES.WEEKLY_PLAN_SETUP} component={WeeklyPlanSetupScreen} />
      <Stack.Screen name={ROUTES.REMINDERS} component={RemindersScreen} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <AppAlertProvider>
      <UserProvider>
        <DrawerMenuProvider>
          <MainStack />
          <DrawerContent />
        </DrawerMenuProvider>
      </UserProvider>
    </AppAlertProvider>
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
