"use client";

import { isToday, isYesterday, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TimestampSeparatorProps {
  timestamp: string;
}

function formatTimestamp(timestamp: string): string {
  const date = parseISO(timestamp);

  if (isToday(date)) {
    return `Hoje ${format(date, "HH:mm", { locale: ptBR })}`;
  }

  if (isYesterday(date)) {
    return `Ontem ${format(date, "HH:mm", { locale: ptBR })}`;
  }

  return format(date, "d MMM HH:mm", { locale: ptBR });
}

export function TimestampSeparator({ timestamp }: TimestampSeparatorProps) {
  const label = formatTimestamp(timestamp);

  return (
    <div
      role="separator"
      aria-label={label}
      className="flex items-center gap-3 px-4 py-1"
    >
      <div className="h-px flex-1 bg-border" />
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
