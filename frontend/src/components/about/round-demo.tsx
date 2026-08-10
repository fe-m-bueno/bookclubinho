"use client";

import { GroupHomeCard } from "@/components/home/group-home-card";
import { VotingCard } from "@/components/rounds/voting-card";
import {
  CLUBE_LENDO,
  INDICACOES,
  NOMINADORES,
} from "./about-fixtures";

/**
 * Cliente, e não servidor, por um motivo só: `VotingCard` recebe `onVote`, e
 * função não atravessa a fronteira do servidor. O `noop` é o preço de mostrar
 * o card de verdade em vez de uma cópia dele.
 */
const noop = () => {};

export function VotacaoDemo() {
  return (
    <div className="mx-auto grid max-w-md gap-3 sm:max-w-2xl sm:grid-cols-2">
      {INDICACOES.map((indicacao, i) => (
        <VotingCard
          key={indicacao.id}
          nomination={indicacao}
          nominatorName={NOMINADORES[indicacao.user_id] ?? "Alguém"}
          nominatorAvatarUrl={null}
          // O primeiro card aparece escolhido: é o estado que explica a tela.
          // Um par de cards neutros mostraria a lista, não a votação.
          isSelected={i === 0}
          isRevealed={false}
          isWinner={false}
          disabled
          onVote={noop}
        />
      ))}
    </div>
  );
}

export function ClubeDemo() {
  return (
    <div className="mx-auto max-w-md">
      <GroupHomeCard group={CLUBE_LENDO} />
    </div>
  );
}
