import type { WrappedData } from "@/lib/types/wrapped";

interface WrappedSummaryCardProps {
  data: WrappedData;
  cardRef: React.RefObject<HTMLDivElement | null>;
}

export function WrappedSummaryCard({ data, cardRef }: WrappedSummaryCardProps) {
  return (
    <div
      ref={cardRef}
      className="absolute -left-[9999px] w-[540px] h-[960px] bg-gradient-to-br from-[oklch(0.88_0.08_68)] to-[oklch(0.70_0.15_50)] rounded-2xl p-8 flex flex-col gap-4 pointer-events-none"
      aria-hidden="true"
    >
      <h1 className="text-3xl font-bold text-foreground">{data.group_name}</h1>
      <p className="text-xl text-foreground/80">Wrapped {data.year}</p>
      <div className="flex gap-4 mt-2">
        <div className="bg-white/20 rounded-xl p-4 flex-1 text-center">
          <p className="text-3xl font-bold">{data.total_books_read}</p>
          <p className="text-sm opacity-80">livros</p>
        </div>
        <div className="bg-white/20 rounded-xl p-4 flex-1 text-center">
          <p className="text-3xl font-bold">{data.total_pages.toLocaleString("pt-BR")}</p>
          <p className="text-sm opacity-80">páginas</p>
        </div>
      </div>
      {data.highest_rated_book && (
        <div className="bg-white/20 rounded-xl p-4">
          <p className="text-xs opacity-70">Melhor avaliado</p>
          <p className="font-semibold">{data.highest_rated_book.title}</p>
          <p className="text-sm opacity-70">{data.highest_rated_book.avg_rating.toFixed(1)} ⭐</p>
        </div>
      )}
      <div className="mt-auto">
        {data.member_superlatives.slice(0, 3).map((s) => (
          <div key={s.user_id} className="flex items-center gap-2 mb-2">
            <span className="text-lg">{s.emoji}</span>
            <div>
              <span className="font-medium text-sm">{s.display_name ?? s.username}</span>
              <span className="text-xs opacity-70 ml-1">— {s.title}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
