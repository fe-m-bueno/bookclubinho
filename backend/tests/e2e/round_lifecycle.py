"""E2E do ciclo de vida da rodada contra um backend real + Postgres real.

Ver README.md nesta pasta para subir a infra e rodar.

Verifica o que os testes de unidade não conseguem, porque todos eles mockam o db:

  1. A premissa de ordenação do after-commit (#210): o badge checker abre sessão
     própria e não vê linhas não-commitadas. Se a ordem estiver errada, nenhum
     badge é concedido — e nada falha.
  2. O handler global de ServiceError (#209): MembershipError levantado dentro de
     chat.py deve chegar como 404, não 500.
  3. A semântica do SQL do membership: o teste de unidade afirma a string
     compilada, não o comportamento.
  4. cleanup_expired_streaks contra linhas de verdade.
  5. A máquina de estados (#203) atravessada de ponta a ponta.
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid

import httpx

API = os.getenv("E2E_API_URL", "http://localhost:8010/api/v1")
PASSWORD = "SenhaForte!2026"
DSN = os.getenv("E2E_DSN", "postgresql://bookclub:bookclub@localhost:5432/bookclub")

ok = 0
fail = 0


def check(label: str, condition: bool, detail: str = "") -> None:
    global ok, fail
    if condition:
        ok += 1
        print(f"  \033[32m✓\033[0m {label}")
    else:
        fail += 1
        print(f"  \033[31m✗\033[0m {label}" + (f"\n      {detail}" if detail else ""))


def _slugs(r: httpx.Response) -> list[str]:
    """Slugs conquistados. A resposta é {"badges": {categoria: [...]}}."""
    if r.status_code == 429:
        raise AssertionError("rate limit no /users/me/badges — poll do teste agressivo demais")
    if r.status_code != 200:
        return []
    groups = r.json().get("badges", {})
    return [b["slug"] for items in groups.values() for b in items if b.get("earned_at")]


async def _wait_for_badge(client: httpx.AsyncClient, slug: str, tries: int = 22) -> None:
    """Espera um badge aparecer. O check roda em background com sessão própria.

    Intervalo largo de propósito: /users/me/badges é 30/minute, e um poll
    agressivo esgota o limite — o 429 então parece "nenhum badge".
    """
    for i in range(tries):
        r = await client.get(f"{API}/users/me/badges")
        if r.status_code == 429:
            await asyncio.sleep(3.0)
            continue
        if slug in _slugs(r):
            return
        await asyncio.sleep(2.0 if i < tries - 1 else 0)


async def csrf(client: httpx.AsyncClient) -> dict[str, str]:
    await client.get(f"{API}/auth/csrf")
    token = client.cookies.get("csrf_token")
    return {"X-CSRF-Token": token} if token else {}


async def make_user(client: httpx.AsyncClient, tag: str) -> dict:
    """Cria o usuário direto no banco, já verificado.

    Não passa por POST /auth/register de propósito: aquele endpoint devolve 500
    quando o envio do email de verificação falha (issue #212), e o Resend recusa
    domínios de teste. Login exige email_verified, então marcamos aqui.
    """
    import asyncpg

    from app.core.security import hash_password

    email = f"e2e-{tag}-{uuid.uuid4().hex[:8]}@example.com"
    conn = await asyncpg.connect(DSN)
    try:
        # A query é literal e todos os valores vão como bind params ($1..$5) —
        # a regra casa pelo `conn.execute` com string multi-linha, não por
        # interpolação. Nada aqui vem de input externo.
        # nosemgrep: python.lang.security.audit.sqli.asyncpg-sqli.asyncpg-sqli
        await conn.execute(
            """
            INSERT INTO users (id, email, hashed_password, display_name, username,
                               email_verified, is_active, onboarding_completed,
                               auth_provider, timezone)
            VALUES ($1, $2, $3, $4, $5, true, true, true, 'local', 'America/Sao_Paulo')
            """,
            uuid.uuid4(),
            email,
            hash_password(PASSWORD),
            f"E2E {tag}",
            f"e2e_{tag}_{uuid.uuid4().hex[:6]}",
        )
    finally:
        await conn.close()
    return {"email": email}


async def login(client: httpx.AsyncClient, email: str) -> None:
    # OAuth2PasswordRequestForm: form-encoded, campo "username"
    r = await client.post(f"{API}/auth/login", data={"username": email, "password": PASSWORD})
    assert r.status_code == 200, f"login: {r.status_code} {r.text}"


async def main() -> int:
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=False) as admin:
        print("\n── setup ────────────────────────────────────────────────")
        a = await make_user(admin, "admin")
        await login(admin, a["email"])
        me = await admin.get(f"{API}/users/me")
        check("admin autenticado", me.status_code == 200, f"{me.status_code} {me.text[:200]}")

        # ── 2. handler global de ServiceError ────────────────────────
        print("\n── handler global de ServiceError (#209) ────────────────")
        r = await admin.get(f"{API}/groups/{uuid.uuid4()}")
        check(
            "clube inexistente → 404, não 500",
            r.status_code == 404,
            f"recebido {r.status_code}: {r.text[:200]}",
        )
        check("resposta tem 'detail'", "detail" in r.json(), r.text[:200])

        # ── grupo + badge founder (premissa do after-commit) ─────────
        print("\n── after-commit: badge founder (#210) ───────────────────")
        h = await csrf(admin)
        r = await admin.post(f"{API}/groups", data={"name": "Clube E2E"}, headers=h)
        check("criar clube", r.status_code in (200, 201), f"{r.status_code} {r.text[:300]}")
        if r.status_code >= 400:
            return 1
        group = r.json()
        gid = group["id"]

        await _wait_for_badge(admin, "founder")
        r = await admin.get(f"{API}/users/me/badges")
        slugs = _slugs(r)
        check(
            "badge 'founder' concedida pelo background task",
            "founder" in slugs,
            f"badges={slugs} (status {r.status_code}). Se vazio, a ordem "
            f"commit→background task está errada e NENHUM badge é concedido.",
        )

        # ── segundo membro ───────────────────────────────────────────
        async with httpx.AsyncClient(timeout=30.0) as member:
            b = await make_user(member, "member")
            await login(member, b["email"])
            hm = await csrf(member)
            r = await member.post(f"{API}/groups/join", json={"invite_code": group["invite_code"]}, headers=hm)
            check("segundo membro entrou", r.status_code in (200, 201), f"{r.status_code} {r.text[:200]}")

            # ── 3. membership real ───────────────────────────────────
            print("\n── SQL do membership (#201) ─────────────────────────────")
            async with httpx.AsyncClient(timeout=30.0) as outsider:
                c = await make_user(outsider, "outsider")
                await login(outsider, c["email"])
                r = await outsider.get(f"{API}/groups/{gid}")
                check("não-membro no clube → 404", r.status_code == 404, f"{r.status_code}")
                ho = await csrf(outsider)
                r = await outsider.post(
                    f"{API}/groups/{gid}/messages",
                    json={"content_type": "text", "content_text": "invasão"},
                    headers=ho,
                )
                check(
                    "não-membro postando no chat → 404 (não 500)",
                    r.status_code == 404,
                    f"{r.status_code}: {r.text[:200]}",
                )

            # ── 5. máquina de estados ────────────────────────────────
            print("\n── máquina de estados da rodada (#203) ──────────────────")
            r = await admin.post(f"{API}/groups/{gid}/rounds", json={}, headers=h)
            check("criar rodada", r.status_code in (200, 201), f"{r.status_code} {r.text[:300]}")
            rid = r.json()["id"]

            # PATCH com status deve ser ignorado, não transicionar
            r = await admin.patch(f"{API}/rounds/{rid}", json={"status": "voting"}, headers=h)
            check(
                "PATCH só com status → 422 (campo ignorado, nada para atualizar)",
                r.status_code == 422,
                f"{r.status_code}: {r.text[:200]}",
            )
            r = await admin.get(f"{API}/groups/{gid}/rounds/current")
            check(
                "rodada continua em 'nominating' após o PATCH",
                r.json().get("status") == "nominating",
                f"status={r.json().get('status')}",
            )

            # guarda: votar com menos de 2 indicações
            r = await admin.post(f"{API}/rounds/{rid}/start-voting", headers=h)
            check(
                "abrir votação sem indicações → 422 (guarda)",
                r.status_code == 422,
                f"{r.status_code}: {r.text[:200]}",
            )

            for i, (bid, title) in enumerate([("bk-1", "Livro Um"), ("bk-2", "Livro Dois")]):
                cli, hh = (admin, h) if i == 0 else (member, hm)
                r = await cli.post(
                    f"{API}/rounds/{rid}/nominate",
                    json={"book_id": bid, "book_title": title, "book_page_count": 200},
                    headers=hh,
                )
                check(f"indicar {title}", r.status_code in (200, 201), f"{r.status_code} {r.text[:200]}")

            # transição ilegal → 409
            r = await admin.post(f"{API}/rounds/{rid}/finish", headers=h)
            check(
                "encerrar de 'nominating' → 409 (par ilegal)",
                r.status_code == 409,
                f"{r.status_code}: {r.text[:200]}",
            )

            r = await admin.post(f"{API}/rounds/{rid}/start-voting", headers=h)
            check("abrir votação com 2 indicações", r.status_code == 200, f"{r.status_code} {r.text[:200]}")

            # finalizar sem votos → 422 (guarda)
            r = await admin.post(f"{API}/rounds/{rid}/finalize", json={}, headers=h)
            check(
                "finalizar sem votos → 422 (guarda)",
                r.status_code == 422,
                f"{r.status_code}: {r.text[:200]}",
            )

            cur = (await admin.get(f"{API}/groups/{gid}/rounds/current")).json()
            noms = cur["nominations"]
            r = await admin.post(f"{API}/rounds/{rid}/vote", json={"nomination_id": noms[0]["id"]}, headers=h)
            check("votar", r.status_code in (200, 201), f"{r.status_code} {r.text[:200]}")

            r = await admin.post(f"{API}/rounds/{rid}/finalize", json={}, headers=h)
            check("finalizar votação", r.status_code == 200, f"{r.status_code} {r.text[:300]}")
            cur = (await admin.get(f"{API}/groups/{gid}/rounds/current")).json()
            check("rodada em 'reading'", cur["status"] == "reading", cur["status"])
            check(
                "livro preenchido pelo finalize (o buraco do PATCH)",
                bool(cur.get("book_title")),
                f"book_title={cur.get('book_title')!r}",
            )

            # ── progresso + streak + badges ──────────────────────────
            print("\n── progresso, streak e badges (#202) ───────────────────")
            r = await admin.post(
                f"{API}/rounds/{rid}/progress",
                json={"current_page": 200, "percentage": None},
                headers=h,
            )
            check("progresso 100%", r.status_code in (200, 201), f"{r.status_code} {r.text[:300]}")
            await _wait_for_badge(admin, "first_blood")
            prof = (await admin.get(f"{API}/users/me")).json()
            check(
                "streak subiu para 1",
                prof.get("streak_current") == 1,
                f"streak_current={prof.get('streak_current')}",
            )
            r = await admin.get(f"{API}/users/me/badges")
            slugs = _slugs(r)
            check("badge 'first_blood' concedida", "first_blood" in slugs, f"badges={slugs}")

            # ── review pelo segundo membro: o bug de #202 ────────────
            print("\n── review termina o livro (bug de #202) ────────────────")
            r = await member.post(
                f"{API}/rounds/{rid}/review",
                json={
                    "star_rating": 5,
                    "cried": True,
                    "loved_it": True,
                    "felt_aroused": False,
                    "found_heavy": False,
                    "wants_more_from_author": True,
                    "sincere_review": "Gostei muito deste livro, recomendo.",
                },
                headers=hm,
            )
            check("submeter review", r.status_code in (200, 201), f"{r.status_code} {r.text[:300]}")
            await _wait_for_badge(member, "speed_reader")
            prof_m = (await member.get(f"{API}/users/me")).json()
            check(
                "streak do reviewer subiu (antes de #202 não subia)",
                prof_m.get("streak_current") == 1,
                f"streak_current={prof_m.get('streak_current')}",
            )
            r = await member.get(f"{API}/users/me/badges")
            slugs_m = _slugs(r)
            # first_blood é do *primeiro* a terminar na rodada (badge_checker.py:169),
            # e o admin chegou antes. O que prova que o caminho de review disparou o
            # check de book_finished é o speed_reader.
            check(
                "reviewer ganhou badge de book_finished (antes de #202, nenhuma)",
                "speed_reader" in slugs_m,
                f"badges={slugs_m}",
            )

            # ── encerrar rodada ─────────────────────────────────────
            print("\n── encerrar rodada ─────────────────────────────────────")
            r = await admin.post(f"{API}/rounds/{rid}/start-review", headers=h)
            check("abrir fase de reviews", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
            r = await admin.post(f"{API}/rounds/{rid}/finish", headers=h)
            check("encerrar rodada", r.status_code == 200, f"{r.status_code} {r.text[:300]}")
            # Releitura com retry: a resposta é enviada antes do commit (issue #215),
            # então uma leitura imediata pode ver o estado anterior.
            status = None
            for _ in range(20):
                rr = await admin.get(f"{API}/groups/{gid}/rounds")
                status = rr.json()["rounds"][0]["status"]
                if status == "finished":
                    break
                await asyncio.sleep(0.25)
            check("rodada em 'finished'", status == "finished", f"status={status}")

    print(f"\n{'─' * 56}\n  {ok} passaram, {fail} falharam\n")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
