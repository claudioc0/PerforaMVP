import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

/**
 * Permite navegar de qualquer lugar do app, mesmo fora de um componente React.
 * Útil para serviços como a camada de API.
 * @param {string} name - O nome da rota de destino.
 * @param {object} params - Parâmetros para passar para a rota.
 */
export function navigate(name, params) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
  }
}

/**
 * Desloga o usuário limpando TODA a pilha de navegação, não só empilhando
 * Login por cima dela — usar `navigate('Login')` (ou até `replace`, que só
 * troca a tela atual) deixava as telas anteriores (Dashboard, Insights, etc.)
 * ainda alcançáveis pelo botão de voltar do Android, expondo dados do
 * usuário anterior depois de outra pessoa logar no mesmo aparelho.
 */
export function resetToLogin() {
  if (navigationRef.isReady()) {
    navigationRef.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      })
    );
  }
}
