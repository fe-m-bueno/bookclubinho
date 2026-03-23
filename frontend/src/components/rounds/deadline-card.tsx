"use client";

import { format, parseISO, differenceInDays, startOfToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface DeadlineCardProps {
  deadline: string;
}

export function DeadlineCard({ deadline }: DeadlineCardProps) {
  const deadlineDate = parseISO(deadline);
  const today = startOfToday();
  const daysRemaining = differenceInDays(deadlineDate, today);

  const formattedDate = format(deadlineDate, "d 'de' MMMM", { locale: ptBR });
  const isPassed = daysRemaining < 0;

  return (
    <Card className="shadow-warm-sm">
      <CardContent className="flex items-center gap-3 py-4">
        <CalendarDays className="h-5 w-5 shrink-0 text-sage-600" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground capitalize">
            {formattedDate}
          </p>
          {isPassed ? (
            <p className="text-xs text-muted-foreground">Prazo encerrado</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              sem pressa, é só uma referência :)
            </p>
          )}
        </div>
        {!isPassed && (
          <Badge variant="secondary" className="shrink-0">
            {daysRemaining === 0
              ? "Hoje!"
              : daysRemaining === 1
                ? "1 dia"
                : `${daysRemaining} dias`}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
