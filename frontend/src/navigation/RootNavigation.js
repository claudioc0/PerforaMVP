import { createNavigationContainerRef } from '@react-navigation/native';

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