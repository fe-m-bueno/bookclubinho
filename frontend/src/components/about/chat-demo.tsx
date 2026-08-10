"use client";

import { ChapterMarkerCard } from "@/components/chat/chapter-marker-card";
import { MessageBubble } from "@/components/chat/message-bubble";
import { buildMessageRows } from "@/components/chat/message-rows";
import { CONVERSA, VISITANTE_ID } from "./about-fixtures";

/**
 * A conversa de exemplo, com as duas coisas que o chat tem e que ninguém
 * adivinha de fora: o marcador de capítulo e a mensagem borrada.
 *
 * O agrupamento sai do `buildMessageRows` de produção, e não de props escritas
 * à mão: é ele que decide onde o bloco começa e termina, e a demo tem que
 * mostrar o chat como ele é, inclusive quando essa regra mudar.
 *
 * `viewerChapter` é `null` de propósito. O `SpoilerOverlay` revela sozinho
 * quando o leitor já passou do capítulo marcado — e é justamente o borrão que
 * a página está explicando, então aqui ele precisa continuar borrado.
 */
export function ChatDemo() {
  const linhas = buildMessageRows(CONVERSA);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-1.5">
      {linhas.map((linha) => (
        <div key={linha.key} className={linha.isGroupStart ? "mt-1.5" : ""}>
          {linha.isMarker ? (
            <ChapterMarkerCard message={linha.message} />
          ) : (
            <MessageBubble
              message={linha.message}
              isOwn={false}
              isGroupEnd={linha.isGroupEnd}
              showName={linha.isGroupStart}
              currentUserId={VISITANTE_ID}
              viewerChapter={null}
            />
          )}
        </div>
      ))}
    </div>
  );
}
