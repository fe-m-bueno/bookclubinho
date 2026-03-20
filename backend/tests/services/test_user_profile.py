"""Testes de serviço para user_profile."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas.user import UserUpdate
from app.services.user_profile import ProfileError, update_user_profile
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
