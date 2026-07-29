import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LogoMark from '../components/LogoMark';
import { navigate, resetToLogin } from './RootNavigation';
import { useDrawerMenu } from './DrawerMenuContext';
import { logoutUser } from '../services/api';
import { getToken } from '../services/secureTokenStorage';
import { clearLocalSession } from '../services/session';
import { colors } from '../theme/colors';
import { ROUTES } from './routes';

const DRAWER_WIDTH = Math.min(300, Dimensions.get('window').width * 0.8);

const MENU_ITEMS = [
  { label: 'Treinos', route: ROUTES.WORKOUT_HISTORY, icon: 'barbell' },
  { label: 'Gráficos', route: ROUTES.INSIGHTS, icon: 'stats-chart' },
  { label: 'Progresso', route: ROUTES.PROGRESS, icon: 'trending-up' },
  { label: 'Metas', route: ROUTES.GOALS, icon: 'flag' },
  { label: 'Lembretes', route: ROUTES.REMINDERS, icon: 'notifications' },
];

export default function DrawerContent() {
  const { isOpen, close } = useDrawerMenu();
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const scrimOpacity = useRef(new Animated.Value(0)).current;
  // Continua renderizado durante a animação de saída — só sai da árvore
  // depois que o slide-out termina, pra não sumir de forma abrupta.
  const [shouldRender, setShouldRender] = useState(isOpen);

  useEffect(() => {
    if (isOpen) setShouldRender(true);

    Animated.parallel([
      Animated.timing(translateX, {
        toValue: isOpen ? 0 : -DRAWER_WIDTH,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(scrimOpacity, {
        toValue: isOpen ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (!isOpen) setShouldRender(false);
    });
  }, [isOpen, translateX, scrimOpacity]);

  const goTo = (route) => {
    close();
    navigate(route);
  };

  const handleLogout = async () => {
    close();

    // Antes, "Sair" só limpava o armazenamento local — nunca avisava o
    // backend, então nem o access token nem o refresh token (validade de 7
    // dias) eram revogados de verdade. Um dos dois vazado continuava
    // funcionando normalmente mesmo depois do usuário ter "saído" do app.
    try {
      const refreshToken = await getToken('refresh_token');
      await logoutUser(refreshToken);
    } catch {
      // Best-effort: sem rede (ou token já expirado), o logout local
      // continua — não faz sentido prender o usuário na tela por causa disso.
    }

    // clearLocalSession (não só os tokens) — senão o nome do usuário
    // anterior e o insight de IA em cache continuavam visíveis até a
    // próxima chamada sobrescrever.
    await clearLocalSession();

    // reset (não navigate/replace) limpa a pilha inteira — senão o botão de
    // voltar do Android ainda alcançava o Dashboard do usuário anterior.
    resetToLogin();
  };

  // Mantém o overlay fora da árvore quando fechado, sem bloquear toques na tela.
  if (!shouldRender) {
    return null;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.scrim, { opacity: scrimOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>

      <Animated.View style={[styles.panel, { transform: [{ translateX }] }]}>
        <View style={styles.header}>
          <LogoMark size={32} />
          <Text style={styles.title}>PERFORA</Text>
        </View>

        {MENU_ITEMS.map((item) => (
          <TouchableOpacity key={item.route} style={styles.item} onPress={() => goTo(item.route)}>
            <Ionicons name={item.icon} size={22} color={colors.primary} style={styles.itemIcon} />
            <Text style={styles.itemText}>{item.label}</Text>
          </TouchableOpacity>
        ))}

        <View style={styles.divider} />

        <TouchableOpacity style={styles.item} onPress={handleLogout}>
          <Ionicons name="log-out" size={22} color={colors.textSecondary} style={styles.itemIcon} />
          <Text style={styles.logoutText}>Sair</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: colors.background,
    paddingTop: 60,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 30 },
  title: { color: colors.white, fontSize: 20, fontFamily: 'Orbitron_900Black', letterSpacing: 2, marginLeft: 10 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20 },
  itemIcon: { marginRight: 15 },
  itemText: { color: colors.white, fontSize: 16, fontWeight: '500' },
  logoutText: { color: colors.textSecondary, fontSize: 16 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 15, marginHorizontal: 20 },
});
