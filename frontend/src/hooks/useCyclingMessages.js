import { useEffect, useState } from 'react';

// Alterna entre frases de status enquanto uma espera "cega" (ex: aguardando
// a IA) está em andamento — não reduz o tempo real de espera, só evita que
// o usuário encare um spinner parado sem noção do que está acontecendo.
// Reseta pro início sempre que `active` vira false, pra próxima espera
// começar do zero (não continuar de onde a anterior parou).
export default function useCyclingMessages(messages, active, intervalMs = 1800) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % messages.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [active, messages, intervalMs]);

  return messages[index];
}
