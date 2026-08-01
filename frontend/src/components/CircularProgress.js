import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

/** Anel de progresso circular genérico — usado nos cards de métrica do
 * Dashboard pra dar um gráfico mais visual que uma barra linear (inspirado
 * nos anéis/gráficos de rosca de referências de dashboards analíticos). */
export default function CircularProgress({
  percentage = 0,
  size = 64,
  strokeWidth = 8,
  color = '#FFF',
  trackColor = 'rgba(255,255,255,0.25)',
  children,
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(percentage, 100));
  const strokeDashoffset = circumference * (1 - clamped / 100);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          // Gira a origem do traço pro topo (12h) em vez do padrão às 3h do SVG.
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {children && <View style={styles.center}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
});
