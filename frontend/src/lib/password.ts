import { z } from "zod";

/**
 * A política de senha, do lado do cliente.
 *
 * Espelha `app/core/security.py` — o backend continua sendo a autoridade; isto
 * existe para o usuário não descobrir o limite por round-trip.
 *
 * O teto é do bcrypt, que só considera os primeiros 72 bytes e, desde a versão
 * 4, recusa entradas maiores em vez de truncá-las. Conta em **bytes**: uma frase
 * com acentos chega ao limite antes do que o comprimento visível sugere, então
 * `.max()` do zod, que conta caracteres, não serviria.
 */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72;

const encoder = new TextEncoder();

export const passwordField = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Mínimo de ${MIN_PASSWORD_LENGTH} caracteres`)
  .refine((v) => encoder.encode(v).length <= MAX_PASSWORD_BYTES, {
    message: `Senha longa demais (máximo ${MAX_PASSWORD_BYTES} bytes; acentos contam mais de um)`,
  });
