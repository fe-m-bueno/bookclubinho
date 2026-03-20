interface WrappedDotsProps {
  total: number;
  current: number;
  onDotClick?: (index: number) => void;
}

export function WrappedDots({ total, current, onDotClick }: WrappedDotsProps) {
  return (
    <div className="flex gap-1.5 items-center justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          onClick={() => onDotClick?.(i)}
          className="rounded-full transition-all duration-200 min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label={`Slide ${i + 1}`}
          aria-current={i === current ? "true" : undefined}
        >
          <span
            className={`block rounded-full transition-all duration-200 ${
              i === current
                ? "w-4 h-2 bg-foreground"
                : "w-1.5 h-1.5 bg-foreground/40"
            }`}
          />
        </button>
      ))}
    </div>
  );
}
