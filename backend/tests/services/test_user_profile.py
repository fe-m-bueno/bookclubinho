"""Testes de serviço para user_profile."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas.user import UserUpdate
from app.services.user_profile import ProfileError, get_public_profile, update_user_profile
from tests.conftest import make_user, mock_db_returning


class TestUpdateUserProfile:
    @pytest.mark.asyncio
    async def test_update_display_name(self) -> None:
        user = make_user(display_name="Old Name")
        db = mock_db_returning(None)  # username check → available

        with patch("app.services.user_profile.check_username_available", new_callable=AsyncMock) as mock_check:
            mock_check.return_value = True
            result = await update_user_profile(
                db=db,
                user=user,
                payload=UserUpdate(display_name="New Name"),
            )

        assert result.display_name == "New Name"

    @pytest.mark.asyncio
    async def test_update_username_conflict(self) -> None:
        user = make_user(username="myuser")
        db = mock_db_returning(None)

        with patch("app.services.user_profile.check_username_available", new_callable=AsyncMock) as mock_check:
            mock_check.return_value = False
            with pytest.raises(ProfileError, match="Username"):
                await update_user_profile(
                    db=db,
                    user=user,
                    payload=UserUpdate(username="takenuser"),
                )

    @pytest.mark.asyncio
    async def test_update_status_text(self) -> None:
        user = make_user()
        db = mock_db_returning(None)

        result = await update_user_profile(
            db=db,
            user=user,
            payload=UserUpdate(status_text="Lendo muito!"),
        )

        assert result.status_text == "Lendo muito!"

    @pytest.mark.asyncio
    async def test_update_preferred_genres(self) -> None:
        user = make_user(preferred_genres=["fantasia"])
        db = mock_db_returning(None)

        result = await update_user_profile(
            db=db,
            user=user,
            payload=UserUpdate(preferred_genres=["fantasia", "sci-fi"]),
        )

        assert result.preferred_genres == ["fantasia", "sci-fi"]

    @pytest.mark.asyncio
    async def test_update_timezone(self) -> None:
        user = make_user()
        db = mock_db_returning(None)

        result = await update_user_profile(
            db=db,
            user=user,
            payload=UserUpdate(timezone="Europe/London"),
        )

        assert result.timezone == "Europe/London"

    @pytest.mark.asyncio
    async def test_empty_payload_no_changes(self) -> None:
        user = make_user(display_name="Unchanged")
        db = mock_db_returning(None)

        result = await update_user_profile(
            db=db,
            user=user,
            payload=UserUpdate(),
        )

        assert result.display_name == "Unchanged"


class TestGetPublicProfileBadges:
    """`user_badges` tem `group_id`: fundar dois clubes gera duas linhas de
    `founder`. O perfil listava o badge repetido, com a chave duplicada
    estourando no React — e o limite de 12 gastava espaço com repetição.
    """

    @staticmethod
    def _db_for(user: object, badge_rows: list[object]) -> AsyncMock:
        """Sessão mock que responde as três consultas de `get_public_profile`.

        Na ordem: o usuário, a contagem de reviews e as linhas de badge.
        """
        user_result = MagicMock()
        user_result.scalar_one_or_none.return_value = user

        count_result = MagicMock()
        count_result.scalar_one.return_value = 0

        badges_result = MagicMock()
        badges_result.__iter__ = lambda _self: iter(badge_rows)

        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[user_result, count_result, badges_result])
        return db

    @staticmethod
    def _row(slug: str, name: str, emoji: str | None, count: int) -> MagicMock:
        row = MagicMock()
        row.slug = slug
        row.name = name
        row.emoji = emoji
        row.count = count
        return row

    @pytest.mark.asyncio
    async def test_agrupa_o_mesmo_badge_de_clubes_diferentes(self) -> None:
        user = make_user(is_active=True)
        db = self._db_for(user, [self._row("founder", "Fundador", "🏗️", 2)])

        profile = await get_public_profile(db=db, user_id=user.id)

        assert len(profile["badges"]) == 1
        assert profile["badges"][0]["slug"] == "founder"
        assert profile["badges"][0]["count"] == 2

    @pytest.mark.asyncio
    async def test_expoe_o_nome_legivel_e_nao_so_o_slug(self) -> None:
        user = make_user(is_active=True)
        db = self._db_for(user, [self._row("speed_reader", "Leitor Veloz", "⚡", 1)])

        profile = await get_public_profile(db=db, user_id=user.id)

        assert profile["badges"][0]["name"] == "Leitor Veloz"

    @pytest.mark.asyncio
    async def test_consulta_agrupa_por_badge(self) -> None:
        """A dedup precisa acontecer no SQL: com `LIMIT` sobre linhas cruas,
        um badge repetido consumiria vagas das conquistas distintas.
        """
        user = make_user(is_active=True)
        db = self._db_for(user, [])

        await get_public_profile(db=db, user_id=user.id)

        sql = str(db.execute.await_args_list[2].args[0])
        assert "GROUP BY" in sql.upper()
