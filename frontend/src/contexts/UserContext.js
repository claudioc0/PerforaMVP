import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { getUserGoals } from '../services/api';

const UserContext = createContext(null);

/**
 * Metas nutricionais do usuário, compartilhadas entre telas.
 *
 * Antes, Dashboard, Goals e Insights buscavam `getUserGoals()` cada uma por
 * conta própria. Além do desperdício de rede, isso abria uma janela de
 * inconsistência real: salvar uma meta nova em GoalsScreen só refletia no
 * Dashboard "por acaso", porque o Dashboard tinha um bug de buscar os dados
 * duas vezes ao focar a tela. Com um estado único, `setGoalsLocally` propaga
 * o valor novo pra qualquer tela que leia `goals` daqui, sem depender de nenhum
 * efeito colateral de outra tela.
 */
export function UserProvider({ children }) {
  const [goals, setGoals] = useState(null);
  const [loadingGoals, setLoadingGoals] = useState(false);
  // Se duas telas pedirem os dados quase ao mesmo tempo (ex: navegação rápida
  // Dashboard -> Insights), a segunda reaproveita a mesma promise em vez de
  // disparar outra busca idêntica em paralelo.
  const inFlightRef = useRef(null);

  const refreshGoals = useCallback(() => {
    if (inFlightRef.current) return inFlightRef.current;

    setLoadingGoals(true);
    const promise = getUserGoals()
      .then((data) => {
        setGoals(data);
        return data;
      })
      .finally(() => {
        setLoadingGoals(false);
        inFlightRef.current = null;
      });

    inFlightRef.current = promise;
    return promise;
  }, []);

  // Chamado depois que updateUserGoals/calculateSmartGoals já confirmaram
  // sucesso no backend — atualiza todo mundo que lê `goals` na hora, sem
  // esperar (nem precisar de) uma nova busca de rede.
  const setGoalsLocally = useCallback((newGoals) => {
    setGoals(newGoals);
  }, []);

  return (
    <UserContext.Provider value={{ goals, loadingGoals, refreshGoals, setGoalsLocally }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUserGoals() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUserGoals precisa ser usado dentro de um UserProvider');
  }
  return context;
}
