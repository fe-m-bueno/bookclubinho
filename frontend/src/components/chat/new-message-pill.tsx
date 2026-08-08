"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

interface NewMessagePillProps {
  count: number;
  onClick: () => void;
}

/**
 * "1 nova mensagem" ou "4 novas mensagens".
 *
 * O plural estava montado por pedaços no meio do JSX: `mensagem` mais `ns`
 * quando `count !== 1`, o que dava "mensagemns" na tela toda vez que chegava
 * mais de uma. Em português o plural de "mensagem" troca o *m* final, não
 * acrescenta letra, e essa é uma conta que não cabe em concatenação: as duas
 * formas escritas por extenso é que não têm como sair erradas.
 */
function descreveContagem(count: number): string {
  return count === 1 ? "1 nova mensagem" : `${count} novas mensagens`;
}

export function NewMessagePill({ count, onClick }: NewMessagePillProps) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          key="new-message-pill"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2"
        >
          <button
            type="button"
            onClick={onClick}
            className="type-meta pointer-events-auto flex min-h-[44px] items-center gap-1.5 rounded-full bg-sage-600 px-4 py-2 text-white shadow-lg transition-colors hover:bg-sage-700 active:bg-sage-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:bg-sage-500 dark:hover:bg-sage-400"
            aria-label={`${descreveContagem(count)}. Ir para o final da conversa`}
          >
            <span>{descreveContagem(count)}</span>
            <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
