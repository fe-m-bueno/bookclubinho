import { describe, expect, it } from "vitest";

import { MAX_PASSWORD_BYTES, passwordField } from "@/lib/password";

/**
 * O limite é do bcrypt e conta bytes. `.max()` do zod conta caracteres, o que
 * deixaria passar uma frase acentuada que o backend recusaria — daí o refine.
 */
describe("passwordField", () => {
  it("aceita uma senha comum", () => {
    expect(passwordField.safeParse("SenhaForte!2026").success).toBe(true);
  });

  it("recusa abaixo de 8 caracteres", () => {
    const r = passwordField.safeParse("curta");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toContain("8 caracteres");
  });

  it("recusa acima de 72 bytes", () => {
    const r = passwordField.safeParse("a".repeat(MAX_PASSWORD_BYTES + 1));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toContain("longa demais");
  });

  it("aceita exatamente 72 bytes", () => {
    expect(passwordField.safeParse("a".repeat(MAX_PASSWORD_BYTES)).success).toBe(true);
  });

  it("conta bytes, não caracteres", () => {
    // 40 caracteres, 80 bytes em UTF-8.
    const acentuada = "ç".repeat(40);
    expect(acentuada.length).toBeLessThan(MAX_PASSWORD_BYTES);
    expect(passwordField.safeParse(acentuada).success).toBe(false);
  });

  it("emoji também estoura antes do que o comprimento sugere", () => {
    expect(passwordField.safeParse("🔒".repeat(19)).success).toBe(false);
  });
});
