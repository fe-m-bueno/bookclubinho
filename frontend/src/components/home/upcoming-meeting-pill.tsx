"use client";

import { useRouter } from "next/navigation";
import { format, isToday, isTomorrow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, MapPin, Video } from "lucide-react";
import type { MeetingType, UpcomingMeetingItem } from "@/lib/types/meeting";

interface UpcomingMeetingPillProps {
  meeting: UpcomingMeetingItem;
}

const MEETING_ICONS: Record<MeetingType, typeof Calendar> = {
  virtual: Video,
  hybrid: MapPin,
  in_person: Calendar,
};

/**
 * Quando é o encontro, em uma linha que se lê de relance.
 *
 * A data estava espremida numa segunda coluna, ao lado de uma pílula com o
 * nome do clube, e quebrava em duas linhas: "11 de ago às" / "11:45". O que
 * mais importa num encontro futuro é *quando*, então ele ganha a linha inteira
 * logo abaixo do título — e hoje e amanhã aparecem por nome, que é como as
 * pessoas pensam em datas próximas.
 */
function describeWhen(date: Date): string {
  const hora = format(date, "HH:mm", { locale: ptBR });
  if (isToday(date)) return `Hoje às ${hora}`;
  if (isTomorrow(date)) return `Amanhã às ${hora}`;
  // `EEEEEE` e não `EEE`: em pt-BR o segundo devolve "quinta" por extenso, e a
  // linha passava de "qui, 20 de ago às 19:30" para "quinta, 20 de ago às
  // 19:30" — comprida demais para uma coluna de 19rem.
  return format(date, "EEEEEE, d 'de' MMM 'às' HH:mm", { locale: ptBR });
}

export function UpcomingMeetingPill({ meeting }: UpcomingMeetingPillProps) {
  const router = useRouter();

  const scheduledAt = new Date(meeting.scheduled_at);
  const MeetingIcon = MEETING_ICONS[meeting.meeting_type] ?? Calendar;

  return (
    <button
      type="button"
      onClick={() => router.push(`/meetings/${meeting.id}`)}
      className="w-full cursor-pointer rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className="type-body truncate font-medium">{meeting.title}</p>

      {/* O ícone do tipo de encontro fica inline, do tamanho do texto. Estava
          dentro de um quadrado de 36px com fundo próprio, que pesava mais que
          o título ao lado e não dizia nada que a palavra não dissesse. */}
      {/* Na cor do conteúdo, e não na de `meta`: o quando é o que se lê
          primeiro num encontro futuro. */}
      <p className="type-meta mt-1 flex items-center gap-1.5 tabular-nums text-foreground">
        <MeetingIcon className="size-3.5 shrink-0 text-muted-foreground" />
        {describeWhen(scheduledAt)}
      </p>

      {/* O clube é contexto, não etiqueta: numa pílula com borda ele competia
          com o título do próprio encontro. E o ponto verde de RSVP saiu — a
          home não é onde se confere presença, e um círculo colorido sem
          legenda não diz o que significa. */}
      <p className="type-micro mt-0.5 truncate">
        {meeting.group_name}
      </p>
    </button>
  );
}
