"""E2E do backfill da migration 0023 contra Postgres real.

Ver README.md nesta pasta. Este script exige um banco **descartável** — ele
executa `alembic upgrade` e escreve em `group_messages`.

Existe porque o backfill é SQL, e SQL não é alcançável pelos testes de unidade,
que mockam o `db` inteiro. E porque a primeira versão do backfill usava o padrão
`'media/[^?]+'`, que aceitava qualquer URL com `/media/` no caminho:

  - `https://terceiro.com/media/gato.jpg` virava a chave `media/gato.jpg` — que
    não existe no nosso bucket — e a URL original era apagada em seguida. Perda
    de dado, e a imagem passava de hotlink que carregava para 404 permanente.
  - `…/media/{outro_group_id}/x.webp` virava chave de outro clube, e a mensagem
    passava a servir objeto de um grupo alheio. `create_message` valida isso na
    escrita; o backfill entraria pela porta que a validação fechou.

`media_url` vinha do cliente sem validação de origem — é metade do que a #232
conserta —, então dado assim é plausível em produção. O padrão passou a exigir
`media/{group_id}/`, e é isso que os quatro casos abaixo fixam.

Rodar:

    E2E_DSN=postgresql://bookclub:bookclub@localhost:5432/bookclub_mig \
      python tests/e2e/media_key_backfill.py

Saída esperada: `8 passaram, 0 falharam`.
"""

from __future__ import annotations

import asyncio
import os
import sys

DSN = os.getenv("E2E_DSN", "postgresql://bookclub:bookclub@localhost:5432/bookclub_mig")

USER = "11111111-1111-1111-1111-111111111111"
GRUPO = "22222222-2222-2222-2222-222222222222"
OUTRO_GRUPO = "99999999-9999-9999-9999-999999999999"
HOST = "https://pub-abc.r2.dev"

ok = 0
fail = 0


def check(label: str, condition: bool, detail: str = "") -> None:
    global ok, fail
    if condition:
        ok += 1
        print(f"  \033[32m✓\033[0m {label}")
    else:
        fail += 1
        print(f"  \033[31m✗\033[0m {label}")
        if detail:
            print(f"      {detail}")


# (id, content_type, media_url, thumbnail_url)
#
# Ids escritos por extenso, e não montados com f-string na hora do INSERT: o
# `asyncpg-sqli` do semgrep marca f-string entre os argumentos de `conn.execute`
# mesmo quando a query é literal e os valores são posicionais. A saída seria um
# `# nosemgrep`, e escrever o uuid inteiro custa menos que suprimir um alerta de
# injeção de SQL — que é o tipo de supressão que envelhece mal.
CASOS = [
    (
        "a0000000-0000-0000-0000-000000000001",
        "image",
        f"{HOST}/media/{GRUPO}/foto.webp?X-Amz-Signature=deadbeef&X-Amz-Expires=3600",
        f"{HOST}/media/{GRUPO}/foto_thumb.webp?X-Amz-Signature=cafe",
    ),
    (
        "a0000000-0000-0000-0000-000000000002",
        "image",
        "https://site-de-terceiro.com/media/gato.jpg",
        None,
    ),
    (
        "a0000000-0000-0000-0000-000000000003",
        "image",
        f"{HOST}/media/{OUTRO_GRUPO}/alheio.webp?X-Amz-Signature=x",
        None,
    ),
    (
        "a0000000-0000-0000-0000-000000000004",
        "video_link",
        "https://youtube.com/watch?v=abc",
        None,
    ),
]


async def main() -> None:
    import asyncpg

    if "bookclub_mig" not in DSN and os.getenv("E2E_ALLOW_ANY_DB") != "1":
        print("Recuse-se: o DSN não aponta para um banco descartável (…_mig).")
        print("Este script escreve em group_messages. Use E2E_ALLOW_ANY_DB=1 para forçar.")
        sys.exit(2)

    verificar = os.getenv("VERIFICAR") == "1"

    conn = await asyncpg.connect(DSN)
    try:
        if verificar:
            await _verificar(conn)
            return

        # SQL sempre inline e em literal de uma peça, valores sempre como
        # parâmetros posicionais. Não é preferência de estilo: o `asyncpg-sqli` do
        # semgrep marca tanto a concatenação implícita de literais adjacentes
        # quanto a query passada por variável, e nos dois casos a saída seria um
        # `# nosemgrep` — que esconderia o padrão em vez de evitá-lo.
        await conn.execute("TRUNCATE group_messages, group_members, groups, users CASCADE")
        await conn.execute(
            """
            INSERT INTO users (id, email, display_name, auth_provider, email_verified)
            VALUES ($1, 'backfill@e2e.example.com', 'U', 'local', true)
            """,
            USER,
        )
        await conn.execute(
            """
            INSERT INTO groups (id, name, invite_code, created_by)
            VALUES ($1, 'G', 'MIGBF1', $2)
            """,
            GRUPO,
            USER,
        )
        for msg_id, tipo, media_url, thumb_url in CASOS:
            await conn.execute(
                """
                INSERT INTO group_messages
                    (id, group_id, user_id, content_type, media_url, thumbnail_url)
                VALUES ($1, $2, $3, $4, $5, $6)
                """,
                msg_id,
                GRUPO,
                USER,
                tipo,
                media_url,
                thumb_url,
            )

        print("\nCasos plantados. Rode `alembic upgrade head` e então:")
        print("  VERIFICAR=1 E2E_DSN=… python tests/e2e/media_key_backfill.py\n")
    finally:
        await conn.close()


async def _verificar(conn: object) -> None:
    """Lê o estado deixado pela migration. Não escreve nada.

    Separado do plantio de propósito: enquanto as duas metades moravam na mesma
    passagem, o `TRUNCATE` do começo apagava as linhas já migradas e replantava
    antes de conferir — e os casos 2 a 4, cujas asserções são "chave nula, URL
    preservada", passavam sem que migration alguma tivesse rodado.
    """
    linhas = {
        r["id"].hex[-1]: r
        for r in await conn.fetch(
            """
            SELECT id, media_key, thumbnail_key, media_url, thumbnail_url
            FROM group_messages
            """
        )
    }
    if len(linhas) != len(CASOS):
        print(f"esperava {len(CASOS)} linhas plantadas, encontrei {len(linhas)} — rode sem VERIFICAR primeiro")
        sys.exit(2)

    # 1 — presigned do próprio grupo: converte, e a URL vencida não fica para trás.
    c1 = linhas["1"]
    check(
        "caso 1 · chave extraída do próprio grupo", c1["media_key"] == f"media/{GRUPO}/foto.webp", str(c1["media_key"])
    )
    check("caso 1 · thumbnail idem", c1["thumbnail_key"] == f"media/{GRUPO}/foto_thumb.webp", str(c1["thumbnail_key"]))
    check("caso 1 · presigned não sobrevive", c1["media_url"] is None, str(c1["media_url"]))

    # 2 — URL externa: não vira chave, e não se perde.
    c2 = linhas["2"]
    check("caso 2 · URL de terceiro não vira chave", c2["media_key"] is None, str(c2["media_key"]))
    check(
        "caso 2 · URL original preservada",
        c2["media_url"] == "https://site-de-terceiro.com/media/gato.jpg",
        str(c2["media_url"]),
    )

    # 3 — chave de outro grupo: não atravessa a fronteira do clube.
    c3 = linhas["3"]
    check("caso 3 · chave de outro grupo recusada", c3["media_key"] is None, str(c3["media_key"]))
    check("caso 3 · linha suspeita fica intacta", c3["media_url"] is not None, str(c3["media_url"]))

    # 4 — video_link: media_url é link externo legítimo.
    c4 = linhas["4"]
    check(
        "caso 4 · video_link mantém o link", c4["media_url"] == "https://youtube.com/watch?v=abc", str(c4["media_url"])
    )

    print(f"\n{ok} passaram, {fail} falharam")
    if fail:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
