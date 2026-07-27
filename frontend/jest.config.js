// Primeira configuração de testes do frontend. Escopo deliberadamente pequeno:
// cobre lógica pura de JS (utils/hooks sem depender de módulos nativos), que é
// exatamente onde mora o cálculo de macros hoje sem nenhum teste. Testar telas
// inteiras (render de componente RN) exigiria o preset jest-expo + mocks de
// módulos nativos (AsyncStorage, câmera, etc.) — fica pra uma próxima rodada.
module.exports = {
  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/", "/android/", "/ios/"],
  // babel-preset-expo reescreve process.env.EXPO_PUBLIC_* como um import do
  // módulo ESM virtual "expo/virtual/env" — por padrão o Jest não transforma
  // nada dentro de node_modules, e esse arquivo quebra ao ser importado cru.
  transformIgnorePatterns: ["node_modules/(?!(expo)/)"],
};
