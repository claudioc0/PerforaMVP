export const darkColors = {
  primary: '#00FF66',       // brand green — CTAs, active states, accents
  onPrimary: '#121212',     // texto/ícone sobre uma superfície colors.primary (sempre escuro, nos dois temas)
  background: '#121212',    // root/page background
  surface: '#1E1E1E',       // card/panel background
  surfaceAlt: '#2A2A2A',    // secondary card / alternate surface
  border: '#333',           // dividers, borders, input backgrounds (also covers '#333333')
  white: '#FFF',            // primary text color (also covers '#FFFFFF')
  textSecondary: '#888',    // secondary/label text, muted icons (also covers '#888888')
  textMuted: '#666',        // placeholder text, faint captions
  textFaint: '#AAA',        // slightly brighter than textMuted, used in a handful of spots
  textFaintAlt: '#CCC',     // rare one-off, same family as textFaint
  textFaintAlt2: '#DDDDDD', // rare one-off, same family as textFaint
  textDark: '#555',         // fundo de estado neutro/desabilitado
  danger: '#FF6B6B',        // errors, destructive emphasis, "over goal" states
  dangerStrong: '#FF5555',  // delete icons (slightly different red than `danger`)
  dangerAlt: '#E5484D',     // another distinct red used in a couple of spots
  info: '#00BFFF',          // informational accent (rare, ~3 uses)
};

export const lightColors = {
  primary: '#00A651',       // mesmo verde de marca, ajustado pra contraste em fundo claro
  onPrimary: '#121212',     // texto/ícone sobre uma superfície colors.primary (sempre escuro, nos dois temas)
  background: '#F2F2F5',
  surface: '#FFFFFF',
  surfaceAlt: '#E8E8EC',
  border: '#D8D8DC',
  white: '#1A1A1A',         // primary text color — no claro é escuro (nome mantido por compatibilidade)
  textSecondary: '#68686D',
  textMuted: '#9A9A9F',
  textFaint: '#4A4A4F',
  textFaintAlt: '#3A3A3E',
  textFaintAlt2: '#2A2A2E',
  textDark: '#C7C7CC',      // fundo de estado neutro/desabilitado
  danger: '#D64545',
  dangerStrong: '#C23636',
  dangerAlt: '#B8342E',
  info: '#0090C8',
};

// Import estático (sem hook) — usado só na tela de loading inicial do App.js,
// antes do ThemeProvider montar. Qualquer tela normal deve usar useTheme().
export const colors = darkColors;

export default colors;
