"""Testes unitários para os endpoints e serviços de grupo."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from app.schemas.group import GroupJoinRequest
from app.services.group import GroupError

# ── helpers ────────────────────────────────────────────────────────────────────


def _mock_db_returning(value: object) -> AsyncMock:
    """AsyncSession mock cujo execute() retorna scalar_one_or_none = value."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    return db


def _make_user(**overrides: object) -> MagicMock:
    """Cria um mock de User com defaults sensíveis."""
    user = MagicMock()
    user.id = overrides.get("id", uuid.uuid4())
    user.username = overrides.get("username", "testuser")
    user.display_name = overrides.get("display_name", "Test User")
    user.preferred_genres = overrides.get("preferred_genres", ["fantasia"])
    user.onboarding_completed = overrides.get("onboarding_completed", False)
    return user


def _make_group(**overrides: object) -> MagicMock:
    """Cria um mock de Group com defaults sensíveis."""
    group = MagicMock()
    group.id = overrides.get("id", uuid.uuid4())
    group.name = overrides.get("name", "Clube Literário")
    group.photo_url = overrides.get("photo_url")
    group.invite_code = overrides.get("invite_code", "ABCD2345")
    group.max_members = overrides.get("max_members", 8)
    group.members = overrides.get("members", [])
    return group


def _make_member(user_id: uuid.UUID, group_id: uuid.UUID) -> MagicMock:
    """Cria um mock de GroupMember."""
    member = MagicMock()
    member.user_id = user_id
    member.group_id = group_id
    member.role = "member"
    return member


# ── Schema: GroupJoinRequest ─────────────────────────────────────────────────


class TestGroupJoinRequest:
    def test_valid_code_uppercase(self) -> None:
        req = GroupJoinRequest(invite_code="abcd2345")
        assert req.invite_code == "ABCD2345"

    def test_valid_code_with_spaces(self) -> None:
        req = GroupJoinRequest(invite_code=" ABCD2345 ")
        assert req.invite_code == "ABCD2345"

    def test_code_too_short_raises(self) -> None:
        with pytest.raises(ValidationError, match="8 caracteres"):
            GroupJoinRequest(invite_code="ABC")

    def test_code_too_long_raises(self) -> None:
        with pytest.raises(ValidationError, match="8 caracteres"):
            GroupJoinRequest(invite_code="ABCDEFGHI")


# ── Service: validate_group_code ─────────────────────────────────────────────


class TestValidateGroupCode:
    @pytest.mark.asyncio
    async def test_returns_group_when_found(self) -> None:
        from app.services.group import validate_group_code

        group = _make_group()
        mock_db = _mock_db_returning(group)

        result = await validate_group_code(db=mock_db, code="ABCD2345")
        assert result is group

    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(self) -> None:
        from app.services.group import validate_group_code

        mock_db = _mock_db_returning(None)

        with pytest.raises(GroupError, match="não encontrado") as exc_info:
            await validate_group_code(db=mock_db, code="ZZZZZZZZ")
        assert exc_info.value.status_code == 404


# ── Service: join_group ──────────────────────────────────────────────────────


class TestJoinGroup:
    @pytest.mark.asyncio
    async def test_success(self) -> None:
        from app.services.group import join_group

        user = _make_user()
        group = _make_group(invite_code="ABCD2345", members=[])
        mock_db = _mock_db_returning(group)

        result = await join_group(db=mock_db, user=user, invite_code="ABCD2345")
        assert result is group
        mock_db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_raises_409_already_member(self) -> None:
        from app.services.group import join_group

        user = _make_user()
        member = _make_member(user_id=user.id, group_id=uuid.uuid4())
        group = _make_group(invite_code="ABCD2345", members=[member])
        mock_db = _mock_db_returning(group)

        with pytest.raises(GroupError, match="já faz parte") as exc_info:
            await join_group(db=mock_db, user=user, invite_code="ABCD2345")
        assert exc_info.value.status_code == 409

    @pytest.mark.asyncio
    async def test_raises_403_group_full(self) -> None:
        from app.services.group import join_group

        user = _make_user()
        other_members = [
            _make_member(user_id=uuid.uuid4(), group_id=uuid.uuid4())
            for _ in range(8)
        ]
        group = _make_group(
            invite_code="ABCD2345", members=other_members, max_members=8
        )
        mock_db = _mock_db_returning(group)

        with pytest.raises(GroupError, match="está cheio") as exc_info:
            await join_group(db=mock_db, user=user, invite_code="ABCD2345")
        assert exc_info.value.status_code == 403


# ── Endpoint: GET /groups/validate/{code} ────────────────────────────────────


class TestValidateCodeEndpoint:
    @pytest.mark.asyncio
    async def test_success(self) -> None:
        from app.api.v1.endpoints.groups import validate_code
        from app.schemas.group import GroupValidateResponse

        group = _make_group(name="Meu Clube", photo_url=None, members=[MagicMock()])
        mock_db = AsyncMock()
        mock_user = _make_user()

        with patch(
            "app.api.v1.endpoints.groups.validate_group_code",
            new_callable=AsyncMock,
            return_value=group,
        ):
            result = await validate_code(code="ABCD2345", db=mock_db, user=mock_user)

        assert isinstance(result, GroupValidateResponse)
        assert result.name == "Meu Clube"
        assert result.member_count == 1

    @pytest.mark.asyncio
    async def test_404_invalid_code(self) -> None:
        from fastapi import HTTPException

        from app.api.v1.endpoints.groups import validate_code

        mock_db = AsyncMock()
        mock_user = _make_user()

        with (
            patch(
                "app.api.v1.endpoints.groups.validate_group_code",
                new_callable=AsyncMock,
                side_effect=GroupError("Clube não encontrado.", status_code=404),
            ),
            pytest.raises(HTTPException) as exc_info,
        ):
            await validate_code(code="ZZZZZZZZ", db=mock_db, user=mock_user)

        assert exc_info.value.status_code == 404


# ── Endpoint: POST /groups/join ──────────────────────────────────────────────


class TestJoinGroupEndpoint:
    @pytest.mark.asyncio
    async def test_success(self) -> None:
        from app.api.v1.endpoints.groups import join_group_endpoint
        from app.schemas.group import GroupJoinResponse

        group = _make_group()
        mock_db = AsyncMock()
        mock_user = _make_user()
        body = GroupJoinRequest(invite_code="ABCD2345")

        with patch(
            "app.api.v1.endpoints.groups.join_group",
            new_callable=AsyncMock,
            return_value=group,
        ):
            result = await join_group_endpoint(
                body=body, db=mock_db, user=mock_user
            )

        assert isinstance(result, GroupJoinResponse)
        assert result.message == "Você entrou no clube!"
        assert result.group_id == str(group.id)

    @pytest.mark.asyncio
    async def test_409_already_member(self) -> None:
        from fastapi import HTTPException

        from app.api.v1.endpoints.groups import join_group_endpoint

        mock_db = AsyncMock()
        mock_user = _make_user()
        body = GroupJoinRequest(invite_code="ABCD2345")

        with (
            patch(
                "app.api.v1.endpoints.groups.join_group",
                new_callable=AsyncMock,
                side_effect=GroupError("Você já faz parte deste clube.", status_code=409),
            ),
            pytest.raises(HTTPException) as exc_info,
        ):
            await join_group_endpoint(body=body, db=mock_db, user=mock_user)

        assert exc_info.value.status_code == 409

    @pytest.mark.asyncio
    async def test_403_group_full(self) -> None:
        from fastapi import HTTPException

        from app.api.v1.endpoints.groups import join_group_endpoint

        mock_db = AsyncMock()
        mock_user = _make_user()
        body = GroupJoinRequest(invite_code="ABCD2345")

        with (
            patch(
                "app.api.v1.endpoints.groups.join_group",
                new_callable=AsyncMock,
                side_effect=GroupError("Este clube está cheio.", status_code=403),
            ),
            pytest.raises(HTTPException) as exc_info,
        ):
            await join_group_endpoint(body=body, db=mock_db, user=mock_user)

        assert exc_info.value.status_code == 403
