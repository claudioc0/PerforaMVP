/**
 * Regressão: um logout forçado (token expirado/401, ou o botão "Sair") tinha
 * que limpar a pilha de navegação INTEIRA, não só empilhar/trocar a tela
 * atual por Login. Antes, isso deixava o Dashboard (e outras telas) do
 * usuário anterior ainda alcançáveis pelo botão de voltar do Android depois
 * do logout — inclusive depois de outra pessoa logar no mesmo aparelho.
 */
// Não usa jest.requireActual aqui: puxaria a árvore real de
// @react-navigation/native (que por sua vez importa react-native), e o Jest
// deste projeto é deliberadamente mínimo — sem o preset jest-expo, não
// transforma esses módulos (ver o comentário no topo de jest.config.js).
// CommonActions.reset() é uma função pura e determinística (sem id
// gerado/estado interno), então reimplementá-la aqui é seguro.
const mockRef = {
  isReady: jest.fn(),
  dispatch: jest.fn(),
  navigate: jest.fn(),
};

jest.mock('@react-navigation/native', () => ({
  createNavigationContainerRef: () => mockRef,
  CommonActions: {
    reset: (state) => ({ type: 'RESET', payload: state }),
  },
}));

const { CommonActions } = require('@react-navigation/native');
const { navigate, resetToLogin, resetToDashboard } = require('./RootNavigation');

describe('resetToLogin', () => {
  beforeEach(() => {
    mockRef.isReady.mockReset();
    mockRef.dispatch.mockReset();
  });

  test('quando a navegação está pronta, despacha um RESET que deixa só Login na pilha', () => {
    mockRef.isReady.mockReturnValue(true);

    resetToLogin();

    expect(mockRef.dispatch).toHaveBeenCalledWith(
      CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] })
    );
  });

  test('não faz nada se a navegação ainda não estiver pronta (evita crash no boot do app)', () => {
    mockRef.isReady.mockReturnValue(false);

    resetToLogin();

    expect(mockRef.dispatch).not.toHaveBeenCalled();
  });
});

describe('resetToDashboard', () => {
  // Usado pelo ErrorBoundary global depois de um crash de render — a tela que
  // crashou pode ter deixado a pilha de navegação num estado inconsistente,
  // então goBack() não é confiável; resetar pra uma tela conhecida é.
  beforeEach(() => {
    mockRef.isReady.mockReset();
    mockRef.dispatch.mockReset();
  });

  test('quando a navegação está pronta, despacha um RESET que deixa só Dashboard na pilha', () => {
    mockRef.isReady.mockReturnValue(true);

    resetToDashboard();

    expect(mockRef.dispatch).toHaveBeenCalledWith(
      CommonActions.reset({ index: 0, routes: [{ name: 'Dashboard' }] })
    );
  });

  test('não faz nada se a navegação ainda não estiver pronta', () => {
    mockRef.isReady.mockReturnValue(false);

    resetToDashboard();

    expect(mockRef.dispatch).not.toHaveBeenCalled();
  });
});

describe('navigate', () => {
  beforeEach(() => {
    mockRef.isReady.mockReset();
    mockRef.navigate.mockReset();
  });

  test('navega para a rota pedida quando a navegação está pronta', () => {
    mockRef.isReady.mockReturnValue(true);

    navigate('Dashboard', { foo: 'bar' });

    expect(mockRef.navigate).toHaveBeenCalledWith('Dashboard', { foo: 'bar' });
  });

  test('não faz nada se a navegação ainda não estiver pronta', () => {
    mockRef.isReady.mockReturnValue(false);

    navigate('Dashboard');

    expect(mockRef.navigate).not.toHaveBeenCalled();
  });
});
