import React, { createContext, useContext, useState, useCallback } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';

const AppAlertContext = createContext(null);

/**
 * Substituto do `Alert.alert` nativo do Android/iOS com o visual escuro/verde
 * do Perfora. Mesma assinatura de `Alert.alert(title, message, buttons)`, então
 * basta trocar a chamada — sem reescrever a lógica de cada botão.
 *
 * `buttons` segue a convenção do RN: `{ text, onPress?, style? }`, com
 * `style` em `'default' | 'cancel' | 'destructive'`. Até 2 botões renderizam
 * lado a lado (confirmação); 3 ou mais empilham como um menu de opções
 * (ex: escolher entre vários dias/treinos).
 */
export function AppAlertProvider({ children }) {
  const [visible, setVisible] = useState(false);
  const [content, setContent] = useState(null);

  const showAlert = useCallback((title, message, buttons) => {
    const normalized = buttons && buttons.length > 0 ? buttons : [{ text: 'OK', style: 'default' }];
    setContent({ title, message, buttons: normalized });
    setVisible(true);
  }, []);

  const close = () => setVisible(false);

  const handlePress = (button) => {
    close();
    if (button.onPress) button.onPress();
  };

  const buttons = content?.buttons || [];
  const isSheet = buttons.length > 2;

  return (
    <AppAlertContext.Provider value={showAlert}>
      {children}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.overlay} onPress={close}>
          <Pressable style={styles.card} onPress={() => {}}>
            {!!content?.title && <Text style={styles.title}>{content.title}</Text>}
            {!!content?.message && <Text style={styles.message}>{content.message}</Text>}

            {isSheet ? (
              <View style={styles.sheetList}>
                {buttons.map((btn, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[styles.sheetItem, btn.style === 'cancel' && styles.sheetItemCancel]}
                    onPress={() => handlePress(btn)}
                  >
                    <Text
                      style={[
                        styles.sheetItemText,
                        btn.style === 'destructive' && styles.textDestructive,
                        btn.style === 'cancel' && styles.textCancel,
                      ]}
                    >
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.actionsRow}>
                {buttons.map((btn, index) => {
                  const isCancel = btn.style === 'cancel';
                  const isDestructive = btn.style === 'destructive';
                  return (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.actionButton,
                        isCancel ? styles.cancelButton : isDestructive ? styles.destructiveButton : styles.confirmButton,
                      ]}
                      onPress={() => handlePress(btn)}
                    >
                      <Text
                        style={[
                          styles.actionButtonText,
                          isCancel ? styles.cancelButtonText : isDestructive ? styles.destructiveButtonText : styles.confirmButtonText,
                        ]}
                      >
                        {btn.text}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </AppAlertContext.Provider>
  );
}

/** Retorna `showAlert(title, message, buttons)` — drop-in pro `Alert.alert` nativo. */
export function useAppAlert() {
  const context = useContext(AppAlertContext);
  if (!context) throw new Error('useAppAlert precisa ser usado dentro de um AppAlertProvider');
  return context;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { backgroundColor: '#1E1E1E', borderRadius: 16, padding: 22, width: '100%', maxWidth: 340, borderWidth: 1, borderColor: '#333' },
  title: { color: '#FFF', fontSize: 17, fontWeight: 'bold', marginBottom: 8 },
  message: { color: '#AAA', fontSize: 14, lineHeight: 20, marginBottom: 20 },

  actionsRow: { flexDirection: 'row' },
  actionButton: { flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionButtonText: { fontSize: 15, fontWeight: 'bold' },
  cancelButton: { backgroundColor: 'transparent', marginRight: 8 },
  cancelButtonText: { color: '#888', fontWeight: '600' },
  confirmButton: { backgroundColor: '#00FF66' },
  confirmButtonText: { color: '#121212' },
  destructiveButton: { backgroundColor: '#E5484D' },
  destructiveButtonText: { color: '#FFF' },

  sheetList: { marginTop: 4 },
  sheetItem: { paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#2A2A2A' },
  sheetItemCancel: { marginTop: 6, borderTopWidth: 1, borderTopColor: '#333' },
  sheetItemText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  textDestructive: { color: '#E5484D' },
  textCancel: { color: '#888', fontWeight: '600' },
});
