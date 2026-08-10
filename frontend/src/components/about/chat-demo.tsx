"use client";

import { ChapterMarkerCard } from "@/components/chat/chapter-marker-card";
import { MessageBubble } from "@/components/chat/message-bubble";
import { CONVERSA, VISITANTE_ID } from "./about-fixtures";

/**
 * A conversa de exemplo, com as duas coisas que o chat tem e que ninguém
 * adivinha de fora: o marcador de capítulo e a mensagem borrada.
 *
 * `viewerChapter` é `null` de propósito. O `SpoilerOverlay` revela sozinho
 * quando o leitor já passou do capítulo marcado — e é justamente o borrão que
 * a página está explicando, então aqui ele precisa continuar borrado.
 */
export function ChatDemo() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3">
      {CONVERSA.map((mensagem) =>
        mensagem.content_type === "chapter_marker" ? (
          <ChapterMarkerCard key={mensagem.id} message={mensagem} />
        ) : (
          <MessageBubble
            key={mensagem.id}
            message={mensagem}
            isOwn={false}
            showAvatar
            showName
            currentUserId={VISITANTE_ID}
            viewerChapter={null}
          />
        ),
      )}
    </div>
  );
}
