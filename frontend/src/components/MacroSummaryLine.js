import React from 'react';
import { Text } from 'react-native';

// A mesma linha "{kcal} kcal • P: … • C: … • G: …" era escrita à mão em
// Dashboard, MealConfirmation, AdjustQuantity e ManualEntry — cada uma
// arriscando divergir na formatação (casas decimais, ordem dos macros) se um
// ajuste fosse feito numa cópia e esquecido nas outras.
export default function MacroSummaryLine({ calories, proteinG, carbsG, fatG, style }) {
  return (
    <Text style={style}>
      {calories.toFixed(0)} kcal • P: {proteinG.toFixed(1)}g • C: {carbsG.toFixed(1)}g • G: {fatG.toFixed(1)}g
    </Text>
  );
}
