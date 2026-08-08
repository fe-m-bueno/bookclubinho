/**
 * O prazo da rodada, em dias e em português.
 *
 * O backend manda `YYYY-MM-DD` — um dia do calendário, sem hora. `new
 * Date("2026-08-13")` interpreta isso como meia-noite **UTC**, o que em
 * qualquer fuso a oeste de Greenwich cai no dia 12 e faz a home dizer que
 * falta um dia a menos. Daí o parse manual: o prazo é uma data local, como a
 * pessoa lê no calendário dela.
 */

export type DeadlineTone = "overdue" | "urgent" | "normal";

export interface DeadlineInfo {
  days: number;
  label: string;
  tone: DeadlineTone;
}

/** Meia-noite local do dia `YYYY-MM-DD`, ou `null` se a string não é isso. */
function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

const MS_PER_DAY = 86_400_000;

export function daysUntilDeadline(
  deadline: string,
  today: Date = new Date(),
): number | null {
  const target = parseLocalDate(deadline);
  if (!target) return null;
  // Divisão sobre duas meia-noites locais: o horário de verão muda a duração
  // de *um* dia do ano, e arredondar absorve essa hora a mais ou a menos.
  return Math.round((target.getTime() - startOfDay(today).getTime()) / MS_PER_DAY);
}

/** Até aqui o prazo é notícia; além disso é só informação. */
const URGENT_DAYS = 3;

export function describeDeadline(
  deadline: string | null,
  today: Date = new Date(),
): DeadlineInfo | null {
  if (!deadline) return null;
  const days = daysUntilDeadline(deadline, today);
  if (days === null) return null;

  if (days < 0) {
    const atraso = Math.abs(days);
    return {
      days,
      label: atraso === 1 ? "1 dia atrasado" : `${atraso} dias atrasado`,
      tone: "overdue",
    };
  }
  if (days === 0) return { days, label: "termina hoje", tone: "urgent" };
  if (days === 1) return { days, label: "termina amanhã", tone: "urgent" };
  if (days <= URGENT_DAYS)
    return { days, label: `faltam ${days} dias`, tone: "urgent" };
  return { days, label: `faltam ${days} dias`, tone: "normal" };
}
