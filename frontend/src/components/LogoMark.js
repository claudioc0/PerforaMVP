import React from 'react';
import Svg, { Rect, Path, G } from 'react-native-svg';
import { colors } from '../theme/colors';

/**
 * Símbolo da marca Perfora — o "P" de alta performance (seta dupla |>>).
 * Vetor fiel ao identidade/logo.svg do MazyOS, sem o fundo sólido,
 * pra poder ser usado sobre qualquer superfície escura do app.
 */
export default function LogoMark({ size = 40, color = colors.primary }) {
  const height = size;
  const width = size * (160 / 130);

  return (
    <Svg width={width} height={height} viewBox="0 0 160 130">
      <G transform="translate(30, 20) skewX(-15)">
        {/* Haste do P */}
        <Rect x="0" y="0" width="22" height="85" rx="6" fill={color} />
        {/* Seta 1: topo do P, aponta pra evolução */}
        <Path
          d="M 11 10 L 50 32 L 11 55"
          stroke={color}
          strokeWidth="20"
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        />
        {/* Seta 2: rastro de movimento (fast-forward) */}
        <Path
          d="M 45 10 L 84 32 L 45 55"
          stroke={color}
          strokeWidth="20"
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
          opacity={0.4}
        />
      </G>
    </Svg>
  );
}
