import React from "react";
import { View, Text } from "react-native";

/**
 * Barra de progresso simples para exibir um macronutriente
 * em relação a uma meta diária.
 */
export default function MacroProgressBar({ label, value, goal, color, unit = "g" }) {
  const safeGoal = goal > 0 ? goal : 1;
  const percentage = Math.min(100, Math.round((value / safeGoal) * 100));

  return (
    <View className="mb-3">
      <View className="flex-row justify-between mb-1">
        <Text className="text-gray-700 font-medium">{label}</Text>
        <Text className="text-gray-500 text-sm">
          {Math.round(value)}
          {unit} / {goal}
          {unit}
        </Text>
      </View>
      <View className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <View
          className="h-2 rounded-full"
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
      </View>
    </View>
  );
}
