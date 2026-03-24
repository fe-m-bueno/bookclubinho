"""Testes unitarios para os endpoints e servicos de grupo."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.db.models.group import GroupRole
from app.schemas.group import GroupJoinRequest
from app.services.group import GroupError
from tests.conftest import make_user, mock_db_returning

# ── helpers ────────────────────────────────────────────────────────────────────


def _make_group(**overrides: object) -> MagicMock:
    """Cria um mock de Group com defaults sensiveis."""
    group = MagicMock()
    group.id = overrides.get("id", uuid.uuid4())
    group.name = overrides.get("name", "Clube Literário")
    group.description = overrides.get("description")
    group.photo_url = overrides.get("photo_url")
    group.invite_code = overrides.get("invite_code", "ABCD2345")
    group.max_members = overrides.get("max_members", 8)
    group.is_active = overrides.get("is_active", True)
    group.members = overrides.get("members", [])
    group.created_at = overrides.get("created_at", datetime(2026, 1, 1, tzinfo=UTC))
    group.created_by = overrides.get("created_by", uuid.uuid4())
    return group


def _make_member(
    user_id: uuid.UUID | None = None,
    group_id: uuid.UUID | None = None,
    role: str = "member",
    **overrides: object,
) -> MagicMock:
    """Cria um mock de GroupMember."""
    member = MagicMock()
    member.user_id = user_id or uuid.uuid4()
    member.group_id = group_id or uuid.uuid4()
    member.role = role
    member.joined_at = overrides.get("joined_at", datetime(2026, 1, 1, tzinfo=UTC))
    member.user = overrides.get("user", make_user(id=member.user_id))
    member.group = overrides.get("group")
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
        mock_db = mock_db_returning(group)

        result = await validate_group_code(db=mock_db, code="ABCD2345")
        assert result is group

    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(self) -> None:
        from app.services.group import validate_group_code

        mock_db = mock_db_returning(None)

        with pytest.raises(GroupError, match="não encontrado") as exc_info:
            await validate_group_code(db=mock_db, code="ZZZZZZZZ")
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_raises_410_when_inactive(self) -> None:
        from app.services.group import validate_group_code

        group = _make_group(is_active=False)
        mock_db = mock_db_returning(group)

        with pytest.raises(GroupError, match="desativado") as exc_info:
            await validate_group_code(db=mock_db, code="ABCD2345")
        assert exc_info.value.status_code == 410


# ── Service: join_group ──────────────────────────────────────────────────────


class TestJoinGroup:
    @pytest.mark.asyncio
    async def test_success(self) -> None:
        from app.services.group import join_group

        user = make_user()
        group = _make_group(invite_code="ABCD2345", members=[])
        mock_db = mock_db_returning(group)

        result = await join_group(db=mock_db, user=user, invite_code="ABCD2345")
        assert result is group
        mock_db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_raises_409_already_member(self) -> None:
        from app.services.group import join_group

        user = make_user()
        member = _make_member(user_id=user.id, group_id=uuid.uuid4())
        group = _make_group(invite_code="ABCD2345", members=[member])
        mock_db = mock_db_returning(group)

        with pytest.raises(GroupError, match="já faz parte") as exc_info:
            await join_group(db=mock_db, user=user, invite_code="ABCD2345")
        assert exc_info.value.status_code == 409

    @pytest.mark.asyncio
    async def test_raises_403_group_full(self) -> None:
        from app.services.group import join_group

        user = make_user()
        other_members = [
            _make_member(user_id=uuid.uuid4(), group_id=uuid.uuid4()) for _ in range(8)
        ]
        group = _make_group(invite_code="ABCD2345", members=other_members, max_members=8)
        mock_db = mock_db_returning(group)

        with pytest.raises(GroupError, match="está cheio") as exc_info:
            await join_group(db=mock_db, user=user, invite_code="ABCD2345")
        assert exc_info.value.status_code == 403


# ── Dependency: get_group_membership ─────────────────────────────────────────


class TestGetGroupMembership:
    @pytest.mark.asyncio
    async def test_returns_member(self) -> None:
        from app.core.deps import get_group_membership

        user = make_user()
        member = _make_member(user_id=user.id, group_id=uuid.uuid4())
        mock_db = mock_db_returning(member)

        result = await get_group_membership(group_id=member.group_id, user=user, db=mock_db)
        assert result is member

    @pytest.mark.asyncio
    async def test_raises_404_when_not_member(self) -> None:
        from app.core.deps import get_group_membership

        user = make_user()
        mock_db = mock_db_returning(None)

        with pytest.raises(HTTPException) as exc_info:
            await get_group_membership(group_id=uuid.uuid4(), user=user, db=mock_db)
        assert exc_info.value.status_code == 404


class TestGetGroupAdminMembership:
    @pytest.mark.asyncio
    async def test_returns_admin(self) -> None:
        from app.core.deps import get_group_admin_membership

        member = _make_member(role=GroupRole.ADMIN)
        result = await get_group_admin_membership(member=member)
        assert result is member

    @pytest.mark.asyncio
    async def test_raises_403_for_non_admin(self) -> None:
        from app.core.deps import get_group_admin_membership

        member = _make_member(role=GroupRole.MEMBER)
        with pytest.raises(HTTPException) as exc_info:
            await get_group_admin_membership(member=member)
        assert exc_info.value.status_code == 403


# ── Service: create_group ────────────────────────────────────────────────────


class TestCreateGroup:
    @pytest.mark.asyncio
    async def test_success_without_photo(self) -> None:
        from app.services.group import create_group

        user = make_user()
        # First call: _generate_unique_code check (no collision)
        # The mock needs to return None for code uniqueness check
        mock_db = AsyncMock()
        result_no_collision = MagicMock()
        result_no_collision.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=result_no_collision)

        group = await create_group(db=mock_db, user=user, name="Meu Clube")
        assert group.name == "Meu Clube"
        assert group.description is None
        assert group.photo_url is None
        assert mock_db.add.call_count == 2  # group + member

    @pytest.mark.asyncio
    async def test_success_with_photo(self) -> None:
        from app.services.group import create_group

        user = make_user()
        mock_db = AsyncMock()
        result_no_collision = MagicMock()
        result_no_collision.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=result_no_collision)

        with patch(
            "app.services.group.upload_file",
            return_value="https://cdn.example.com/groups/test.webp",
        ):
            group = await create_group(
                db=mock_db,
                user=user,
                name="Clube Foto",
                photo_data=b"fake-image-data",
                photo_content_type="image/png",
            )
        assert group.photo_url == "https://cdn.example.com/groups/test.webp"

    @pytest.mark.asyncio
    async def test_name_too_short_raises(self) -> None:
        from app.services.group import create_group

        user = make_user()
        mock_db = AsyncMock()

        with pytest.raises(GroupError, match="entre 2 e 60") as exc_info:
            await create_group(db=mock_db, user=user, name="A")
        assert exc_info.value.status_code == 422

    @pytest.mark.asyncio
    async def test_name_too_long_raises(self) -> None:
        from app.services.group import create_group

        user = make_user()
        mock_db = AsyncMock()

        with pytest.raises(GroupError, match="entre 2 e 60") as exc_info:
            await create_group(db=mock_db, user=user, name="X" * 61)
        assert exc_info.value.status_code == 422

    @pytest.mark.asyncio
    async def test_description_too_long_raises(self) -> None:
        from app.services.group import create_group

        user = make_user()
        mock_db = AsyncMock()
        result_no_collision = MagicMock()
        result_no_collision.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=result_no_collision)

        with pytest.raises(GroupError, match="500 caracteres") as exc_info:
            await create_group(db=mock_db, user=user, name="Clube OK", description="X" * 501)
        assert exc_info.value.status_code == 422

    @pytest.mark.asyncio
    async def test_photo_too_large_raises(self) -> None:
        from app.services.group import create_group

        user = make_user()
        mock_db = AsyncMock()
        result_no_collision = MagicMock()
        result_no_collision.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=result_no_collision)

        with pytest.raises(GroupError, match="5 MB") as exc_info:
            await create_group(
                db=mock_db,
                user=user,
                name="Clube Grande",
                photo_data=b"x" * (5 * 1024 * 1024 + 1),
            )
        assert exc_info.value.status_code == 422

    @pytest.mark.asyncio
    async def test_invite_code_collision_retry(self) -> None:
        from app.services.group import create_group

        user = make_user()
        mock_db = AsyncMock()

        # First two calls: collision (returns existing id), third: no collision
        collision_result = MagicMock()
        collision_result.scalar_one_or_none.return_value = uuid.uuid4()
        no_collision_result = MagicMock()
        no_collision_result.scalar_one_or_none.return_value = None

        mock_db.execute = AsyncMock(
            side_effect=[collision_result, collision_result, no_collision_result]
        )

        group = await create_group(db=mock_db, user=user, name="Retry Clube")
        assert group.name == "Retry Clube"


# ── Service: list_user_groups ────────────────────────────────────────────────


class TestListUserGroups:
    @pytest.mark.asyncio
    async def test_returns_active_groups(self) -> None:
        from app.services.group import list_user_groups

        user = make_user()
        group = _make_group()
        membership = _make_member(user_id=user.id, group_id=group.id, group=group)

        mock_db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = [membership]
        mock_db.execute = AsyncMock(return_value=result)

        groups = await list_user_groups(db=mock_db, user=user)
        assert len(groups) == 1
        assert groups[0] is group

    @pytest.mark.asyncio
    async def test_empty_list(self) -> None:
        from app.services.group import list_user_groups

        user = make_user()
        mock_db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        mock_db.execute = AsyncMock(return_value=result)

        groups = await list_user_groups(db=mock_db, user=user)
        assert groups == []

    @pytest.mark.asyncio
    async def test_returns_only_query_results(self) -> None:
        """Inactive groups are filtered at the SQL level (JOIN on is_active)."""
        from app.services.group import list_user_groups

        user = make_user()
        active_group = _make_group(is_active=True)
        m1 = _make_member(user_id=user.id, group=active_group)

        mock_db = AsyncMock()
        result = MagicMock()
        # SQL already filters out inactive groups, so mock only returns active
        result.scalars.return_value.all.return_value = [m1]
        mock_db.execute = AsyncMock(return_value=result)

        groups = await list_user_groups(db=mock_db, user=user)
        assert len(groups) == 1
        assert groups[0] is active_group


# ── Service: get_group_detail ────────────────────────────────────────────────


class TestGetGroupDetail:
    @pytest.mark.asyncio
    async def test_returns_group(self) -> None:
        from app.services.group import get_group_detail

        group_id = uuid.uuid4()
        group = _make_group(id=group_id)
        mock_db = mock_db_returning(group)

        result = await get_group_detail(db=mock_db, group_id=group_id)
        assert result is group

    @pytest.mark.asyncio
    async def test_raises_404_not_found(self) -> None:
        from app.services.group import get_group_detail

        mock_db = mock_db_returning(None)

        with pytest.raises(GroupError, match="não encontrado") as exc_info:
            await get_group_detail(db=mock_db, group_id=uuid.uuid4())
        assert exc_info.value.status_code == 404


# ── Service: update_group ────────────────────────────────────────────────────


class TestUpdateGroup:
    @pytest.mark.asyncio
    async def test_update_name(self) -> None:
        from app.services.group import update_group

        group_id = uuid.uuid4()
        group = _make_group(id=group_id, name="Old Name")
        mock_db = mock_db_returning(group)

        result = await update_group(db=mock_db, group_id=group_id, name="New Name")
        assert result.name == "New Name"

    @pytest.mark.asyncio
    async def test_update_description(self) -> None:
        from app.services.group import update_group

        group_id = uuid.uuid4()
        group = _make_group(id=group_id)
        mock_db = mock_db_returning(group)

        result = await update_group(db=mock_db, group_id=group_id, description="Nova desc")
        assert result.description == "Nova desc"

    @pytest.mark.asyncio
    async def test_update_photo(self) -> None:
        from app.services.group import update_group

        group_id = uuid.uuid4()
        group = _make_group(id=group_id)
        mock_db = mock_db_returning(group)

        with patch(
            "app.services.group.upload_file",
            return_value="https://cdn.example.com/groups/new.webp",
        ):
            result = await update_group(
                db=mock_db,
                group_id=group_id,
                photo_data=b"new-image",
                photo_content_type="image/png",
            )
        assert result.photo_url == "https://cdn.example.com/groups/new.webp"

    @pytest.mark.asyncio
    async def test_raises_404_not_found(self) -> None:
        from app.services.group import update_group

        mock_db = mock_db_returning(None)

        with pytest.raises(GroupError, match="não encontrado"):
            await update_group(db=mock_db, group_id=uuid.uuid4(), name="Nope")


# ── Service: soft_delete_group ───────────────────────────────────────────────


class TestSoftDeleteGroup:
    @pytest.mark.asyncio
    async def test_sets_inactive(self) -> None:
        from app.services.group import soft_delete_group

        group_id = uuid.uuid4()
        group = _make_group(id=group_id)
        mock_db = mock_db_returning(group)

        await soft_delete_group(db=mock_db, group_id=group_id)
        assert group.is_active is False

    @pytest.mark.asyncio
    async def test_raises_404_not_found(self) -> None:
        from app.services.group import soft_delete_group

        mock_db = mock_db_returning(None)

        with pytest.raises(GroupError, match="não encontrado"):
            await soft_delete_group(db=mock_db, group_id=uuid.uuid4())


# ── Endpoint: GET /groups/validate/{code} ────────────────────────────────────


class TestValidateCodeEndpoint:
    @pytest.mark.asyncio
    async def test_success(self) -> None:
        from app.api.v1.endpoints.groups import validate_code
        from app.schemas.group import GroupValidateResponse

        group = _make_group(name="Meu Clube", photo_url=None, members=[MagicMock()])
        mock_db = AsyncMock()

        with patch(
            "app.api.v1.endpoints.groups.validate_group_code",
            new_callable=AsyncMock,
            return_value=group,
        ):
            result = await validate_code(code="ABCD2345", db=mock_db)

        assert isinstance(result, GroupValidateResponse)
        assert result.valid is True
        assert result.name == "Meu Clube"
        assert result.member_count == 1

    @pytest.mark.asyncio
    async def test_invalid_code_returns_valid_false(self) -> None:
        from app.api.v1.endpoints.groups import validate_code
        from app.schemas.group import GroupValidateResponse

        mock_db = AsyncMock()

        with patch(
            "app.api.v1.endpoints.groups.validate_group_code",
            new_callable=AsyncMock,
            side_effect=GroupError("Clube não encontrado.", status_code=404),
        ):
            result = await validate_code(code="ZZZZZZZZ", db=mock_db)

        assert isinstance(result, GroupValidateResponse)
        assert result.valid is False
        assert result.name is None
        assert result.member_count == 0

    @pytest.mark.asyncio
    async def test_inactive_group_returns_valid_false(self) -> None:
        from app.api.v1.endpoints.groups import validate_code
        from app.schemas.group import GroupValidateResponse

        mock_db = AsyncMock()

        with patch(
            "app.api.v1.endpoints.groups.validate_group_code",
            new_callable=AsyncMock,
            side_effect=GroupError("Este clube foi desativado.", status_code=410),
        ):
            result = await validate_code(code="ABCD2345", db=mock_db)

        assert isinstance(result, GroupValidateResponse)
        assert result.valid is False


# ── Endpoint: POST /groups/join ──────────────────────────────────────────────


class TestJoinGroupEndpoint:
    @pytest.mark.asyncio
    async def test_success(self) -> None:
        from app.api.v1.endpoints.groups import join_group_endpoint
        from app.schemas.group import GroupJoinResponse

        group = _make_group()
        mock_db = AsyncMock()
        mock_user = make_user()
        body = GroupJoinRequest(invite_code="ABCD2345")

        with patch(
            "app.api.v1.endpoints.groups.join_group",
            new_callable=AsyncMock,
            return_value=group,
        ):
            result = await join_group_endpoint(body=body, db=mock_db, user=mock_user)

        assert isinstance(result, GroupJoinResponse)
        assert result.message == "Você entrou no clube!"
        assert result.group_id == str(group.id)

    @pytest.mark.asyncio
    async def test_409_already_member(self) -> None:
        from app.api.v1.endpoints.groups import join_group_endpoint

        mock_db = AsyncMock()
        mock_user = make_user()
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
        from app.api.v1.endpoints.groups import join_group_endpoint

        mock_db = AsyncMock()
        mock_user = make_user()
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


# ── Endpoint: POST /groups/ (create) ────────────────────────────────────────


class TestCreateGroupEndpoint:
    @pytest.mark.asyncio
    async def test_success(self) -> None:
        from app.api.v1.endpoints.groups import create_group_endpoint
        from app.schemas.group import GroupCreateResponse

        group = _make_group(name="Novo Clube")
        mock_db = AsyncMock()
        mock_user = make_user()

        with (
            patch(
                "app.api.v1.endpoints.groups.create_group",
                new_callable=AsyncMock,
                return_value=group,
            ),
            patch("app.api.v1.endpoints.groups.check_and_award_badges", new_callable=AsyncMock),
        ):
            from fastapi import BackgroundTasks

            result = await create_group_endpoint(
                db=mock_db,
                user=mock_user,
                name="Novo Clube",
                background_tasks=BackgroundTasks(),
            )

        assert isinstance(result, GroupCreateResponse)
        assert result.name == "Novo Clube"
        assert result.invite_code == group.invite_code

    @pytest.mark.asyncio
    async def test_validation_error(self) -> None:
        from app.api.v1.endpoints.groups import create_group_endpoint

        mock_db = AsyncMock()
        mock_user = make_user()

        with (
            patch(
                "app.api.v1.endpoints.groups.create_group",
                new_callable=AsyncMock,
                side_effect=GroupError("Nome deve ter entre 2 e 60 caracteres.", status_code=422),
            ),
            patch("app.api.v1.endpoints.groups.check_and_award_badges", new_callable=AsyncMock),
            pytest.raises(HTTPException) as exc_info,
        ):
            from fastapi import BackgroundTasks

            await create_group_endpoint(
                db=mock_db, user=mock_user, name="A", background_tasks=BackgroundTasks()
            )

        assert exc_info.value.status_code == 422

    @pytest.mark.asyncio
    async def test_commit_before_badge_check(self) -> None:
        """db.commit() deve ser chamado antes de agendar check_and_award_badges.

        Garante que a badge founder não sofre race condition: o BackgroundTask
        abre sessão própria e só enxerga dados já commitados.
        """
        from fastapi import BackgroundTasks

        from app.api.v1.endpoints.groups import create_group_endpoint

        group = _make_group(name="Clube Fundador")
        call_order: list[str] = []

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock(side_effect=lambda: call_order.append("commit"))
        mock_user = make_user()

        async def _fake_badge(*_args: object, **_kwargs: object) -> None:
            call_order.append("badge")

        with (
            patch(
                "app.api.v1.endpoints.groups.create_group",
                new_callable=AsyncMock,
                return_value=group,
            ),
            patch(
                "app.api.v1.endpoints.groups.check_and_award_badges",
                new=_fake_badge,
            ),
        ):
            bg = BackgroundTasks()
            await create_group_endpoint(
                db=mock_db,
                user=mock_user,
                name="Clube Fundador",
                background_tasks=bg,
            )
            # Executa as tasks pendentes para validar a ordem
            for task in bg.tasks:
                await task()

        mock_db.commit.assert_awaited_once()
        assert call_order == ["commit", "badge"], (
            "db.commit() deve ser chamado antes do badge check"
        )


# ── Endpoint: GET /groups/ (list) ────────────────────────────────────────────


class TestListGroupsEndpoint:
    @pytest.mark.asyncio
    async def test_returns_groups(self) -> None:
        from datetime import UTC, datetime

        from app.api.v1.endpoints.groups import list_groups_endpoint
        from app.schemas.group import GroupListResponse

        group = _make_group(name="Clube A", members=[MagicMock()])
        # members must have .user with display_name and avatar_url
        member = MagicMock()
        member.user_id = uuid.uuid4()
        member.user = make_user()
        group.members = [member]

        enriched = [
            {
                "group": group,
                "current_round": None,
                "my_reading_progress": None,
                "last_message": None,
                "last_activity_at": datetime(2026, 1, 1, tzinfo=UTC),
            }
        ]
        mock_db = AsyncMock()
        mock_user = make_user()

        with patch(
            "app.api.v1.endpoints.groups.list_user_groups_enriched",
            new_callable=AsyncMock,
            return_value=enriched,
        ):
            result = await list_groups_endpoint(db=mock_db, user=mock_user)

        assert isinstance(result, GroupListResponse)
        assert len(result.groups) == 1
        assert result.groups[0].name == "Clube A"

    @pytest.mark.asyncio
    async def test_returns_empty(self) -> None:
        from app.api.v1.endpoints.groups import list_groups_endpoint
        from app.schemas.group import GroupListResponse

        mock_db = AsyncMock()
        mock_user = make_user()

        with patch(
            "app.api.v1.endpoints.groups.list_user_groups_enriched",
            new_callable=AsyncMock,
            return_value=[],
        ):
            result = await list_groups_endpoint(db=mock_db, user=mock_user)

        assert isinstance(result, GroupListResponse)
        assert result.groups == []

    @pytest.mark.asyncio
    async def test_returns_enriched_fields(self) -> None:
        """GroupListItem must include members_preview, current_round, etc."""
        from datetime import UTC, datetime

        from app.api.v1.endpoints.groups import list_groups_endpoint
        from app.schemas.group import GroupListResponse

        group = _make_group(name="Clube B")
        member = MagicMock()
        member.user_id = uuid.uuid4()
        member.user = make_user(display_name="Alice")
        group.members = [member]

        round_mock = MagicMock()
        round_mock.id = uuid.uuid4()
        round_mock.round_number = 1
        round_mock.status = "reading"
        round_mock.book_title = "Dom Quixote"
        round_mock.book_author = "Cervantes"
        round_mock.book_cover_url = None
        round_mock.book_page_count = 400

        enriched = [
            {
                "group": group,
                "current_round": round_mock,
                "my_reading_progress": None,
                "last_message": None,
                "last_activity_at": datetime(2026, 1, 1, tzinfo=UTC),
            }
        ]
        mock_db = AsyncMock()
        mock_user = make_user()

        with patch(
            "app.api.v1.endpoints.groups.list_user_groups_enriched",
            new_callable=AsyncMock,
            return_value=enriched,
        ):
            result = await list_groups_endpoint(db=mock_db, user=mock_user)

        assert isinstance(result, GroupListResponse)
        item = result.groups[0]
        assert item.current_round is not None
        assert item.current_round.book_title == "Dom Quixote"
        assert len(item.members_preview) == 1


# ── Endpoint: GET /groups/{group_id} (detail) ───────────────────────────────


class TestGetGroupEndpoint:
    @pytest.mark.asyncio
    async def test_admin_sees_invite_code(self) -> None:
        from app.api.v1.endpoints.groups import get_group_endpoint
        from app.schemas.group import GroupDetailResponse

        group_id = uuid.uuid4()
        user = make_user()
        member_mock = _make_member(
            user_id=user.id,
            group_id=group_id,
            role=GroupRole.ADMIN,
        )
        group = _make_group(id=group_id, invite_code="SECRETCD", members=[member_mock])
        mock_db = AsyncMock()

        with patch(
            "app.api.v1.endpoints.groups.get_group_detail",
            new_callable=AsyncMock,
            return_value=group,
        ):
            result = await get_group_endpoint(db=mock_db, user=user, member=member_mock)

        assert isinstance(result, GroupDetailResponse)
        assert result.invite_code == "SECRETCD"
        assert result.current_user_id == str(user.id)

    @pytest.mark.asyncio
    async def test_member_does_not_see_invite_code(self) -> None:
        from app.api.v1.endpoints.groups import get_group_endpoint
        from app.schemas.group import GroupDetailResponse

        group_id = uuid.uuid4()
        user = make_user()
        member_mock = _make_member(
            user_id=user.id,
            group_id=group_id,
            role=GroupRole.MEMBER,
        )
        group = _make_group(id=group_id, invite_code="SECRETCD", members=[member_mock])
        mock_db = AsyncMock()

        with patch(
            "app.api.v1.endpoints.groups.get_group_detail",
            new_callable=AsyncMock,
            return_value=group,
        ):
            result = await get_group_endpoint(db=mock_db, user=user, member=member_mock)

        assert isinstance(result, GroupDetailResponse)
        assert result.invite_code is None


# ── Endpoint: PATCH /groups/{group_id} (update) ─────────────────────────────


class TestReadUpload:
    """Test _read_upload helper — ensures photo is read even when size is None.

    Uses real Starlette UploadFile (which is the class FastAPI actually receives
    at runtime) rather than MagicMock, to catch isinstance mismatches.
    """

    @pytest.mark.asyncio
    async def test_photo_with_none_size_is_still_read(self) -> None:
        """Bug: browser FormData uploads may have size=None on UploadFile.
        _read_upload must still read the file contents."""
        import io

        from starlette.datastructures import UploadFile

        from app.api.v1.endpoints.groups import _read_upload

        upload = UploadFile(
            file=io.BytesIO(b"fake-image-bytes"),
            filename="test.png",
            size=None,
            headers={"content-type": "image/png"},
        )

        photo_data, content_type = await _read_upload(upload)
        assert photo_data == b"fake-image-bytes"
        assert content_type == "image/png"

    @pytest.mark.asyncio
    async def test_photo_with_zero_size_is_still_read(self) -> None:
        """UploadFile with size=0 should still attempt to read."""
        import io

        from starlette.datastructures import UploadFile

        from app.api.v1.endpoints.groups import _read_upload

        upload = UploadFile(
            file=io.BytesIO(b"image-data"),
            filename="test.jpg",
            size=0,
            headers={"content-type": "image/jpeg"},
        )

        photo_data, content_type = await _read_upload(upload)
        assert photo_data == b"image-data"
        assert content_type == "image/jpeg"

    @pytest.mark.asyncio
    async def test_none_photo_returns_none(self) -> None:
        from app.api.v1.endpoints.groups import _read_upload

        photo_data, content_type = await _read_upload(None)
        assert photo_data is None
        assert content_type is None

    @pytest.mark.asyncio
    async def test_empty_read_returns_none(self) -> None:
        """If the uploaded file is empty, treat as no photo."""
        import io

        from starlette.datastructures import UploadFile

        from app.api.v1.endpoints.groups import _read_upload

        upload = UploadFile(
            file=io.BytesIO(b""),
            filename="empty.png",
            size=None,
            headers={"content-type": "image/png"},
        )

        photo_data, content_type = await _read_upload(upload)
        assert photo_data is None
        assert content_type is None


class TestUpdateGroupEndpoint:
    @pytest.mark.asyncio
    async def test_success(self) -> None:
        from app.api.v1.endpoints.groups import update_group_endpoint
        from app.schemas.group import MessageResponse

        group_id = uuid.uuid4()
        user = make_user()
        admin_mock = _make_member(user_id=user.id, group_id=group_id, role=GroupRole.ADMIN)
        group = _make_group(id=group_id, name="Updated")
        mock_db = AsyncMock()

        with patch(
            "app.api.v1.endpoints.groups.update_group",
            new_callable=AsyncMock,
            return_value=group,
        ):
            result = await update_group_endpoint(
                db=mock_db, user=user, admin=admin_mock, name="Updated"
            )

        assert isinstance(result, MessageResponse)
        assert result.message == "Clube atualizado com sucesso!"

    @pytest.mark.asyncio
    async def test_service_error(self) -> None:
        from app.api.v1.endpoints.groups import update_group_endpoint

        group_id = uuid.uuid4()
        user = make_user()
        admin_mock = _make_member(user_id=user.id, group_id=group_id, role=GroupRole.ADMIN)
        mock_db = AsyncMock()

        with (
            patch(
                "app.api.v1.endpoints.groups.update_group",
                new_callable=AsyncMock,
                side_effect=GroupError("Clube não encontrado.", status_code=404),
            ),
            pytest.raises(HTTPException) as exc_info,
        ):
            await update_group_endpoint(db=mock_db, user=user, admin=admin_mock, name="Nope")

        assert exc_info.value.status_code == 404


# ── Endpoint: DELETE /groups/{group_id} (delete) ────────────────────────────


class TestDeleteGroupEndpoint:
    @pytest.mark.asyncio
    async def test_success(self) -> None:
        from app.api.v1.endpoints.groups import delete_group_endpoint
        from app.schemas.group import MessageResponse

        group_id = uuid.uuid4()
        user = make_user()
        admin_mock = _make_member(user_id=user.id, group_id=group_id, role=GroupRole.ADMIN)
        mock_db = AsyncMock()

        with patch(
            "app.api.v1.endpoints.groups.soft_delete_group",
            new_callable=AsyncMock,
        ):
            result = await delete_group_endpoint(db=mock_db, user=user, admin=admin_mock)

        assert isinstance(result, MessageResponse)
        assert result.message == "Clube removido com sucesso!"

    @pytest.mark.asyncio
    async def test_service_error(self) -> None:
        from app.api.v1.endpoints.groups import delete_group_endpoint

        group_id = uuid.uuid4()
        user = make_user()
        admin_mock = _make_member(user_id=user.id, group_id=group_id, role=GroupRole.ADMIN)
        mock_db = AsyncMock()

        with (
            patch(
                "app.api.v1.endpoints.groups.soft_delete_group",
                new_callable=AsyncMock,
                side_effect=GroupError("Clube não encontrado.", status_code=404),
            ),
            pytest.raises(HTTPException) as exc_info,
        ):
            await delete_group_endpoint(db=mock_db, user=user, admin=admin_mock)

        assert exc_info.value.status_code == 404


# ── Service: leave_group ───────────────────────────────────────────────────


class TestLeaveGroup:
    @pytest.mark.asyncio
    async def test_leave_success(self) -> None:
        from app.services.group import leave_group

        user = make_user()
        group_id = uuid.uuid4()
        member = _make_member(user_id=user.id, group_id=group_id, role="member")
        admin = _make_member(
            user_id=uuid.uuid4(),
            group_id=group_id,
            role="admin",
        )
        group = _make_group(id=group_id, members=[admin, member])
        mock_db = mock_db_returning(group)
        mock_db.delete = AsyncMock()

        await leave_group(db=mock_db, user=user, group_id=group_id)
        mock_db.delete.assert_called_once_with(member)

    @pytest.mark.asyncio
    async def test_leave_only_admin_promotes_oldest(self) -> None:
        from app.services.group import leave_group

        user = make_user()
        group_id = uuid.uuid4()
        admin_member = _make_member(
            user_id=user.id,
            group_id=group_id,
            role="admin",
        )
        older_member = _make_member(
            user_id=uuid.uuid4(),
            group_id=group_id,
            role="member",
            joined_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        newer_member = _make_member(
            user_id=uuid.uuid4(),
            group_id=group_id,
            role="member",
            joined_at=datetime(2026, 6, 1, tzinfo=UTC),
        )
        group = _make_group(
            id=group_id, members=[admin_member, older_member, newer_member]
        )
        mock_db = mock_db_returning(group)
        mock_db.delete = AsyncMock()

        await leave_group(db=mock_db, user=user, group_id=group_id)
        assert older_member.role == "admin"
        mock_db.delete.assert_called_once_with(admin_member)

    @pytest.mark.asyncio
    async def test_leave_last_member_deactivates_group(self) -> None:
        from app.services.group import leave_group

        user = make_user()
        group_id = uuid.uuid4()
        member = _make_member(user_id=user.id, group_id=group_id, role="admin")
        group = _make_group(id=group_id, members=[member])
        mock_db = mock_db_returning(group)
        mock_db.delete = AsyncMock()

        await leave_group(db=mock_db, user=user, group_id=group_id)
        assert group.is_active is False
        mock_db.delete.assert_called_once_with(member)

    @pytest.mark.asyncio
    async def test_leave_admin_with_other_admins_no_promotion(self) -> None:
        from app.services.group import leave_group

        user = make_user()
        group_id = uuid.uuid4()
        admin1 = _make_member(user_id=user.id, group_id=group_id, role="admin")
        admin2 = _make_member(user_id=uuid.uuid4(), group_id=group_id, role="admin")
        regular = _make_member(user_id=uuid.uuid4(), group_id=group_id, role="member")
        group = _make_group(id=group_id, members=[admin1, admin2, regular])
        mock_db = mock_db_returning(group)
        mock_db.delete = AsyncMock()

        await leave_group(db=mock_db, user=user, group_id=group_id)
        assert regular.role == "member"
        mock_db.delete.assert_called_once_with(admin1)

    @pytest.mark.asyncio
    async def test_leave_not_member_raises_404(self) -> None:
        from app.services.group import leave_group

        user = make_user()
        group_id = uuid.uuid4()
        other = _make_member(user_id=uuid.uuid4(), group_id=group_id)
        group = _make_group(id=group_id, members=[other])
        mock_db = mock_db_returning(group)

        with pytest.raises(GroupError, match="não encontrado") as exc_info:
            await leave_group(db=mock_db, user=user, group_id=group_id)
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_leave_group_not_found_raises_404(self) -> None:
        from app.services.group import leave_group

        user = make_user()
        mock_db = mock_db_returning(None)

        with pytest.raises(GroupError, match="não encontrado") as exc_info:
            await leave_group(db=mock_db, user=user, group_id=uuid.uuid4())
        assert exc_info.value.status_code == 404


# ── Endpoint: POST /groups/{group_id}/leave ──────────────────────────────────


class TestLeaveGroupEndpoint:
    @pytest.mark.asyncio
    async def test_success(self) -> None:
        from app.api.v1.endpoints.groups import leave_group_endpoint
        from app.schemas.group import MessageResponse

        group_id = uuid.uuid4()
        user = make_user()
        member_mock = _make_member(user_id=user.id, group_id=group_id)
        mock_db = AsyncMock()

        with patch(
            "app.api.v1.endpoints.groups.leave_group",
            new_callable=AsyncMock,
        ):
            result = await leave_group_endpoint(
                db=mock_db, user=user, member=member_mock
            )

        assert isinstance(result, MessageResponse)
        assert result.message == "Você saiu do clube."

    @pytest.mark.asyncio
    async def test_service_error(self) -> None:
        from app.api.v1.endpoints.groups import leave_group_endpoint

        group_id = uuid.uuid4()
        user = make_user()
        member_mock = _make_member(user_id=user.id, group_id=group_id)
        mock_db = AsyncMock()

        with (
            patch(
                "app.api.v1.endpoints.groups.leave_group",
                new_callable=AsyncMock,
                side_effect=GroupError("Clube não encontrado.", status_code=404),
            ),
            pytest.raises(HTTPException) as exc_info,
        ):
            await leave_group_endpoint(db=mock_db, user=user, member=member_mock)

        assert exc_info.value.status_code == 404


# ── Service: regenerate_invite_code ──────────────────────────────────────────


class TestRegenerateInviteCode:
    @pytest.mark.asyncio
    async def test_regenerate_success(self) -> None:
        from app.services.group import regenerate_invite_code

        group_id = uuid.uuid4()
        group = _make_group(id=group_id, invite_code="OLDCODE1")

        # First call: select Group (returns group)
        # Second call: select Group.id collision check (returns None = no collision)
        mock_db = AsyncMock()
        group_result = MagicMock()
        group_result.scalar_one_or_none.return_value = group
        no_collision = MagicMock()
        no_collision.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(side_effect=[group_result, no_collision])

        with patch(
            "app.services.group._upload_qr_code",
            new_callable=AsyncMock,
            return_value="https://cdn.example.com/qrcodes/test.webp",
        ):
            code, qr_url = await regenerate_invite_code(db=mock_db, group_id=group_id)

        assert code != "OLDCODE1"
        assert len(code) == 8
        assert qr_url == "https://cdn.example.com/qrcodes/test.webp"
        assert group.invite_code == code

    @pytest.mark.asyncio
    async def test_regenerate_retries_on_collision(self) -> None:
        from app.services.group import regenerate_invite_code

        group_id = uuid.uuid4()
        group = _make_group(id=group_id)

        mock_db = AsyncMock()
        group_result = MagicMock()
        group_result.scalar_one_or_none.return_value = group
        collision = MagicMock()
        collision.scalar_one_or_none.return_value = uuid.uuid4()
        no_collision = MagicMock()
        no_collision.scalar_one_or_none.return_value = None

        mock_db.execute = AsyncMock(
            side_effect=[group_result, collision, collision, no_collision]
        )

        with patch(
            "app.services.group._upload_qr_code",
            new_callable=AsyncMock,
            return_value="https://cdn.example.com/qrcodes/test.webp",
        ):
            code, qr_url = await regenerate_invite_code(db=mock_db, group_id=group_id)

        assert len(code) == 8
        assert mock_db.execute.call_count == 4  # 1 group + 2 collisions + 1 success

    @pytest.mark.asyncio
    async def test_regenerate_exhausts_retries(self) -> None:
        from app.services.group import regenerate_invite_code

        group_id = uuid.uuid4()
        group = _make_group(id=group_id)

        mock_db = AsyncMock()
        group_result = MagicMock()
        group_result.scalar_one_or_none.return_value = group
        collision = MagicMock()
        collision.scalar_one_or_none.return_value = uuid.uuid4()

        mock_db.execute = AsyncMock(
            side_effect=[group_result] + [collision] * 5
        )

        with pytest.raises(GroupError, match="código único") as exc_info:
            await regenerate_invite_code(db=mock_db, group_id=group_id)
        assert exc_info.value.status_code == 500

    @pytest.mark.asyncio
    async def test_regenerate_group_not_found(self) -> None:
        from app.services.group import regenerate_invite_code

        mock_db = mock_db_returning(None)

        with pytest.raises(GroupError, match="não encontrado") as exc_info:
            await regenerate_invite_code(db=mock_db, group_id=uuid.uuid4())
        assert exc_info.value.status_code == 404


# ── Service: get_qr_url ─────────────────────────────────────────────────────


class TestGetQrUrl:
    def test_returns_deterministic_url(self) -> None:
        from app.services.group import get_qr_url

        group_id = uuid.UUID("12345678-1234-1234-1234-123456789abc")
        with patch(
            "app.services.group.get_public_url",
            side_effect=lambda p: f"https://cdn.example.com/{p}",
        ):
            result = get_qr_url(group_id)
        assert result == "https://cdn.example.com/qrcodes/12345678-1234-1234-1234-123456789abc.webp"


# ── Endpoint: POST /groups/{group_id}/regenerate-code ────────────────────────


class TestRegenerateCodeEndpoint:
    @pytest.mark.asyncio
    async def test_success(self) -> None:
        from app.api.v1.endpoints.groups import regenerate_code_endpoint
        from app.schemas.group import RegenerateCodeResponse

        group_id = uuid.uuid4()
        user = make_user()
        admin_mock = _make_member(user_id=user.id, group_id=group_id, role=GroupRole.ADMIN)
        mock_db = AsyncMock()

        with patch(
            "app.api.v1.endpoints.groups.regenerate_invite_code",
            new_callable=AsyncMock,
            return_value=("NEWCODE1", "https://cdn.example.com/qrcodes/test.webp"),
        ):
            result = await regenerate_code_endpoint(
                db=mock_db, user=user, admin=admin_mock
            )

        assert isinstance(result, RegenerateCodeResponse)
        assert result.invite_code == "NEWCODE1"
        assert result.qr_url == "https://cdn.example.com/qrcodes/test.webp"

    @pytest.mark.asyncio
    async def test_service_error(self) -> None:
        from app.api.v1.endpoints.groups import regenerate_code_endpoint

        group_id = uuid.uuid4()
        user = make_user()
        admin_mock = _make_member(user_id=user.id, group_id=group_id, role=GroupRole.ADMIN)
        mock_db = AsyncMock()

        with (
            patch(
                "app.api.v1.endpoints.groups.regenerate_invite_code",
                new_callable=AsyncMock,
                side_effect=GroupError("Clube não encontrado.", status_code=404),
            ),
            pytest.raises(HTTPException) as exc_info,
        ):
            await regenerate_code_endpoint(db=mock_db, user=user, admin=admin_mock)

        assert exc_info.value.status_code == 404


# ── Endpoint: GET /groups/{group_id}/qr ──────────────────────────────────────


class TestGetQrEndpoint:
    @pytest.mark.asyncio
    async def test_returns_qr_url(self) -> None:
        from app.api.v1.endpoints.groups import get_qr_endpoint
        from app.schemas.group import QrCodeResponse

        group_id = uuid.uuid4()
        user = make_user()
        member_mock = _make_member(user_id=user.id, group_id=group_id)

        with patch(
            "app.api.v1.endpoints.groups.get_qr_url",
            return_value="https://cdn.example.com/qrcodes/test.webp",
        ):
            result = await get_qr_endpoint(user=user, member=member_mock)

        assert isinstance(result, QrCodeResponse)
        assert result.qr_url == "https://cdn.example.com/qrcodes/test.webp"


# ── Service: update_member_role ──────────────────────────────────────────────


class TestUpdateMemberRole:
    @pytest.mark.asyncio
    async def test_promote_member_to_admin(self) -> None:
        from app.services.group import update_member_role

        admin_id = uuid.uuid4()
        target_id = uuid.uuid4()
        group_id = uuid.uuid4()

        admin = _make_member(user_id=admin_id, group_id=group_id, role="admin")
        target = _make_member(user_id=target_id, group_id=group_id, role="member")
        group = _make_group(id=group_id, members=[admin, target])
        mock_db = mock_db_returning(group)

        result = await update_member_role(
            db=mock_db,
            group_id=group_id,
            target_user_id=target_id,
            new_role="admin",
            requesting_user_id=admin_id,
        )
        assert result.role == "admin"

    @pytest.mark.asyncio
    async def test_demote_admin_to_member(self) -> None:
        from app.services.group import update_member_role

        admin1_id = uuid.uuid4()
        admin2_id = uuid.uuid4()
        group_id = uuid.uuid4()

        admin1 = _make_member(user_id=admin1_id, group_id=group_id, role="admin")
        admin2 = _make_member(user_id=admin2_id, group_id=group_id, role="admin")
        group = _make_group(id=group_id, members=[admin1, admin2])
        mock_db = mock_db_returning(group)

        result = await update_member_role(
            db=mock_db,
            group_id=group_id,
            target_user_id=admin2_id,
            new_role="member",
            requesting_user_id=admin1_id,
        )
        assert result.role == "member"

    @pytest.mark.asyncio
    async def test_demote_last_admin_raises_403(self) -> None:
        from app.services.group import update_member_role

        admin_id = uuid.uuid4()
        member_id = uuid.uuid4()
        group_id = uuid.uuid4()

        admin = _make_member(user_id=admin_id, group_id=group_id, role="admin")
        member = _make_member(user_id=member_id, group_id=group_id, role="member")
        group = _make_group(id=group_id, members=[admin, member])
        mock_db = mock_db_returning(group)

        with pytest.raises(GroupError, match="único admin") as exc_info:
            await update_member_role(
                db=mock_db,
                group_id=group_id,
                target_user_id=admin_id,
                new_role="member",
                requesting_user_id=admin_id,
            )
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_target_not_member_raises_404(self) -> None:
        from app.services.group import update_member_role

        admin_id = uuid.uuid4()
        group_id = uuid.uuid4()

        admin = _make_member(user_id=admin_id, group_id=group_id, role="admin")
        group = _make_group(id=group_id, members=[admin])
        mock_db = mock_db_returning(group)

        with pytest.raises(GroupError, match="não encontrado") as exc_info:
            await update_member_role(
                db=mock_db,
                group_id=group_id,
                target_user_id=uuid.uuid4(),
                new_role="admin",
                requesting_user_id=admin_id,
            )
        assert exc_info.value.status_code == 404


# ── Service: remove_group_member ─────────────────────────────────────────────


class TestRemoveGroupMember:
    @pytest.mark.asyncio
    async def test_remove_member_success(self) -> None:
        from app.services.group import remove_group_member

        admin_id = uuid.uuid4()
        target_id = uuid.uuid4()
        group_id = uuid.uuid4()

        admin = _make_member(user_id=admin_id, group_id=group_id, role="admin")
        target = _make_member(user_id=target_id, group_id=group_id, role="member")
        group = _make_group(id=group_id, members=[admin, target])
        mock_db = mock_db_returning(group)
        mock_db.delete = AsyncMock()

        await remove_group_member(
            db=mock_db,
            group_id=group_id,
            target_user_id=target_id,
            requesting_user_id=admin_id,
        )
        mock_db.delete.assert_called_once_with(target)

    @pytest.mark.asyncio
    async def test_admin_cannot_remove_self(self) -> None:
        from app.services.group import remove_group_member

        admin_id = uuid.uuid4()
        group_id = uuid.uuid4()

        with pytest.raises(GroupError, match="Sair do grupo") as exc_info:
            await remove_group_member(
                db=AsyncMock(),
                group_id=group_id,
                target_user_id=admin_id,
                requesting_user_id=admin_id,
            )
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_target_not_found_raises_404(self) -> None:
        from app.services.group import remove_group_member

        admin_id = uuid.uuid4()
        group_id = uuid.uuid4()

        admin = _make_member(user_id=admin_id, group_id=group_id, role="admin")
        group = _make_group(id=group_id, members=[admin])
        mock_db = mock_db_returning(group)

        with pytest.raises(GroupError, match="não encontrado") as exc_info:
            await remove_group_member(
                db=mock_db,
                group_id=group_id,
                target_user_id=uuid.uuid4(),
                requesting_user_id=admin_id,
            )
        assert exc_info.value.status_code == 404


# ── Endpoint: PATCH /groups/{group_id}/members/{user_id} ────────────────────


class TestUpdateMemberRoleEndpoint:
    @pytest.mark.asyncio
    async def test_success(self) -> None:
        from app.api.v1.endpoints.groups import update_member_role_endpoint
        from app.schemas.group import MemberRoleUpdateRequest, MemberRoleUpdateResponse

        group_id = uuid.uuid4()
        target_id = uuid.uuid4()
        user = make_user()
        admin_mock = _make_member(user_id=user.id, group_id=group_id, role=GroupRole.ADMIN)
        target_member = _make_member(user_id=target_id, group_id=group_id, role="admin")
        mock_db = AsyncMock()

        body = MemberRoleUpdateRequest(role="admin")

        with patch(
            "app.api.v1.endpoints.groups.update_member_role",
            new_callable=AsyncMock,
            return_value=target_member,
        ):
            result = await update_member_role_endpoint(
                user_id=target_id, body=body, db=mock_db, user=user, admin=admin_mock
            )

        assert isinstance(result, MemberRoleUpdateResponse)
        assert result.user_id == str(target_id)

    @pytest.mark.asyncio
    async def test_target_not_found(self) -> None:
        from app.api.v1.endpoints.groups import update_member_role_endpoint
        from app.schemas.group import MemberRoleUpdateRequest

        group_id = uuid.uuid4()
        user = make_user()
        admin_mock = _make_member(user_id=user.id, group_id=group_id, role=GroupRole.ADMIN)
        mock_db = AsyncMock()

        body = MemberRoleUpdateRequest(role="admin")

        with (
            patch(
                "app.api.v1.endpoints.groups.update_member_role",
                new_callable=AsyncMock,
                side_effect=GroupError("Membro não encontrado.", status_code=404),
            ),
            pytest.raises(HTTPException) as exc_info,
        ):
            await update_member_role_endpoint(
                user_id=uuid.uuid4(), body=body, db=mock_db, user=user, admin=admin_mock
            )
        assert exc_info.value.status_code == 404


# ── Endpoint: DELETE /groups/{group_id}/members/{user_id} ────────────────────


class TestRemoveGroupMemberEndpoint:
    @pytest.mark.asyncio
    async def test_success(self) -> None:
        from app.api.v1.endpoints.groups import remove_member_endpoint
        from app.schemas.group import MessageResponse

        group_id = uuid.uuid4()
        target_id = uuid.uuid4()
        user = make_user()
        admin_mock = _make_member(user_id=user.id, group_id=group_id, role=GroupRole.ADMIN)
        mock_db = AsyncMock()

        with patch(
            "app.api.v1.endpoints.groups.remove_group_member",
            new_callable=AsyncMock,
        ):
            result = await remove_member_endpoint(
                user_id=target_id, db=mock_db, user=user, admin=admin_mock
            )

        assert isinstance(result, MessageResponse)
        assert result.message == "Membro removido com sucesso!"

    @pytest.mark.asyncio
    async def test_current_user_id_in_group_detail(self) -> None:
        """Verify current_user_id is included in GET group detail response."""
        from app.api.v1.endpoints.groups import get_group_endpoint
        from app.schemas.group import GroupDetailResponse

        group_id = uuid.uuid4()
        user = make_user()
        member_mock = _make_member(
            user_id=user.id,
            group_id=group_id,
            role=GroupRole.MEMBER,
        )
        group = _make_group(id=group_id, members=[member_mock])
        mock_db = AsyncMock()

        with patch(
            "app.api.v1.endpoints.groups.get_group_detail",
            new_callable=AsyncMock,
            return_value=group,
        ):
            result = await get_group_endpoint(db=mock_db, user=user, member=member_mock)

        assert isinstance(result, GroupDetailResponse)
        assert result.current_user_id == str(user.id)
