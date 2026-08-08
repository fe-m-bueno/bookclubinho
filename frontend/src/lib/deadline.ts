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

/**
 * O sujeito da frase: o que termina.
 *
 * "termina amanhã" e "3 dias atrasado" diziam quando sem dizer o quê, e o
 * botão ao lado não resolvia — ele fica na outra ponta da faixa, some quando a
 * rodada não espera por você, e "Avaliar" não conta que o atraso é da
 * avaliação. Sempre no singular: assim o verbo é o mesmo nos quatro casos e
 * não há concordância para errar.
 */
const PHASE_SUBJECTS: Record<string, string> = {
  nominating: "indicação",
  voting: "votação",
  reading: "leitura",
  reviewing: "avaliação",
};

export function deadlineSubject(status: string | null | undefined): string | null {
  if (!status) return null;
  return PHASE_SUBJECTS[status] ?? null;
}

function withSubject(subject: string | null, phrase: string): string {
  if (!subject) return phrase;
  return `${subject} ${phrase}`;
}

export function describeDeadline(
  deadline: string | null,
  today: Date = new Date(),
  /** A fase da rodada. Sem ela a frase sai sem sujeito, como antes. */
  status?: string | null,
): DeadlineInfo | null {
  if (!deadline) return null;
  const days = daysUntilDeadline(deadline, today);
  if (days === null) return null;

  const subject = deadlineSubject(status);

  if (days < 0) {
    const atraso = Math.abs(days);
    return {
      days,
      // "terminou há 3 dias", e não "3 dias atrasado": o atraso é do prazo, e
      // a frase que nomeia o sujeito precisa de um verbo para sustentá-lo.
      label: withSubject(
        subject,
        atraso === 1 ? "terminou ontem" : `terminou há ${atraso} dias`,
      ),
      tone: "overdue",
    };
  }
  if (days === 0)
    return { days, label: withSubject(subject, "termina hoje"), tone: "urgent" };
  if (days === 1)
    return { days, label: withSubject(subject, "termina amanhã"), tone: "urgent" };
  return {
    days,
    label: withSubject(subject, `termina em ${days} dias`),
    tone: days <= URGENT_DAYS ? "urgent" : "normal",
  };
}
