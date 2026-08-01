// Nome de rota solto como string era espalhado em ~25 pontos de chamada
// (navigation.navigate('Dashbaord'), por exemplo, seria um erro de runtime
// não recuperável: nem o linter nem o bundler acusam typo em uma string).
// Centralizar aqui não elimina esse risco sozinho, mas concentra os nomes
// reais num único lugar — um typo ao digitar `ROUTES.Dashboard` vira
// ReferenceError na hora (variável não existe), em vez de uma navegação
// silenciosamente quebrada em produção.
export const ROUTES = {
  LOGIN: 'Login',
  REGISTER: 'Register',
  DASHBOARD: 'Dashboard',
  GOALS: 'Goals',
  CAMERA: 'Camera',
  MEAL_CONFIRMATION: 'MealConfirmation',
  INSIGHTS: 'Insights',
  ADJUST_QUANTITY: 'AdjustQuantity',
  MANUAL_ENTRY: 'ManualEntry',
  WORKOUT_HISTORY: 'WorkoutHistory',
  WORKOUT_SESSION: 'WorkoutSession',
  EXERCISE_PICKER: 'ExercisePicker',
  PROGRESS: 'Progress',
  CHOOSE_SPLIT: 'ChooseSplit',
  WEEKLY_PLAN_SETUP: 'WeeklyPlanSetup',
  REMINDERS: 'Reminders',
  COMPOSE_FAVORITE: 'ComposeFavorite',
  PROGRESS_PHOTOS: 'ProgressPhotos',
};

export default ROUTES;
