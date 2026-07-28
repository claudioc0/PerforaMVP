import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// ChooseSplitScreen e WeeklyPlanSetupScreen renderizavam o mesmo card
// expansível (nome, descrição, chevron, mesma paleta) cada um com sua própria
// cópia do componente — só o conteúdo de dentro (lista de dias pra iniciar
// direto, ou o stepper de dias por semana) muda de fato entre as duas telas.
export default function ExpandableSplitCard({ split, expanded, onToggle, contentStyle, children }) {
  return (
    <View style={styles.splitCard}>
      <TouchableOpacity style={styles.splitHeader} onPress={onToggle}>
        <View style={{ flex: 1 }}>
          <Text style={styles.splitName}>{split.name}</Text>
          {split.description && <Text style={styles.splitDescription}>{split.description}</Text>}
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color="#888" />
      </TouchableOpacity>

      {expanded && <View style={[styles.daysContainer, contentStyle]}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  splitCard: { backgroundColor: '#1E1E1E', borderRadius: 12, marginBottom: 12, overflow: 'hidden' },
  splitHeader: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  splitName: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  splitDescription: { color: '#888', fontSize: 12, marginTop: 2 },
  daysContainer: { borderTopWidth: 1, borderTopColor: '#333' },
});
