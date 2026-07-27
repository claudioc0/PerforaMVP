// Não existia nenhum babel.config.js no projeto — o Metro (bundler do Expo em
// dev/build) resolve o preset por conta própria mesmo sem esse arquivo, mas o
// Jest não: sem uma config explícita, ele não sabe transformar JSX/ESM, e o
// NativeWind (já instalado, nunca usado) também depende desse arquivo pra
// registrar seu próprio babel plugin.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
