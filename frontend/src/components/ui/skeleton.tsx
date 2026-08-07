import { cn } from "@/lib/utils"

/**
 * `bg-skeleton` é translúcido: `--card` e `--background` têm lightness
 * diferentes, e nenhuma cor opaca dá contraste equivalente nas duas. E o pulse
 * é próprio porque o `animate-pulse` do Tailwind desce até opacidade 0.5 —
 * metade do ciclo abaixo de 1.08:1 contra a superfície, que é onde o skeleton
 * de fato desaparecia.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-skeleton-pulse rounded-md bg-skeleton",
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
