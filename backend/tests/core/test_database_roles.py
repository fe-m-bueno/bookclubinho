"""A separação entre o papel que migra e o papel que serve requisição.

`DATABASE_URL` é privilegiado: cria tabela, cria política e — no Neon, como
`neondb_owner` — tem BYPASSRLS. É o que a migration precisa e o que o app não
deveria ter. `DATABASE_APP_URL` é o papel restrito, e é ele que faz as políticas
valerem.

O que estes testes protegem é o acidente fácil: alguém "simplifica" o
`app.db.engine` para uma função só, o alembic passa a migrar com o papel restrito
(e falha), ou o app passa a servir com o privilegiado (e RLS deixa de valer sem
ninguém notar).
"""

from __future__ import annotations

from unittest.mock import patch

PRIVILEGIADA = "postgresql+asyncpg://owner:x@host:5432/db"
RESTRITA = "postgresql+asyncpg://app_role:y@host:5432/db"


class TestSeparacaoDePapeis:
    def test_app_usa_a_restrita_quando_existe(self) -> None:
        from app.db.engine import _build_app_url

        with patch("app.db.engine.settings") as s:
            s.DATABASE_URL = PRIVILEGIADA
            s.DATABASE_APP_URL = RESTRITA
            assert "app_role" in _build_app_url()

    def test_app_cai_na_privilegiada_quando_nao_existe(self) -> None:
        """Estado de hoje: sem a variável, nada muda."""
        from app.db.engine import _build_app_url

        with patch("app.db.engine.settings") as s:
            s.DATABASE_URL = PRIVILEGIADA
            s.DATABASE_APP_URL = None
            assert "owner" in _build_app_url()

    def test_migration_ignora_a_restrita(self) -> None:
        """`alembic/env.py` importa `_build_url`, e ela nunca pode virar a restrita.

        Papel restrito não possui as tabelas nem pode criar política: a migration
        falharia. E o inverso — alembic com a restrita — é o modo de falha mais
        confuso, porque só aparece no deploy.
        """
        from app.db.engine import _build_url

        with patch("app.db.engine.settings") as s:
            s.DATABASE_URL = PRIVILEGIADA
            s.DATABASE_APP_URL = RESTRITA
            url = _build_url()

        assert "owner" in url
        assert "app_role" not in url

    def test_alembic_continua_ligado_na_privilegiada(self) -> None:
        """Guarda contra trocar o import no env.py sem perceber o efeito."""
        from pathlib import Path

        env = (Path(__file__).resolve().parents[2] / "alembic" / "env.py").read_text()

        assert "_build_url" in env
        assert "_build_app_url" not in env
