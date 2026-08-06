import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { queryKeys } from "@/lib/query-keys";

const GROUP = "g-1";

/**
 * A metade da API do React Query que casa por prefixo, e a que não casa.
 *
 * O bug da #234 vivia exatamente nessa fronteira: `getQueryData(
 * ["chat-messages", groupId])` parecia ler a janela do chat e sempre voltava
 * `undefined`, porque a query mora em `["chat-messages", groupId, filters]` e
 * `getQueryData` exige key exata. Compilava, rodava, não fazia nada.
 */
describe("queryKeys.chat.ofGroup", () => {
  it("é um filtro de prefixo, não uma key", () => {
    expect(queryKeys.chat.ofGroup(GROUP)).toEqual({
      queryKey: ["chat-messages", GROUP],
    });
  });

  it("atinge a janela filtrada por setQueriesData — o que setQueryData não faz", () => {
    const client = new QueryClient();
    const keyReal = queryKeys.chat.messages(GROUP, {
      roundId: null,
      chapterFilter: null,
    });
    client.setQueryData(keyReal, "janela");

    // A key de 2 elementos é outra entrada do cache: escrever nela não muda a
    // janela real. Era o que o update otimista do envio fazia.
    client.setQueryData(["chat-messages", GROUP], "no lugar errado");
    expect(client.getQueryData(keyReal)).toBe("janela");

    client.setQueriesData<string>(
      queryKeys.chat.ofGroup(GROUP),
      (old) => `${old} atualizada`,
    );
    expect(client.getQueryData(keyReal)).toBe("janela atualizada");
  });

  it("não pode ser passada para getQueryData/setQueryData", () => {
    const client = new QueryClient();

    // @ts-expect-error prefixo não é key: getQueryData exige igualdade exata
    client.getQueryData(queryKeys.chat.ofGroup(GROUP));

    // @ts-expect-error prefixo não é key: setQueryData exige igualdade exata
    client.setQueryData(queryKeys.chat.ofGroup(GROUP), "nada");

    // Já onde prefixo faz sentido, o filtro entra direto.
    expect(() =>
      client.invalidateQueries(queryKeys.chat.ofGroup(GROUP)),
    ).not.toThrow();
  });
});
