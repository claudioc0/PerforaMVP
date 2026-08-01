import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useDrawerMenu } from '../navigation/DrawerMenuContext';
import { useAppAlert } from '../components/AppAlertProvider';
import { useUserGoals } from '../contexts/UserContext';
import { getTodaySummary, deleteMeal, addWater, getDailyInsight, addFavorite, saveMeal, getStreak, getWeeklyPlan } from '../services/api';
import { getStreakTier } from '../utils/streak';
import { getAdjustedGoals } from '../utils/adjustedGoals';
import { isHealthConnectAvailable, hasHealthPermissions, requestHealthPermissions, getActivityForDate } from '../services/healthConnect';
import { DAILY_INSIGHT_CACHE_KEY } from '../services/session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import LogoMark from '../components/LogoMark';
import MacroSummaryLine from '../components/MacroSummaryLine';
import CircularProgress from '../components/CircularProgress';
import { useTheme } from '../theme/ThemeContext';
import { useLanguage } from '../i18n/LanguageContext';
import { registerNamespace } from '../i18n';
import { ROUTES } from '../navigation/routes';

import pt from '../i18n/locales/pt/dashboard.json';
import en from '../i18n/locales/en/dashboard.json';
import es from '../i18n/locales/es/dashboard.json';

registerNamespace('dashboard', { pt, en, es });

// --- Funções utilitárias para manipulação de datas ---
// A data enviada pra API é sempre montada a partir dos componentes LOCAIS do aparelho.
// Usar toISOString() aqui converteria pra UTC: no horário de Brasília (UTC-3), tudo que
// fosse registrado a partir das 21h iria parar no dia seguinte — o jantar sumia do "Hoje"
// e era contabilizado no orçamento calórico de amanhã.
const getFormattedDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`; // YYYY-MM-DD no fuso do usuário
};

// Zera o horário pra permitir comparar duas datas apenas pelo dia
const startOfDay = (date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

// Retorna um código independente de idioma ('today'/'yesterday'/null) — a
// tela resolve o texto exibido via t() separadamente (ver `displayDateLabel`
// no componente), pra não acoplar a lógica interna (comparações de dia) ao
// idioma selecionado pelo usuário.
const getDisplayDateCode = (date) => {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'today';
  if (date.toDateString() === yesterday.toDateString()) return 'yesterday';

  return null;
};

// Date.getDay() do JS: 0=Domingo...6=Sábado. O plano semanal usa 0=Segunda...6=Domingo
// (mesma conversão já usada em WorkoutHistoryScreen.js, pra não inventar uma segunda regra).
const getPlanDayIndex = (date) => (date.getDay() + 6) % 7;

// --- Card grande de calorias (hero), com anel de progresso circular ---
// `styles`/`colors` vêm do componente pai (useTheme() já resolvido lá) —
// evita cada helper component recalcular seu próprio createStyles(colors).
const CalorieHeroCard = ({ consumed = 0, goal = 0, styles, colors, t }) => {
  const safeGoal = goal > 0 ? goal : 1;
  const percentage = (consumed / safeGoal) * 100;
  const remaining = goal - consumed;
  const hasExceeded = remaining < 0;

  return (
    <View style={styles.calorieHeroCard}>
      <View style={styles.calorieHeroInfo}>
        <Text style={styles.calorieHeroLabel}>{t('calorieHero.label')}</Text>
        <Text style={styles.calorieHeroValue}>
          {consumed.toFixed(0)}<Text style={styles.calorieHeroUnit}> / {goal.toFixed(0)} kcal</Text>
        </Text>
        <Text style={styles.calorieHeroMeta}>
          {hasExceeded
            ? t('calorieHero.exceeded', { amount: Math.abs(remaining).toFixed(0) })
            : t('calorieHero.remaining', { amount: remaining.toFixed(0) })}
        </Text>
      </View>
      <CircularProgress
        percentage={percentage}
        size={80}
        strokeWidth={8}
        color={colors.primary}
        trackColor={colors.border}
      >
        <Text style={styles.calorieHeroRingText}>{percentage.toFixed(0)}%</Text>
      </CircularProgress>
    </View>
  );
};

// --- Card de macro individual (proteína/carbo/gordura) — fundo neutro
// (mesmo cinza escuro dos outros cards), ícone/percentual/barra no verde de
// marca, pra manter os 3 cards como uma família coesa em vez de uma cor
// diferente por card. ---
const MacroCard = ({ icon, label, consumed = 0, goal = 0, unit = 'g', accentColor, styles, t }) => {
  const safeGoal = goal > 0 ? goal : 1;
  const percentage = (consumed / safeGoal) * 100;
  const visualPercentage = Math.min(percentage, 100);
  const remaining = goal - consumed;
  const hasExceeded = remaining < 0;

  return (
    <View style={styles.macroCard}>
      <View style={styles.macroCardHeader}>
        <MaterialCommunityIcons name={icon} size={16} color={accentColor} />
        <Text style={[styles.macroCardPercentage, { color: accentColor }]}>{percentage.toFixed(0)}%</Text>
      </View>
      <Text style={styles.macroCardValue}>{consumed.toFixed(0)}{unit}</Text>
      <Text style={styles.macroCardLabel}>{label}</Text>
      <View style={styles.macroCardTrack}>
        <View style={[styles.macroCardFill, { width: `${visualPercentage}%`, backgroundColor: accentColor }]} />
      </View>
      <Text style={styles.macroCardMeta} numberOfLines={1}>
        {hasExceeded
          ? t('macros.exceeded', { amount: Math.abs(remaining).toFixed(0), unit })
          : t('macros.remaining', { amount: remaining.toFixed(0), unit })}
      </Text>
    </View>
  );
};

// --- Badge de Sequência (Streak) ---
const StreakBadge = ({ currentStreak, styles, colors, t }) => {
  if (!currentStreak) return null;
  const tier = getStreakTier(currentStreak);
  return (
    <View style={[styles.streakBadge, styles[`streakBadge_${tier}`]]}>
      <Ionicons name="flame" size={18} color={colors.primary} />
      <Text style={styles.streakText}>
        {t('streak.days', { count: currentStreak })}
      </Text>
    </View>
  );
};

export default function DashboardScreen({ navigation }) {
  const { open: openDrawerMenu } = useDrawerMenu();
  const showAlert = useAppAlert();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const { t } = useTranslation(['dashboard', 'common']);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { goals, refreshGoals } = useUserGoals();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [userName, setUserName] = useState('');
  const [waterIntake, setWaterIntake] = useState(0);
  const [aiInsight, setAiInsight] = useState(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [yesterdayMeals, setYesterdayMeals] = useState([]);
  const [streak, setStreak] = useState(null);
  const [weeklyPlan, setWeeklyPlan] = useState(null);

  // Health Connect é só informativo (não ajusta goal_calories — a meta já
  // assume um activity_level estático do onboarding, somar atividade medida
  // por cima contaria a atividade de base duas vezes).
  const [healthAvailable, setHealthAvailable] = useState(false);
  const [healthConnected, setHealthConnected] = useState(false);
  const [connectingHealth, setConnectingHealth] = useState(false);
  const [activityForDay, setActivityForDay] = useState(null);

  const formattedCurrentDate = useMemo(() => getFormattedDate(currentDate), [currentDate]);
  // Compara só o dia: currentDate carrega o horário em que foi criada, então comparar
  // os timestamps direto marcava o próprio dia de hoje como "futuro" o dia inteiro.
  const isFutureDate = useMemo(
    () => startOfDay(currentDate) > startOfDay(new Date()),
    [currentDate]
  );
  // getDisplayDateCode aloca Date novos (hoje/ontem) e chama toDateString() a
  // cada chamada — antes era invocada 3x por render (2x no JSX + 1x dentro do
  // efeito do insight), inclusive em re-renders que nada tinham a ver com a
  // data (digitar água, carregar insight). Memoizado aqui, só recalcula
  // quando currentDate muda de fato.
  const displayDateCode = useMemo(() => getDisplayDateCode(currentDate), [currentDate]);
  // Texto exibido, já traduzido — separado do código acima pra lógica interna
  // (comparações de dia) não depender do idioma selecionado pelo usuário.
  const displayDate = useMemo(() => {
    if (displayDateCode === 'today') return t('today');
    if (displayDateCode === 'yesterday') return t('yesterday');
    return currentDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }, [displayDateCode, currentDate, t]);

  // Só ajusta a meta em "Hoje" — pra dias passados, o plano semanal de HOJE não
  // necessariamente reflete o que valia naquele dia (o usuário pode ter trocado de
  // divisão desde então), então mostrar a meta base ali evita uma suposição confusa.
  const isTrainingDay = useMemo(() => {
    if (displayDateCode !== 'today' || !weeklyPlan?.has_plan) return null;
    const todayIndex = getPlanDayIndex(new Date());
    return Boolean(weeklyPlan.days?.[todayIndex]?.split_day_id);
  }, [displayDateCode, weeklyPlan]);

  const adjustedGoals = useMemo(() => getAdjustedGoals(goals, isTrainingDay), [goals, isTrainingDay]);

  const fetchData = useCallback(async () => {
    setLoading(true); 
    setError(null); 
    try {
      const [summaryData] = await Promise.all([
        getTodaySummary(formattedCurrentDate),
        refreshGoals(),
      ]);
      setSummary(summaryData);
      setWaterIntake(summaryData?.total_water_ml || 0);
    } catch (err) {
      if (err.status !== 401) {
        setError(t('errors.loadFailed'));
      }
    } finally {
      setLoading(false);
    }
  }, [formattedCurrentDate, refreshGoals, t]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // Sempre sobre o ONTEM real do aparelho — não sobre `currentDate - 1`, senão
  // navegar pelas setas de data faria o atalho "repetir de ontem" mudar de
  // significado (ex: em "Ontem", isso buscaria "anteontem", confuso).
  const fetchYesterdayMeals = useCallback(async () => {
    const realYesterday = new Date();
    realYesterday.setDate(realYesterday.getDate() - 1);
    try {
      const data = await getTodaySummary(getFormattedDate(realYesterday));
      setYesterdayMeals(data?.meals || []);
    } catch {
      // Atalho best-effort — sem isso, o usuário ainda registra manualmente.
      setYesterdayMeals([]);
    }
  }, []);

  // Sempre sobre o "hoje" real do aparelho, não sobre `currentDate` — a
  // streak não deveria mudar enquanto o usuário navega pelas setas de data.
  const fetchStreak = useCallback(async () => {
    try {
      const data = await getStreak(getFormattedDate(new Date()));
      setStreak(data);
    } catch {
      // Badge de streak não é funcionalidade core — falha aqui não bloqueia o resto do Dashboard.
      setStreak(null);
    }
  }, []);

  const fetchWeeklyPlan = useCallback(async () => {
    try {
      const data = await getWeeklyPlan();
      setWeeklyPlan(data);
    } catch {
      // Sem plano semanal carregado, isTrainingDay cai pra null (nenhum ajuste de meta).
      setWeeklyPlan(null);
    }
  }, []);

  // Health Connect só existe no Android nesta rodada (Apple Health fica pra
  // quando houver acesso a Mac/Xcode). Reflete o estado real de permissão do
  // SO a cada vez que a tela ganha foco, em vez de uma flag local que pode
  // dessincronizar se o usuário revogar o acesso nas configurações. Depende
  // de `currentDate` — o Health Connect guarda histórico, então navegar pras
  // setas de data busca a atividade daquele dia específico, não sempre "hoje".
  const fetchHealthActivity = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    const available = await isHealthConnectAvailable();
    setHealthAvailable(available);
    if (!available) return;

    const granted = await hasHealthPermissions();
    setHealthConnected(granted);
    if (granted) {
      const activity = await getActivityForDate(currentDate);
      setActivityForDay(activity);
    }
  }, [currentDate]);

  const handleConnectHealth = async () => {
    setConnectingHealth(true);
    try {
      const granted = await requestHealthPermissions();
      setHealthConnected(granted);
      if (granted) {
        const activity = await getActivityForDate(currentDate);
        setActivityForDay(activity);
      }
    } finally {
      setConnectingHealth(false);
    }
  };

  // --- LÓGICA DE CACHE DA IA OTIMIZADA ---
  useEffect(() => {
    const fetchInsight = async () => {
      const CACHE_KEY = DAILY_INSIGHT_CACHE_KEY;
      const isToday = displayDateCode === 'today';

      if (summary && goals && isToday) {
        setLoadingInsight(true);
        setAiInsight(null); 

        const consumed = {
          calories: summary.total_calories,
          protein_g: summary.total_protein_g,
          carbs_g: summary.total_carbs_g,
          fat_g: summary.total_fat_g,
        };

        // Idioma entra no hash — senão trocar o idioma do app mostraria o
        // insight antigo em cache (mesmos nutrientes, texto no idioma errado)
        // até os macros do dia mudarem de novo.
        const nutrientsHash = `${consumed.calories}-${consumed.protein_g}-${consumed.carbs_g}-${consumed.fat_g}-${language}`;

        try {
          const cachedInsightJSON = await AsyncStorage.getItem(CACHE_KEY);
          if (cachedInsightJSON) {
            const cachedInsight = JSON.parse(cachedInsightJSON);
            if (cachedInsight.date === formattedCurrentDate && cachedInsight.nutrients_hash === nutrientsHash) {
              setAiInsight(cachedInsight.insight_text);
              setLoadingInsight(false);
              return;
            }
          }

          const insightData = await getDailyInsight(goals, consumed, language);
          setAiInsight(insightData.insight);

          const newCacheObject = {
            date: formattedCurrentDate,
            nutrients_hash: nutrientsHash,
            insight_text: insightData.insight,
          };
          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(newCacheObject));

        } catch {
          setAiInsight(t('insight.fallback'));
        } finally {
          setLoadingInsight(false);
        }
      }
    };
    fetchInsight();
  }, [summary, goals, displayDateCode, formattedCurrentDate, language, t]);

  const changeDay = (amount) => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + amount);

    // Bloqueia navegar pra frente, comparando apenas o dia (não o horário)
    if (startOfDay(newDate) > startOfDay(new Date())) return;

    setCurrentDate(newDate);
  };

  // useFocusEffect (abaixo) já cobre "buscar ao abrir a tela" — ele roda tanto
  // na montagem inicial quanto toda vez que a tela reganha foco (voltar da
  // Câmera, do registro manual, etc.), e também de novo quando fetchData muda
  // de identidade (troca de dia). Um useEffect(fetchData, [fetchData]) extra
  // aqui rodava JUNTO com o useFocusEffect na abertura — a MESMA busca (que já
  // é um Promise.all de duas chamadas) disparando duas vezes, 4 requests em
  // vez de 2 toda vez que o Dashboard abria.
  useFocusEffect(
    useCallback(() => {
      const loadScreenData = async () => {
        fetchData();
        fetchYesterdayMeals();
        fetchStreak();
        fetchWeeklyPlan();
        fetchHealthActivity();
        try {
          const userDataString = await AsyncStorage.getItem('user_data');
          if (userDataString) {
            const userData = JSON.parse(userDataString);
            setUserName(userData.name || '');
          }
        } catch {
          // Nome do usuário é só um "nice to have" no cabeçalho — sem cache local
          // legível, a tela continua funcional com a saudação genérica.
        }
      };
      loadScreenData();
    }, [fetchData, fetchYesterdayMeals, fetchStreak, fetchWeeklyPlan, fetchHealthActivity])
  );

  const handleDeleteMeal = async (mealId) => {
    showAlert(
      t('alerts.deleteMeal.title'),
      t('alerts.deleteMeal.message'),
      [
        { text: t('alerts.no'), style: "cancel" },
        {
          text: t('alerts.yes'),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMeal(mealId);
              fetchData();
            } catch (error) {
              showAlert(t('alerts.deleteMealError.title'), error.message || t('errors.deleteMealFailed'));
            }
          }
        }
      ]
    );
  };

  const handleAddWater = async (amount) => {
    const previousIntake = waterIntake;
    setWaterIntake(prev => prev + amount);
    try {
      const response = await addWater(amount, formattedCurrentDate);
      setWaterIntake(response.total);
    } catch {
      setWaterIntake(previousIntake);
      showAlert(t('alerts.errorTitle'), t('errors.waterFailed'));
    }
  };

  const handleFavorite = async (meal) => {
    showAlert(
      t('alerts.favorite.title'),
      t('alerts.favorite.message', { description: meal.description }),
      [
        { text: t('alerts.no'), style: "cancel" },
        {
          text: t('alerts.yes'),
          onPress: async () => {
            try {
              const favoriteData = {
                description: meal.description, calories: meal.calories, protein_g: meal.protein_g, carbs_g: meal.carbs_g, fat_g: meal.fat_g,
                // Preserva o detalhamento por item quando a refeição logada
                // veio de foto/IA — sem isso, favoritar um prato de vários
                // itens colapsava tudo pro total achatado, perdendo a
                // composição (mesma capacidade agora usada por "pratos compostos").
                items: meal.items && meal.items.length > 0 ? meal.items : undefined,
              };
              await addFavorite(favoriteData);
              showAlert(t('alerts.favorite.successTitle'), t('alerts.favorite.successMessage'));
            } catch (error) {
              showAlert(t('alerts.errorTitle'), error.message || t('errors.favoriteFailed'));
            }
          },
        },
      ]
    );
  };

  const handleRepeatMeal = (meal) => {
    showAlert(
      t('alerts.repeatMeal.title'),
      t('alerts.repeatMeal.message', { description: meal.description }),
      [
        { text: t('alerts.no'), style: "cancel" },
        {
          text: t('alerts.yes'),
          onPress: async () => {
            try {
              // Payload no shape completo de Meal (não o de FavoriteMeal, mais
              // pobre) — preserva items/quantity_g quando a refeição de ontem
              // veio de foto/IA, em vez de só clonar a descrição e os totais.
              const payload = {
                description: meal.description,
                calories: meal.calories,
                protein_g: meal.protein_g,
                carbs_g: meal.carbs_g,
                fat_g: meal.fat_g,
                quantity_g: meal.quantity_g,
                items: meal.items,
                source_type: 'repeat_yesterday',
                date: formattedCurrentDate,
              };
              await saveMeal(payload);
              fetchData();
            } catch (error) {
              showAlert(t('alerts.errorTitle'), error.message || t('errors.repeatMealFailed'));
            }
          },
        },
      ]
    );
  };

  const renderMealItem = ({ item }) => (
    <View style={styles.mealItemContainer}>
      <TouchableOpacity style={{ flex: 1 }} onPress={() => navigation.navigate(ROUTES.ADJUST_QUANTITY, { meal: item })}>
        <View style={styles.mealItem}>
          <View style={styles.mealHeader}>
            <Text style={styles.mealDesc}>{item.description}</Text>
            {item.confidence > 0 && (
              <View style={styles.confidenceBadge}>
                <Text style={styles.confidenceText}>{t('mealItem.confidenceBadge', { percent: (item.confidence * 100).toFixed(0) })}</Text>
              </View>
            )}
          </View>
          <MacroSummaryLine
            calories={item.calories}
            proteinG={item.protein_g}
            carbsG={item.carbs_g}
            fatG={item.fat_g}
            style={styles.mealMacros}
          />
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => handleFavorite(item)}
        style={styles.actionButton}
        accessibilityRole="button"
        accessibilityLabel={t('mealItem.favoriteAccessibilityLabel')}
      >
        <Ionicons name="star" size={20} color={colors.primary} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleDeleteMeal(item.id)} style={styles.deleteButton}>
        <Text style={styles.deleteButtonText}>{t('common:actions.delete')}</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error && !loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchData}>
          <Text style={styles.retryButtonText}>{t('common:actions.tryAgain')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.rootContainer}>
      {/* Um único FlatList raiz (não um ScrollView com outro FlatList
          scrollEnabled=false dentro) — aninhar assim anula a virtualização:
          TODA linha da lista interna monta de uma vez, independente do que
          está visível na tela. Com um histórico grande de refeições, a
          abertura da tela travava por um instante. Tudo que antes ficava
          "acima" da lista de refeições agora é o ListHeaderComponent. */}
      <FlatList
        style={[styles.container, { paddingTop: insets.top + 20 }]}
        data={summary?.meals || []}
        keyExtractor={(item) => item.id.toString()}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        renderItem={renderMealItem}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <View style={styles.headerRow}>
                <View style={styles.brandRow}>
                  <LogoMark size={22} />
                  <Text style={styles.greeting}>{t('greeting', { name: userName })}</Text>
                </View>
                <TouchableOpacity
                  style={styles.menuButton}
                  onPress={openDrawerMenu}
                  accessibilityRole="button"
                  accessibilityLabel={t('openMenu')}
                >
                  <Ionicons name="menu" size={28} color={colors.white} />
                </TouchableOpacity>
              </View>
              <View style={styles.dateSelector}>
                <TouchableOpacity
                  onPress={() => changeDay(-1)}
                  style={styles.arrowButton}
                  accessibilityRole="button"
                  accessibilityLabel={t('previousDay')}
                >
                  <Ionicons name="chevron-back" size={24} color={colors.white} />
                </TouchableOpacity>
                <Text style={styles.title}>{displayDate}</Text>
                <TouchableOpacity
                  onPress={() => changeDay(1)}
                  style={[styles.arrowButton, isFutureDate && styles.disabledArrow] }
                  disabled={isFutureDate}
                  accessibilityRole="button"
                  accessibilityLabel={t('nextDay')}
                >
                  <Ionicons name="chevron-forward" size={24} color={colors.white} />
                </TouchableOpacity>
              </View>
              <Text style={styles.subtitle}>{t('subtitle')}</Text>
            </View>

            <StreakBadge currentStreak={streak?.current_streak} styles={styles} colors={colors} t={t} />

            {/* Card de Insight da IA */}
            {(loadingInsight || aiInsight) && (
              <View style={styles.insightCard}>
                <View style={styles.insightHeader}>
                  <Ionicons name="flash" size={20} color={colors.primary} style={styles.insightIcon} />
                  <Text style={styles.insightTitle}>{t('insight.title')}</Text>
                </View>
                {loadingInsight ? (
                  <View style={styles.insightLoadingContainer}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.insightLoadingText}>{t('insight.loading')}</Text>
                  </View>
                ) : (
                  <Text style={styles.insightText}>{aiInsight}</Text>
                )}
              </View>
            )}

            {/* Seção de Progresso — um card grande de calorias (hero) seguido
                de uma grade de cards coloridos por macro, cada um com sua
                própria cor de destaque em vez do cinza uniforme antigo. */}
            <View style={styles.progressSection}>
              {isTrainingDay !== null && (
                <Text style={styles.adjustedGoalLabel}>
                  {isTrainingDay ? t('adjustedGoal.training') : t('adjustedGoal.rest')}
                </Text>
              )}
              <CalorieHeroCard consumed={summary?.total_calories} goal={adjustedGoals?.goal_calories} styles={styles} colors={colors} t={t} />
              <View style={styles.macroCardsRow}>
                <MacroCard
                  icon="food-drumstick"
                  label={t('macros.protein')}
                  consumed={summary?.total_protein_g}
                  goal={adjustedGoals?.goal_protein_g}
                  accentColor={colors.primary}
                  styles={styles}
                  t={t}
                />
                <MacroCard
                  icon="barley"
                  label={t('macros.carbs')}
                  consumed={summary?.total_carbs_g}
                  goal={adjustedGoals?.goal_carbs_g}
                  accentColor={colors.primary}
                  styles={styles}
                  t={t}
                />
                <MacroCard
                  icon="water"
                  label={t('macros.fat')}
                  consumed={summary?.total_fat_g}
                  goal={adjustedGoals?.goal_fat_g}
                  accentColor={colors.primary}
                  styles={styles}
                  t={t}
                />
              </View>
            </View>

            {/* Atividade (Health Connect) — só informativo, não altera
                nenhuma meta acima. O Health Connect guarda histórico, então
                isso acompanha a navegação por dias passados normalmente,
                buscando a atividade daquele dia específico. */}
            {healthAvailable && (
              <View style={styles.progressSection}>
                <Text style={styles.cardTitle}>{t('activitySection.title', { date: displayDate })}</Text>
                {!healthConnected ? (
                  <TouchableOpacity
                    style={[styles.connectHealthButton, connectingHealth && styles.disabledButton]}
                    onPress={handleConnectHealth}
                    disabled={connectingHealth}
                  >
                    {connectingHealth ? (
                      <ActivityIndicator color={colors.onPrimary} />
                    ) : (
                      <Text style={styles.connectHealthButtonText}>{t('activitySection.connect')}</Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <View style={styles.activityRow}>
                    <View style={styles.activityCard}>
                      <Ionicons name="footsteps" size={18} color={colors.primary} />
                      <Text style={styles.activityValue}>{activityForDay?.steps ?? '—'}</Text>
                      <Text style={styles.activityLabel}>{t('activitySection.steps')}</Text>
                    </View>
                    <View style={styles.activityCard}>
                      <Ionicons name="flame" size={18} color={colors.primary} />
                      <Text style={styles.activityValue}>
                        {activityForDay?.activeCalories != null ? Math.round(activityForDay.activeCalories) : '—'}
                      </Text>
                      <Text style={styles.activityLabel}>{t('activitySection.activeCalories')}</Text>
                    </View>
                    <View style={styles.activityCard}>
                      <Ionicons name="heart" size={18} color={colors.primary} />
                      <Text style={styles.activityValue}>
                        {activityForDay?.avgHeartRateBpm != null ? Math.round(activityForDay.avgHeartRateBpm) : '—'}
                      </Text>
                      <Text style={styles.activityLabel}>{t('activitySection.avgHeartRate')}</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Seção de Hidratação */}
            <View style={styles.progressSection}>
              <View style={styles.waterCard}>
                <View style={styles.waterCardHeader}>
                  <Ionicons name="water" size={18} color={colors.primary} />
                  <Text style={styles.waterCardLabel}>{t('hydration.label')}</Text>
                </View>
                <Text style={styles.waterCardValue}>
                  {waterIntake}<Text style={styles.waterCardUnit}> / 2500 ml</Text>
                </Text>
                <View style={styles.waterCardTrack}>
                  <View style={[styles.waterCardFill, { width: `${Math.min((waterIntake / 2500) * 100, 100)}%` }]} />
                </View>
              </View>
              <View style={styles.waterButtonsContainer}>
                <TouchableOpacity style={styles.waterButton} onPress={() => handleAddWater(250)}>
                  <Text style={styles.waterButtonText}>+250 ml</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.waterButton} onPress={() => handleAddWater(500)}>
                  <Text style={styles.waterButtonText}>+500 ml</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Repetir refeição de ontem — só faz sentido olhando pro "Hoje" de
                verdade, não pra qualquer dia passado que o usuário esteja navegando. */}
            {displayDateCode === 'today' && yesterdayMeals.length > 0 && (
              <View style={styles.repeatSection}>
                <Text style={styles.repeatSectionTitle}>{t('repeatSection.title')}</Text>
                <View style={styles.repeatChipsRow}>
                  {yesterdayMeals.map((meal) => (
                    <TouchableOpacity
                      key={meal.id}
                      style={styles.repeatChip}
                      onPress={() => handleRepeatMeal(meal)}
                      accessibilityRole="button"
                      accessibilityLabel={t('repeatSection.repeatAccessibilityLabel', { description: meal.description })}
                    >
                      <Ionicons name="refresh" size={14} color={colors.primary} style={{ marginRight: 6 }} />
                      <Text style={styles.repeatChipText} numberOfLines={1}>{meal.description}</Text>
                      <Text style={styles.repeatChipCalories}>{meal.calories.toFixed(0)} kcal</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <Text style={styles.listTitle}>{t('mealsListTitle', { date: displayDate })}</Text>
          </>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>{t('emptyMeals')}</Text>}
        contentContainerStyle={{ paddingBottom: 210 }}
      />

      {/* FABs */}
      <View style={styles.fabContainer}>
        <TouchableOpacity
          style={styles.fabSecondary}
          onPress={() => navigation.navigate(ROUTES.MANUAL_ENTRY, { targetDate: formattedCurrentDate })}
          accessibilityRole="button"
          accessibilityLabel={t('fab.manualEntry')}
        >
          <Ionicons name="create" size={22} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate(ROUTES.CAMERA, { targetDate: formattedCurrentDate })}
          accessibilityRole="button"
          accessibilityLabel={t('fab.camera')}
        >
          <Ionicons name="camera" size={28} color={colors.onPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  rootContainer: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 20 },
  container: { flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 60 },
  header: { marginBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  menuButton: { padding: 4 },
  greeting: { color: colors.white, fontSize: 24, fontWeight: 'bold', marginLeft: 8 },
  dateSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 10 },
  arrowButton: { padding: 10 },
  arrowText: { color: colors.white, fontSize: 24, fontWeight: 'bold' },
  disabledArrow: { opacity: 0.3 },
  title: { color: colors.white, fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  subtitle: { color: colors.textSecondary, fontSize: 16, marginTop: 4 },
  streakBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.surfaceAlt, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16, marginBottom: 20 },
  streakBadge_base: {},
  streakBadge_week: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  streakBadge_month: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.primary, shadowColor: colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 6, elevation: 4 },
  streakBadge_century: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.dangerAlt, shadowColor: colors.dangerAlt, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 6, elevation: 4 },
  streakText: { color: colors.white, fontSize: 14, fontWeight: '600', marginLeft: 8 },
  progressSection: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, marginBottom: 25 },
  adjustedGoalLabel: { color: colors.textSecondary, fontSize: 12, marginBottom: 12, fontWeight: '600' },
  cardTitle: { color: colors.white, fontSize: 16, fontWeight: '600', marginBottom: 15 },
  disabledButton: { opacity: 0.7 },
  connectHealthButton: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  connectHealthButtonText: { color: colors.onPrimary, fontWeight: 'bold', fontSize: 14 },
  activityRow: { flexDirection: 'row', justifyContent: 'space-between' },
  activityCard: { flex: 1, alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: 14, paddingVertical: 14, marginHorizontal: 4 },
  activityValue: { color: colors.white, fontSize: 18, fontWeight: 'bold', marginTop: 6 },
  activityLabel: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  insightCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, marginBottom: 25, borderWidth: 1, borderColor: 'rgba(0, 255, 102, 0.2)' },
  insightHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  insightIcon: { marginRight: 10 },
  insightTitle: { color: colors.white, fontSize: 16, fontWeight: 'bold' },
  insightText: { color: colors.textFaintAlt2, fontSize: 15, fontStyle: 'italic', lineHeight: 22 },
  insightLoadingContainer: { flexDirection: 'row', alignItems: 'center' },
  insightLoadingText: { color: colors.textSecondary, marginLeft: 10, fontSize: 14 },
  // --- Card grande de calorias (hero) — mesmo cinza escuro dos outros
  // cards, com o anel de progresso e o texto no verde de marca. ---
  calorieHeroCard: { backgroundColor: colors.surfaceAlt, borderRadius: 16, padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  calorieHeroInfo: { flex: 1, marginRight: 12 },
  calorieHeroLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  calorieHeroValue: { color: colors.white, fontSize: 30, fontWeight: 'bold', marginTop: 4 },
  calorieHeroUnit: { fontSize: 15, fontWeight: '600' },
  calorieHeroMeta: { color: colors.textSecondary, fontSize: 13, marginTop: 6 },
  calorieHeroRingText: { color: colors.white, fontSize: 15, fontWeight: 'bold' },
  // --- Grade de cards de macro — fundo neutro uniforme (mesmo cinza dos
  // outros cards), ícone/percentual/barra no verde de marca. ---
  macroCardsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  macroCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 12, marginHorizontal: 4 },
  macroCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  macroCardPercentage: { fontSize: 12, fontWeight: '700' },
  macroCardValue: { color: colors.white, fontSize: 18, fontWeight: 'bold', marginTop: 8 },
  macroCardLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '600', marginTop: 2 },
  macroCardTrack: { height: 5, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden', marginTop: 10 },
  macroCardFill: { height: '100%', borderRadius: 3 },
  macroCardMeta: { color: colors.textSecondary, fontSize: 10, marginTop: 6 },
  // --- Card de hidratação — mesmo cinza escuro dos outros cards, destaque
  // no verde de marca. ---
  waterCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 16 },
  waterCardHeader: { flexDirection: 'row', alignItems: 'center' },
  waterCardLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginLeft: 8 },
  waterCardValue: { color: colors.white, fontSize: 22, fontWeight: 'bold', marginTop: 8 },
  waterCardUnit: { fontSize: 14, fontWeight: '600' },
  waterCardTrack: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden', marginTop: 10 },
  waterCardFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  waterButtonsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 15 },
  waterButton: { borderColor: colors.primary, borderWidth: 1, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 25 },
  waterButtonText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  listTitle: { color: colors.white, fontSize: 18, marginBottom: 15, fontWeight: '600' },
  repeatSection: { marginBottom: 20 },
  repeatSectionTitle: { color: colors.textSecondary, fontSize: 14, marginBottom: 10, fontWeight: '500' },
  repeatChipsRow: { flexDirection: 'row', flexWrap: 'wrap' },
  repeatChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.primary, paddingVertical: 8, paddingHorizontal: 14, marginRight: 10, marginBottom: 10, maxWidth: '100%' },
  repeatChipText: { color: colors.white, fontSize: 13, fontWeight: '500', textTransform: 'capitalize', maxWidth: 140 },
  repeatChipCalories: { color: colors.textSecondary, fontSize: 12, marginLeft: 8 },
  mealItemContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  mealItem: { flex: 1, backgroundColor: colors.surface, padding: 15, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: colors.primary },
  actionButton: { padding: 10, marginLeft: 10 },
  deleteButton: { padding: 10, marginLeft: 5 },
  deleteButtonText: { color: colors.danger, fontSize: 14, fontWeight: '500' },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  mealDesc: { color: colors.white, fontSize: 16, fontWeight: '500', flex: 1, marginRight: 10, textTransform: 'capitalize' },
  confidenceBadge: { backgroundColor: 'rgba(0, 255, 102, 0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: colors.primary },
  confidenceText: { color: colors.primary, fontSize: 10, fontWeight: 'bold' },
  mealMacros: { color: colors.textSecondary, fontSize: 13 },
  emptyText: { color: colors.textSecondary, textAlign: 'center', marginTop: 30, fontSize: 14 },
  fabContainer: { position: 'absolute', bottom: 30, right: 20, alignItems: 'center' },
  fab: { backgroundColor: colors.primary, width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },
  fabSecondary: { backgroundColor: colors.border, width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 15, elevation: 6 },
  errorText: { color: colors.danger, fontSize: 16, textAlign: 'center', marginBottom: 20 },
  retryButton: { backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 30, borderRadius: 10, },
  retryButtonText: { color: colors.onPrimary, fontSize: 16, fontWeight: 'bold' }
});